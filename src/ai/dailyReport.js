/**
 * التقرير اليومي على الواتساب.
 *
 * بعد سكّرة المطعم (ساعة السكّرة من الإعدادات + كم دقيقة) السيرفر بيجمع أرقام يوم العمل،
 * بيدوّر على أشياء غريبة (خصومات كتير من كاشير واحد، إلغاءات أكتر من العادة، فرق بالصندوق...)،
 * والذكاء الاصطناعي بيكتب رسالة قصيرة — وبتنبعت على أرقام المدير بالواتساب (Evolution).
 * الأرقام كلها بتنحسب بالسيرفر (مش من الموديل) — الموديل بس بيصيغها.
 * بدون ذكاء اصطناعي (أو لو صار خطأ) بتنبعت نسخة جاهزة بنفس الأرقام.
 */
const pool = require('../db/pool');
const ai = require('./providers');
const store = require('./store');
const whatsapp = require('../whatsapp');
const businessDay = require('../businessDay');

const TZ = businessDay.TZ;
const num = (v) => Math.round(Number(v || 0) * 100) / 100;
const money = (v) => `${Math.round(Number(v || 0)).toLocaleString('en-US')}₪`;
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

/** يوم العمل الحالي (YYYY-MM-DD) */
async function currentBusinessDay() {
  const { rows } = await pool.query(`SELECT to_char(ai_data.business_day(now()), 'YYYY-MM-DD') AS d`);
  return rows[0].d;
}

/* ---------------- جمع الأرقام ---------------- */

