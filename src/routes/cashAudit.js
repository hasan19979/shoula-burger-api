const express = require('express');
const pool = require('../db/pool');
const businessDay = require('../businessDay');
const asyncHandler = require('../utils/asyncHandler');
const requireAnyAuth = require('../middleware/anyAuth');

const router = express.Router();

/** أرقام يوم العمل: الطلبات (كاش وفيزا لحال) والسحوبات */
async function daySummary(date) {
  // يوم العمل (لحد انتهاء الدوام، بتوقيت المطعم) — مش من نص الليل لنص الليل بتوقيت السيرفر
  const cutoff = await businessDay.getCutoff();
  const { rows: [range] } = await pool.query(
    `SELECT (($1::date + make_interval(mins => $2)) AT TIME ZONE $3) AS "from",
            (($1::date + 1 + make_interval(mins => $2)) AT TIME ZONE $3) AS "to"`,
    [date, cutoff, businessDay.TZ]
  );
  // تتبّع "الدفع لاحقاً" من الإعدادات. مطفي = الطلب بينحسب كأنه انقبض كاش وقت الطلب (زي قبل)
  const { rows: [st] } = await pool.query('SELECT track_pay_later FROM settings WHERE id = 1');
  const track = st?.track_pay_later !== false;
  const CASH = track ? `payment_method = 'cash'` : `payment_method IN ('cash', 'pay-later')`;
  // المصاري بتنحسب بيوم دخولها: طلب "دفع لاحقاً" بينحسب بيوم ما الزبون دفع (paid_at)، ولسا ما دفع = ما بينحسب
  const { rows: [o] } = await pool.query(
    `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS count,
            COALESCE(SUM(total) FILTER (WHERE ${CASH}), 0) AS cash_total,
            COUNT(*) FILTER (WHERE ${CASH})::int AS cash_count,
            COALESCE(SUM(total) FILTER (WHERE payment_method = 'card'), 0) AS card_total,
            COUNT(*) FILTER (WHERE payment_method = 'card')::int AS card_count,
            COALESCE(SUM(total) FILTER (WHERE payment_method NOT IN ('cash', 'card', 'pay-later')), 0) AS other_total,
            COUNT(*) FILTER (WHERE payment_method NOT IN ('cash', 'card', 'pay-later'))::int AS other_count,
            COALESCE(SUM(total) FILTER (WHERE paid_at IS NOT NULL AND created_at < $1), 0) AS settled_old_total,
            COUNT(*) FILTER (WHERE paid_at IS NOT NULL AND created_at < $1)::int AS settled_old_count
       FROM orders
      WHERE status != 'cancelled' AND awaiting_wa = false ${track ? `AND payment_method <> 'pay-later'` : ''}
        AND COALESCE(paid_at, created_at) >= $1 AND COALESCE(paid_at, created_at) < $2`,
    [range.from, range.to]
  );
  // طلبات اليوم يلي لسا "دفع لاحقاً"
  const { rows: [u] } = track
    ? await pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS count FROM orders
          WHERE status != 'cancelled' AND awaiting_wa = false AND payment_method = 'pay-later' AND created_at >= $1 AND created_at < $2`,
        [range.from, range.to]
      )
    : { rows: [{ total: 0, count: 0 }] };
  const { rows: [w] } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count FROM cash_withdrawals WHERE created_at >= $1 AND created_at < $2`,
    [range.from, range.to]
  );
  return {
    trackPayLater: track,
    ordersTotal: Number(o.total),
    ordersCount: o.count,
    // الكاش بس بيدخل الصندوق — الفيزا والطرق التانية لحال
    cashOrdersTotal: Number(o.cash_total),
    cashOrdersCount: o.cash_count,
    cardOrdersTotal: Number(o.card_total),
    cardOrdersCount: o.card_count,
    otherOrdersTotal: Number(o.other_total),
    otherOrdersCount: o.other_count,
    // دفعات طلبات "دفع لاحقاً" من أيام قبل، انقبضت بهاد اليوم (داخلة بالأرقام فوق)
    settledOldTotal: Number(o.settled_old_total),
    settledOldCount: o.settled_old_count,
    unpaidTotal: Number(u.total),
    unpaidCount: u.count,
    withdrawalsTotal: Number(w.total),
    withdrawalsCount: w.count,
  };
}

// GET /api/cash-audit/summary?date=YYYY-MM-DD
router.get('/summary', requireAnyAuth, asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: 'تاريخ غير صالح' });
  const summary = await daySummary(date);
  // أسماء مصادر الطلبات الخارجية يلي انكتبت قبل (للاختيار السريع)
  const { rows } = await pool.query(
    `SELECT DISTINCT x->>'source' AS source FROM cash_register_audits, jsonb_array_elements(external_orders) x
      WHERE audit_date > CURRENT_DATE - 90 AND COALESCE(x->>'source', '') <> '' LIMIT 12`
  );
  res.json({ ...summary, recentSources: rows.map((r) => r.source) });
}));

// GET /api/cash-audit?date=YYYY-MM-DD — بيرجع سجل الجرد المحفوظ لهاد التاريخ لو موجود
router.get('/', requireAnyAuth, asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const { rows } = await pool.query('SELECT * FROM cash_register_audits WHERE audit_date = $1', [date]);
  res.json(rows[0] || null);
}));