async function collect(day) {
  const q = (sql, p = [day]) => pool.query(sql, p).then((r) => r.rows);
  // المبيعات الحقيقية: مش ملغية، ومش طلب موقع لسا بيستنى تأكيد الواتساب
  const SOLD = `status <> 'cancelled' AND awaiting_wa = false`;

  const [t] = await q(`SELECT COUNT(*) FILTER (WHERE ${SOLD})::int AS orders,
                              COALESCE(SUM(total) FILTER (WHERE ${SOLD}), 0) AS revenue,
                              COALESCE(SUM(discount) FILTER (WHERE ${SOLD}), 0) AS discounts,
                              COUNT(*) FILTER (WHERE ${SOLD} AND discount > 0)::int AS discounted_orders,
                              COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
                              COALESCE(SUM(total) FILTER (WHERE status = 'cancelled'), 0) AS cancelled_amount,
                              COUNT(*) FILTER (WHERE ${SOLD} AND edited_by IS NOT NULL)::int AS edited
                         FROM ai_data.orders WHERE business_day = $1::date`);

  // المقارنة: نفس اليوم بالأسابيع الـ4 الماضية، ومبارح
  const weekday = await q(`SELECT business_day, COUNT(*)::int AS orders, SUM(total) AS revenue
                             FROM ai_data.orders
                            WHERE business_day IN ($1::date - 7, $1::date - 14, $1::date - 21, $1::date - 28) AND ${SOLD}
                            GROUP BY 1`);
  const [yesterday] = await q(`SELECT COUNT(*)::int AS orders, COALESCE(SUM(total), 0) AS revenue
                                 FROM ai_data.orders WHERE business_day = $1::date - 1 AND ${SOLD}`);
  // معدّلات آخر 28 يوم (بدون اليوم) — للمقارنة بالأشياء الغريبة
  const [base] = await q(`WITH d AS (
                            SELECT business_day,
                                   COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
                                   COALESCE(SUM(discount) FILTER (WHERE ${SOLD}), 0) AS discounts,
                                   COALESCE(SUM(total) FILTER (WHERE ${SOLD}), 0) AS revenue,
                                   COUNT(*) FILTER (WHERE ${SOLD} AND edited_by IS NOT NULL) AS edited
                              FROM ai_data.orders
                             WHERE business_day BETWEEN $1::date - 28 AND $1::date - 1
                             GROUP BY 1)
                          SELECT COUNT(*)::int AS days, COALESCE(AVG(cancelled), 0) AS cancelled, COALESCE(AVG(discounts), 0) AS discounts,
                                 COALESCE(AVG(revenue), 0) AS revenue, COALESCE(AVG(edited), 0) AS edited,
                                 COALESCE(SUM(discounts) / NULLIF(SUM(revenue + discounts), 0), 0) AS discount_rate
                            FROM d`);

  const byType = await q(`SELECT order_type, COUNT(*)::int AS orders, SUM(total) AS revenue FROM ai_data.orders
                           WHERE business_day = $1::date AND ${SOLD} GROUP BY 1 ORDER BY 2 DESC`);
  const bySource = await q(`SELECT source, COUNT(*)::int AS orders FROM ai_data.orders WHERE business_day = $1::date AND ${SOLD} GROUP BY 1`);
  const byPayment = await q(`SELECT payment_method, COUNT(*)::int AS orders, SUM(total) AS revenue FROM ai_data.orders
                              WHERE business_day = $1::date AND ${SOLD} GROUP BY 1`);
  const products = await q(`SELECT oi.product_name AS name, SUM(oi.quantity)::int AS qty, SUM(oi.line_total) AS revenue
                              FROM ai_data.order_items oi JOIN ai_data.orders o ON o.id = oi.order_id
                             WHERE o.business_day = $1::date AND o.${SOLD.replace(' AND awaiting_wa', ' AND o.awaiting_wa')}
                             GROUP BY 1 ORDER BY 2 DESC, 3 DESC`);
  const hours = await q(`SELECT EXTRACT(HOUR FROM local_time)::int AS hour, COUNT(*)::int AS orders, SUM(total) AS revenue
                           FROM ai_data.orders WHERE business_day = $1::date AND ${SOLD} GROUP BY 1`);

  // الموظفين: طلبات، خصومات، إلغاءات، تعديلات بعد الطباعة، تغيير أسعار يدوي
  const cashiers = await q(`SELECT COALESCE(cashier_name, 'بدون اسم') AS name,
                                   COUNT(*) FILTER (WHERE ${SOLD})::int AS orders,
                                   COALESCE(SUM(total) FILTER (WHERE ${SOLD}), 0) AS revenue,
                                   COALESCE(SUM(discount) FILTER (WHERE ${SOLD}), 0) AS discounts,
                                   COUNT(*) FILTER (WHERE ${SOLD} AND discount > 0)::int AS discounted_orders
                              FROM ai_data.orders WHERE business_day = $1::date AND source <> 'online' AND source <> 'whatsapp_ai'
                             GROUP BY 1 ORDER BY 3 DESC`);
  const cancellers = await q(`SELECT COALESCE(cancelled_by, 'بدون اسم') AS name, COUNT(*)::int AS n, SUM(total) AS amount,
                                     string_agg(DISTINCT NULLIF(cancel_reason, ''), '، ') AS reasons
                                FROM ai_data.orders WHERE business_day = $1::date AND status = 'cancelled' GROUP BY 1 ORDER BY 2 DESC`);
  const editors = await q(`SELECT edited_by AS name, COUNT(*)::int AS n FROM ai_data.orders
                            WHERE business_day = $1::date AND edited_by IS NOT NULL AND ${SOLD} GROUP BY 1 ORDER BY 2 DESC`);
  const overrides = await q(`SELECT COALESCE(o.cashier_name, 'بدون اسم') AS name, COUNT(*)::int AS n,
                                    COALESCE(SUM((oi.original_unit_price - oi.unit_price) * oi.quantity), 0) AS lost
                               FROM ai_data.order_items oi JOIN ai_data.orders o ON o.id = oi.order_id
                              WHERE o.business_day = $1::date AND oi.price_changed_by_cashier AND o.status <> 'cancelled'
                              GROUP BY 1 ORDER BY 2 DESC`);

  const [withdrawals] = await q(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0) AS total FROM ai_data.cash_withdrawals WHERE business_day = $1::date`);
  const withdrawalList = await q(`SELECT amount, reason, staff_name, recipient_type, recipient_name, to_char(local_time, 'HH24:MI') AS at
                                    FROM ai_data.cash_withdrawals WHERE business_day = $1::date ORDER BY local_time`);
  const [wBase] = await q(`SELECT COALESCE(AVG(t), 0) AS avg FROM (SELECT SUM(amount) AS t FROM ai_data.cash_withdrawals
                             WHERE business_day BETWEEN $1::date - 28 AND $1::date - 1 GROUP BY business_day) x`);
  // الجرد بينحسب بس لما يكون كامل (مش بس رصيد افتتاحي)
  const [audit] = await q(`SELECT opening_balance, orders_total, withdrawals_total, expected_amount, actual_amount, difference, staff_name,
                                  card_orders_total, card_actual, card_difference, external_orders, external_cash, external_card, external_later
                             FROM ai_data.cash_register_audits WHERE audit_date = $1::date AND actual_amount IS NOT NULL`);
  // الفيزا بيوم دخول المصاري (طلب "دفع لاحقاً" انقبض فيزا بيوم الدفع)
  const [cardSales] = await q(`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS n FROM ai_data.orders
                                 WHERE money_day = $1::date AND ${SOLD} AND payment_method = 'card'`);
  const { rows: [stPL] } = await pool.query('SELECT track_pay_later FROM settings WHERE id = 1');
  const trackPL = stPL?.track_pay_later !== false;
  // "دفع لاحقاً": طلبات اليوم يلي لسا ما انقبضت، وكل المعلّق من أيام قبل
  const [unpaid] = await q(`SELECT COUNT(*) FILTER (WHERE business_day = $1::date)::int AS today_n,
                                   COALESCE(SUM(total) FILTER (WHERE business_day = $1::date), 0) AS today_total,
                                   COUNT(*) FILTER (WHERE business_day < $1::date)::int AS old_n,
                                   COALESCE(SUM(total) FILTER (WHERE business_day < $1::date), 0) AS old_total
                              FROM ai_data.orders WHERE ${SOLD} AND payment_method = 'pay-later' AND business_day <= $1::date`);
  const [settled] = await q(`SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0) AS total FROM ai_data.orders
                              WHERE ${SOLD} AND paid_local_time IS NOT NULL AND money_day = $1::date AND business_day < $1::date`);
  const lowStock = await q(`SELECT name, quantity, unit FROM ai_data.inventory_items WHERE min_threshold > 0 AND quantity <= min_threshold ORDER BY name LIMIT 10`, []);
  const [cust] = await q(`SELECT COUNT(DISTINCT customer_id)::int AS customers,
                                 COUNT(DISTINCT customer_id) FILTER (WHERE customer_id IN (
                                   SELECT customer_id FROM ai_data.orders WHERE customer_id IS NOT NULL GROUP BY 1 HAVING MIN(business_day) = $1::date))::int AS new_customers
                            FROM ai_data.orders WHERE business_day = $1::date AND ${SOLD} AND customer_id IS NOT NULL`);

  // أضغط وأهدى ساعة — بين أول وآخر ساعة اشتغلنا فيها (الساعات الفاضية بالنص بتنحسب صفر)
  let busiest = null;
  let slowest = null;
  if (hours.length) {
    const map = new Map(hours.map((h) => [h.hour, h]));
    // ساعات يوم العمل بالترتيب (بيبلش من ساعة بداية اليوم، مش من 0)
    const { rows: c } = await pool.query('SELECT ai_data.cutoff_minutes() AS m');
    const startHour = Math.floor(c[0].m / 60);
    const ordered = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24);
    const active = ordered.filter((h) => map.has(h));
    const first = ordered.indexOf(active[0]);
    const last = ordered.indexOf(active[active.length - 1]);
    const span = ordered.slice(first, last + 1).map((h) => ({ hour: h, orders: map.get(h)?.orders || 0, revenue: num(map.get(h)?.revenue) }));
    busiest = span.reduce((a, b) => (b.revenue > a.revenue ? b : a));
    slowest = span.length > 2 ? span.reduce((a, b) => (b.revenue < a.revenue ? b : a)) : null;
  }

  const wdAvg = weekday.length ? weekday.reduce((s, r) => s + Number(r.revenue || 0), 0) / weekday.length : 0;
  const wdOrdersAvg = weekday.length ? weekday.reduce((s, r) => s + r.orders, 0) / weekday.length : 0;
  const dayName = WD[new Date(`${day}T12:00:00Z`).getUTCDay()];

  const data = {
    day,
    dayName,
    orders: t.orders,
    revenue: num(t.revenue),
    avgTicket: t.orders ? num(t.revenue / t.orders) : 0,
    discounts: num(t.discounts),
    discountedOrders: t.discounted_orders,
    cancelled: t.cancelled,
    cancelledAmount: num(t.cancelled_amount),
    editedAfterPrint: t.edited,
    vsWeekdayAvg: { avgRevenue: num(wdAvg), avgOrders: Math.round(wdOrdersAvg), weeks: weekday.length, changePct: pct(Number(t.revenue), wdAvg) },
    vsYesterday: { revenue: num(yesterday?.revenue), orders: yesterday?.orders || 0, changePct: pct(Number(t.revenue), Number(yesterday?.revenue || 0)) },
    byType: byType.map((r) => ({ type: r.order_type, orders: r.orders, revenue: num(r.revenue) })),
    bySource: bySource.map((r) => ({ source: r.source, orders: r.orders })),
    byPayment: byPayment.map((r) => ({ method: r.payment_method, orders: r.orders, revenue: num(r.revenue) })),
    topProducts: products.slice(0, 3).map((p) => ({ name: p.name, qty: p.qty, revenue: num(p.revenue) })),
    busiestHour: busiest,
    slowestHour: slowest,
    cashiers: cashiers.map((r) => ({ name: r.name, orders: r.orders, revenue: num(r.revenue), discounts: num(r.discounts), discountedOrders: r.discounted_orders })),
    cancellations: cancellers.map((r) => ({ by: r.name, count: r.n, amount: num(r.amount), reasons: r.reasons || '' })),
    edits: editors.map((r) => ({ by: r.name, count: r.n })),
    priceOverrides: overrides.map((r) => ({ by: r.name, count: r.n, lost: num(r.lost) })),
    withdrawals: {
      count: withdrawals.n,
      total: num(withdrawals.total),
      avg28: num(wBase.avg),
      list: withdrawalList.map((w) => ({
        amount: num(w.amount),
        reason: w.reason || '',
        by: w.staff_name || '',
        to: w.recipient_name ? `${w.recipient_type === 'supplier' ? 'مورد: ' : w.recipient_type === 'staff' ? 'موظف: ' : ''}${w.recipient_name}` : '',
        at: w.at,
      })),
    },
    cashAudit: audit
      ? {
          opening: num(audit.opening_balance),
          expected: num(audit.expected_amount),
          actual: num(audit.actual_amount),
          difference: num(audit.difference),
          by: audit.staff_name,
          matched: Math.abs(num(audit.difference)) < 1,
          cardActual: audit.card_actual === null ? null : num(audit.card_actual),
          cardDifference: audit.card_difference === null ? null : num(audit.card_difference),
          external: (audit.external_orders || []).map((x) => ({ source: x.source, amount: num(x.amount), count: x.count || 0, method: x.method })),
        }
      : null,
    card: { total: num(cardSales.total), count: cardSales.n },
    trackPayLater: trackPL,
    payLater: {
      todayCount: unpaid.today_n,
      todayTotal: num(unpaid.today_total),
      olderCount: unpaid.old_n,
      olderTotal: num(unpaid.old_total),
      settledFromBefore: { count: settled.n, total: num(settled.total) },
    },
    lowStock: lowStock.map((r) => `${r.name} (${num(r.quantity)} ${r.unit})`),
    customers: { total: cust?.customers || 0, new: cust?.new_customers || 0 },
    baseline28: { days: base.days, avgCancelled: num(base.cancelled), avgDiscounts: num(base.discounts), avgEdited: num(base.edited), discountRate: num(base.discount_rate * 100) },
  };
  data.anomalies = findAnomalies(data);
  return data;
}

/* ---------------- الأشياء الغريبة ---------------- */

function findAnomalies(d) {
  const a = [];
  const b = d.baseline28;

  // إلغاءات أكتر من العادة
  if (d.cancelled >= 3 && (b.days < 5 || d.cancelled >= Math.max(3, b.avgCancelled * 2))) {
    a.push({ kind: 'cancellations', severity: 'high', text: `${d.cancelled} طلبات ملغية (${money(d.cancelledAmount)})${b.days >= 5 ? ` — العادة ${b.avgCancelled < 0.5 ? 'ما في إلغاءات تقريباً' : `${b.avgCancelled.toFixed(1)} باليوم`}` : ''}` });
  }
  // حدا لغى كتير لحاله
  for (const c of d.cancellations) {
    if (c.count >= 3) a.push({ kind: 'cancellations_by', severity: 'high', text: `${c.by} لغى ${c.count} طلبات (${money(c.amount)})${c.reasons ? ` — الأسباب: ${c.reasons}` : ''}` });
  }

  // خصومات: كاشير واحد عامل أغلب الخصومات، أو نسبة خصم أعلى بكتير من العادة
  const totalDisc = d.cashiers.reduce((s, c) => s + c.discounts, 0);
  const activeCashiers = d.cashiers.filter((c) => c.orders > 0).length;
  for (const c of d.cashiers) {
    const share = totalDisc > 0 ? c.discounts / totalDisc : 0;
    const rate = c.revenue + c.discounts > 0 ? (c.discounts / (c.revenue + c.discounts)) * 100 : 0;
    if (c.discounts >= 20 && activeCashiers > 1 && share >= 0.6 && c.discountedOrders >= 2) {
      a.push({ kind: 'discounts_share', severity: 'high', text: `${c.name} عمل ${Math.round(share * 100)}% من خصومات اليوم (${money(c.discounts)} على ${c.discountedOrders} طلبات)` });
    } else if (c.discounts >= 20 && c.discountedOrders >= 3 && b.discountRate > 0 && rate >= b.discountRate * 2.5) {
      a.push({ kind: 'discounts_rate', severity: 'medium', text: `خصومات ${c.name} ${rate.toFixed(0)}% من مبيعاته — العادة ${b.discountRate.toFixed(0)}%` });
    }
  }
  if (!a.some((x) => x.kind.startsWith('discounts')) && b.days >= 5 && d.discounts >= 30 && d.discounts >= b.avgDiscounts * 2.5) {
    a.push({ kind: 'discounts_total', severity: 'medium', text: `خصومات اليوم ${money(d.discounts)} — العادة ${money(b.avgDiscounts)}` });
  }

  // تعديلات بعد الطباعة
  for (const e of d.edits) {
    if (e.count >= 3) a.push({ kind: 'edits', severity: 'medium', text: `${e.by} عدّل ${e.count} طلبات بعد ما انطبعت` });
  }
  // تغيير أسعار يدوي
  for (const o of d.priceOverrides) {
    if (o.count >= 3 || o.lost >= 30) a.push({ kind: 'price_override', severity: 'medium', text: `${o.by} غيّر سعر ${o.count} أصناف يدوياً${o.lost > 0 ? ` (أقل من السعر بـ ${money(o.lost)})` : ''}` });
  }
  // فرق الصندوق بيطلع بسطر الصندوق الثابت (cashLines) — ما منكرره هون
  // سحوبات كبيرة
  if (d.withdrawals.total >= 100 && d.withdrawals.avg28 > 0 && d.withdrawals.total >= d.withdrawals.avg28 * 2) {
    a.push({ kind: 'withdrawals', severity: 'medium', text: `سحوبات من الصندوق ${money(d.withdrawals.total)} — العادة ${money(d.withdrawals.avg28)}` });
  }
  // المبيعات نزلت كتير عن نفس اليوم بالأسابيع الماضية
  const ch = d.vsWeekdayAvg.changePct;
  if (d.vsWeekdayAvg.weeks >= 2 && ch !== null && ch <= -30) {
    a.push({ kind: 'sales_drop', severity: 'medium', text: `المبيعات أقل بـ ${Math.abs(ch)}% من معدل أيام ${d.dayName}` });
  }
  return a;
}

/* ---------------- نص الرسالة ---------------- */

/** أسطر الصندوق والسحوبات — بتطلع بكل تقرير */
function cashLines(d) {
  const L = [];
  const a = d.cashAudit;
  if (!a) L.push('💵 *الصندوق:* ما انعمل جرد لهاد اليوم');
  else if (a.matched) L.push(`💵 *الصندوق: مطابق ✓* (${money(a.actual)})${a.by ? ` — جرد ${a.by}` : ''}`);
  else L.push(`💵 *الصندوق: فرق ${a.difference > 0 ? '+' : '-'}${money(Math.abs(a.difference))}* (المتوقع ${money(a.expected)} • الفعلي ${money(a.actual)})${a.by ? ` — جرد ${a.by}` : ''}`);
  // الفيزا لحالها — ومطابقتها مع الماكينة لو انكتبت بالجرد
  if (d.card.count || (a && a.cardActual !== null)) {
    let line = `💳 *فيزا:* ${money(d.card.total)} (${d.card.count} طلب)`;
    if (a && a.cardActual !== null) line += a.cardDifference !== null && Math.abs(a.cardDifference) < 1 ? ' — الماكينة مطابقة ✓' : ` — الماكينة ${money(a.cardActual)} (فرق ${a.cardDifference > 0 ? '+' : '-'}${money(Math.abs(a.cardDifference))})`;
    L.push(line);
  }
  // طلبات من برا النظام (تطبيقات توصيل...)
  if (a && a.external.length) {
    const methodName = { cash: 'كاش', card: 'فيزا', later: 'بتنحاسب بعدين' };
    const tot = a.external.reduce((s, x) => s + x.amount, 0);
    L.push(`🛵 *طلبات من برا النظام:* ${money(tot)}`);
    for (const x of a.external) L.push(`- ${x.source}: ${money(x.amount)}${x.count ? ` (${x.count} طلب)` : ''} — ${methodName[x.method] || x.method}`);
  }
  // دفع لاحقاً
  const pl = d.payLater;
  if (d.trackPayLater && (pl.todayCount || pl.olderCount)) {
    L.push(`🕓 *دفع لاحقاً لسا ما انقبض:* ${pl.todayCount} اليوم بـ ${money(pl.todayTotal)}${pl.olderCount ? ` • ${pl.olderCount} من أيام قبل بـ ${money(pl.olderTotal)}` : ''}`);
  }
  if (pl.settledFromBefore.count) L.push(`✅ انقبض اليوم من طلبات قديمة: ${pl.settledFromBefore.count} بـ ${money(pl.settledFromBefore.total)}`);
  const w = d.withdrawals;
  if (!w.count) L.push('💸 *سحوبات:* ما في');
  else {
    L.push(`💸 *سحوبات:* ${w.count} بـ ${money(w.total)}`);
    for (const x of w.list.slice(0, 8)) {
      L.push(`- ${money(x.amount)}${x.reason ? ` ${x.reason}` : ''}${x.to ? ` (${x.to})` : ''}${x.by ? ` — ${x.by}` : ''}`);
    }
    if (w.list.length > 8) L.push(`- و${w.list.length - 8} كمان`);
  }
  return L;
}

function templateText(d) {
  const L = [];
  const [y, m, dd] = d.day.split('-');
  L.push(`📊 *تقرير ${d.dayName} ${Number(dd)}/${Number(m)}*`);
  if (!d.orders && !d.cancelled) {
    L.push('', 'ما في طلبات بهاد اليوم.', '', ...cashLines(d));
    return L.join('\n');
  }
  const ch = d.vsWeekdayAvg.changePct;
  L.push('', `💰 المبيعات: *${money(d.revenue)}* (${d.orders} طلب)${ch !== null && d.vsWeekdayAvg.weeks ? ` ${ch >= 0 ? '▲' : '▼'}${Math.abs(ch)}% عن معدل أيام ${d.dayName}` : ''}`);
  L.push(`🧾 متوسط الفاتورة: ${money(d.avgTicket)}`);
  if (d.topProducts[0]) L.push(`🏆 أحسن صنف: ${d.topProducts[0].name} (${d.topProducts[0].qty})`);
  if (d.busiestHour) L.push(`⏰ أضغط ساعة: ${hourLabel(d.busiestHour.hour)} (${d.busiestHour.orders} طلب)${d.slowestHour ? ` • أهدى ساعة: ${hourLabel(d.slowestHour.hour)} (${d.slowestHour.orders})` : ''}`);
  const typeNames = { 'dine-in': 'داخل', takeaway: 'سفري', delivery: 'توصيل', pos: 'كاشير' };
  if (d.byType.length) L.push(`🛵 ${d.byType.map((t) => `${typeNames[t.type] || t.type} ${t.orders}`).join(' • ')}`);
  if (d.discounts > 0) L.push(`🏷️ خصومات: ${money(d.discounts)} على ${d.discountedOrders} طلب`);
  if (d.cancelled) L.push(`❌ ملغي: ${d.cancelled} (${money(d.cancelledAmount)})`);
  L.push('', ...cashLines(d));
  if (d.anomalies.length) {
    L.push('', '⚠️ *انتبهي:*');
    for (const x of d.anomalies) L.push(`- ${x.text}`);
  } else {
    L.push('', '✅ ما في إشي غريب اليوم.');
  }
  if (d.lowStock.length) L.push('', `📦 مخزون قليل: ${d.lowStock.slice(0, 5).join('، ')}`);
  return L.join('\n');
}

const AI_SYSTEM = `إنت بتكتب تقرير يومي قصير لصاحبة مطعم، بينبعتلها على الواتساب بعد سكّرة المطعم. باللهجة الفلسطينية.
قواعد:
- الأرقام كلها من البيانات بالزبط — ما تخترع ولا تقرّب بشكل بيغيّر المعنى، وما تحسب أرقام جديدة إلا نسب بسيطة.
- تنسيق الواتساب: *نص عريض* بنجمة وحدة، أسطر قصيرة، إيموجي واحد ببداية السطر بس. بدون # وبدون جداول.
- الترتيب: عنوان (اليوم والتاريخ) ← المبيعات وعدد الطلبات والمقارنة ← متوسط الفاتورة ← أحسن صنف ← أضغط وأهدى ساعة ←
  الأشياء الغريبة (كل وحدة بسطر، بالأسماء والأرقام، تحت عنوان "⚠️ *انتبهي:*") ← مخزون قليل لو في ← جملة أخيرة فيها نصيحة وحدة عملية لبكرا.
- إذا ما في أشياء غريبة (anomalies فاضية) احكي "✅ ما في إشي غريب اليوم".
- أسطر الصندوق والسحوبات (cash_lines) لازم تنحط بالرسالة زي ما هي بالزبط، قبل الأشياء الغريبة.
- لا تتهم حدا — احكي الحقيقة بالأرقام واقترحي تتأكد.
- 1200 حرف بالكتير.`;

async function composeText(data, cfg) {
  const fallback = templateText(data);
  if (!cfg.dailyReport.useAi || (!data.orders && !data.cancelled)) return { text: fallback, ai: false };
  let p = cfg.analysis.provider || cfg.chat.provider;
  let m = cfg.analysis.provider ? cfg.analysis.model : cfg.chat.model;
  if (!ai.hasKey(p)) {
    p = ['anthropic', 'openai', 'gemini'].find((x) => ai.hasKey(x));
    m = '';
  }
  if (!p) return { text: fallback, ai: false };
  try {
    const { anomalies, ...rest } = data;
    const out = await ai.runAgent({
      provider: p, model: m, kind: 'analysis', maxTokens: 1200, system: AI_SYSTEM,
      history: [{ role: 'user', text: `بيانات اليوم:\n${JSON.stringify(rest)}\n\nالأشياء الغريبة (محسوبة بالسيرفر — اذكريها كلها):\n${JSON.stringify(anomalies.map((x) => x.text))}\n\ncash_lines (حطيها زي ما هي):\n${cashLines(data).join('\n')}` }],
    });
    let text = String(out.text || '').trim();
    if (text.length < 40) return { text: fallback, ai: false };
    // احتياط: لو الموديل نسي سطر الصندوق أو السحوبات، منزيدهم إحنا
    if (!text.includes('الصندوق') || !text.includes('سحوبات')) text = `${text}\n\n${cashLines(data).join('\n')}`;
    return { text: text.slice(0, 3500), ai: true, provider: p };
  } catch (err) {
    console.warn('[daily-report] AI failed, using template:', err.message);
    return { text: fallback, ai: false, aiError: err.message };
  }
}

async function build(day) {
  const d = day || (await currentBusinessDay());
  const data = await collect(d);
  const cfg = await store.getConfig();
  const composed = await composeText(data, cfg);
  return { day: d, data, ...composed };
}

function parsePhones(raw) {
  return String(raw || '')
    .split(/[,،\n;]+/)
    .map((x) => x.trim())
    .filter((x) => x.replace(/\D/g, '').length >= 7)
    .slice(0, 5);
}

async function sendTo(phones, text) {
  const results = [];
  for (const p of phones) {
    try {
      await whatsapp.sendToCustomer(p, text);
      results.push({ phone: p, ok: true });
    } catch (err) {
      results.push({ phone: p, ok: false, error: err.message });
    }
  }
  return results;
}

/* ---------------- الجدولة ---------------- */

/** إمتى سكّرة يوم العمل (توقيت المطعم) — أول "ساعة سكّرة" بعد بداية اليوم */
async function closeMoment(day) {
  const { rows } = await pool.query(
    `WITH st AS (SELECT COALESCE(NULLIF(split_part(close_time, ':', 1), '')::int * 60 + NULLIF(split_part(close_time, ':', 2), '')::int, 0) % 1440 AS c
                   FROM settings WHERE id = 1),
          s AS (SELECT ($1::date + make_interval(mins => ai_data.cutoff_minutes())) AS start, st.c FROM st)
     SELECT CASE WHEN date_trunc('day', start) + make_interval(mins => c) > start
                 THEN date_trunc('day', start) + make_interval(mins => c)
                 ELSE date_trunc('day', start) + interval '1 day' + make_interval(mins => c) END AS close_local,
            (now() AT TIME ZONE $2) AS now_local
       FROM s`,
    [day, TZ]
  );
  return rows[0];
}

let running = false;
/** بتنفحص كل كم دقيقة: إذا سكّر المطعم ومرق الوقت، وما انبعت تقرير لهاليوم — منبعته */
async function tick() {
  if (running) return { skipped: 'running' };
  running = true;
  try {
    const cfg = await store.getConfig();
    const dr = cfg.dailyReport;
    const phones = parsePhones(dr.phones);
    if (!dr.enabled || !phones.length) return { skipped: 'disabled' };
    if (!whatsapp.config().ready) return { skipped: 'whatsapp-not-configured' };
    const today = await currentBusinessDay();
    const { rows: prevRow } = await pool.query(`SELECT to_char($1::date - 1, 'YYYY-MM-DD') AS d`, [today]);
    const sent = [];
    for (const day of [prevRow[0].d, today]) {
      const { close_local, now_local } = await closeMoment(day);
      const due = new Date(close_local.getTime() + dr.delayMinutes * 60000);
      // اليوم لسا ما سكّر، أو صار قديم كتير (السيرفر كان نايم طول اليوم) — منتركه
      if (now_local < due || now_local - due > 20 * 3600 * 1000) continue;
      // منستنى جرد الصندوق (لحد الحد الأقصى) — بعدها منبعت وبنكتب "ما انعمل جرد"
      if (dr.waitForAudit && now_local - due < dr.maxWaitMinutes * 60000) {
        const { rows: au } = await pool.query('SELECT 1 FROM cash_register_audits WHERE audit_date = $1::date AND actual_amount IS NOT NULL', [day]);
        if (!au.length) continue;
      }
      // منحجز اليوم (حتى لو في نسختين من السيرفر — وحدة بس بتبعت). لو فشل قبل، منعيد لحد 3 مرات كل ربع ساعة
      const { rows: claim } = await pool.query(
        `INSERT INTO daily_reports (day, attempts) VALUES ($1, 1)
         ON CONFLICT (day) DO UPDATE SET attempts = daily_reports.attempts + 1, created_at = now(), error = NULL
           WHERE daily_reports.sent_at IS NULL AND daily_reports.attempts < 3 AND daily_reports.created_at < now() - interval '15 minutes'
         RETURNING attempts`,
        [day]
      );
      if (!claim.length) continue;
      try {
        const report = await build(day);
        const results = await sendTo(phones, report.text);
        const ok = results.filter((r) => r.ok).map((r) => r.phone);
        await pool.query(
          `UPDATE daily_reports SET sent_at = $2, sent_to = $3, text = $4, data = $5, error = $6 WHERE day = $1`,
          [day, ok.length ? new Date() : null, ok.join(', '), report.text, JSON.stringify(report.data), ok.length === results.length ? null : JSON.stringify(results.filter((r) => !r.ok))]
        );
        sent.push({ day, ok: ok.length });
        console.log(`[daily-report] ${day} → ${ok.length}/${results.length}`);
      } catch (err) {
        await pool.query('UPDATE daily_reports SET error = $2 WHERE day = $1', [day, String(err.message).slice(0, 500)]);
        console.error('[daily-report] failed:', err.message);
      }
    }
    return { sent };
  } finally {
    running = false;
  }
}

function startScheduler() {
  setTimeout(() => tick().catch((e) => console.error('[daily-report]', e.message)), 45 * 1000);
  setInterval(() => tick().catch((e) => console.error('[daily-report]', e.message)), 5 * 60 * 1000);
}

module.exports = { collect, build, templateText, findAnomalies, tick, startScheduler, parsePhones, sendTo, currentBusinessDay };