// POST /api/cash-audit/opening-balance — حفظ رصيد الصندوق الافتتاحي لحاله (الصبح مثلاً، قبل ما تبلش الوردية)
// بدون ما يلمس باقي حقول الجرد لو كانت موجودة أصلاً (يعني ما بيمسح جرد مكتمل بالغلط)
router.post('/opening-balance', requireAnyAuth, asyncHandler(async (req, res) => {
  const { date, openingBalance } = req.body || {};
  if (!date || openingBalance === undefined) {
    return res.status(400).json({ error: 'التاريخ والرصيد الافتتاحي مطلوبين' });
  }
  const staffName = req.staff?.name || req.admin?.email || null;
  const result = await pool.query(
    `INSERT INTO cash_register_audits (audit_date, opening_balance, staff_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (audit_date) DO UPDATE SET opening_balance = EXCLUDED.opening_balance, staff_name = EXCLUDED.staff_name
     RETURNING *`,
    [date, openingBalance, staffName]
  );
  res.status(201).json(result.rows[0]);
}));

// POST /api/cash-audit — حفظ (أو تصحيح) جرد يوم معيّن
// المتوقع بالصندوق = الرصيد الافتتاحي + طلبات الكاش + طلبات برا النظام يلي انقبضت كاش − السحوبات
// الفيزا بتنجرد لحالها (لو انكتب مجموع الماكينة)
router.post('/', requireAnyAuth, asyncHandler(async (req, res) => {
  const { date, openingBalance, actualAmount, cardActual, externalOrders } = req.body || {};
  if (!date || openingBalance === undefined || actualAmount === undefined) {
    return res.status(400).json({ error: 'التاريخ، الرصيد الافتتاحي، والمبلغ الفعلي كلهم مطلوبين' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'تاريخ غير صالح' });
  const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;

  // الأرقام منحسبها بالسيرفر (مش من الشاشة) — حتى لو انضافت طلبات بالنص
  const sum = await daySummary(date);
  const ext = (Array.isArray(externalOrders) ? externalOrders : [])
    .map((x) => ({
      source: String(x?.source || '').trim().slice(0, 40) || 'طلبات خارجية',
      amount: r2(x?.amount),
      count: Math.max(0, Math.min(999, parseInt(x?.count, 10) || 0)),
      method: ['cash', 'card', 'later'].includes(x?.method) ? x.method : 'cash',
    }))
    .filter((x) => x.amount > 0)
    .slice(0, 20);
  const extBy = (m) => r2(ext.filter((x) => x.method === m).reduce((s, x) => s + x.amount, 0));
  const externalCash = extBy('cash');
  const externalCard = extBy('card');
  const externalLater = extBy('later');

  // الفيزا: إذا انكتب مجموع الماكينة (أو انعدّل يدوياً) — الفرق عن النظام بينتقل من/للكاش.
  // مثلاً طلب انسجّل كاش بس الزبون دفع فيزا: الماكينة أكتر بـ 40 → المتوقع بالصندوق أقل بـ 40
  const hasCard = cardActual !== undefined && cardActual !== null && cardActual !== '';
  const cardExpected = r2(sum.cardOrdersTotal + externalCard);
  const cardFinal = hasCard ? r2(cardActual) : cardExpected;
  const cardDifference = hasCard ? r2(cardFinal - cardExpected) : null;
  const expected = r2(Number(openingBalance) + sum.cashOrdersTotal + externalCash - (cardFinal - cardExpected) - sum.withdrawalsTotal);
  const difference = r2(Number(actualAmount) - expected);
  const staffName = req.staff?.name || req.admin?.email || null;

  const result = await pool.query(
    `INSERT INTO cash_register_audits (audit_date, opening_balance, orders_total, withdrawals_total, expected_amount, actual_amount, difference, staff_name,
                                       cash_orders_total, card_orders_total, card_actual, card_difference, external_orders, external_cash, external_card, external_later)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (audit_date) DO UPDATE SET
       opening_balance = EXCLUDED.opening_balance, orders_total = EXCLUDED.orders_total, withdrawals_total = EXCLUDED.withdrawals_total,
       expected_amount = EXCLUDED.expected_amount, actual_amount = EXCLUDED.actual_amount, difference = EXCLUDED.difference,
       staff_name = EXCLUDED.staff_name, cash_orders_total = EXCLUDED.cash_orders_total, card_orders_total = EXCLUDED.card_orders_total,
       card_actual = EXCLUDED.card_actual, card_difference = EXCLUDED.card_difference, external_orders = EXCLUDED.external_orders,
       external_cash = EXCLUDED.external_cash, external_card = EXCLUDED.external_card, external_later = EXCLUDED.external_later
     RETURNING *`,
    [date, openingBalance, sum.ordersTotal, sum.withdrawalsTotal, expected, actualAmount, difference, staffName,
     sum.cashOrdersTotal, sum.cardOrdersTotal, hasCard ? r2(cardActual) : null, cardDifference, JSON.stringify(ext), externalCash, externalCard, externalLater]
  );
  res.status(201).json(result.rows[0]);
}));

module.exports = router;
