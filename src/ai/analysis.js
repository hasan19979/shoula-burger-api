/**
 * تحليل بيانات الكاشير بالذكاء الاصطناعي.
 * السيرفر بيجمع ملخصات أرقام بس (بدون أرقام تلفونات أو أسماء زبائن) وبيبعتها للموديل يلي بتختاريه،
 * والموديل بيرجّع تحليل بالعربي مع اقتراحات عملية.
 */
const pool = require('../db/pool');
const ai = require('./providers');
const store = require('./store');

const TZ = 'Asia/Hebron';
const n = (v) => Math.round(Number(v || 0) * 100) / 100;

async function collect(days) {
  const cur = `created_at >= now() - make_interval(days => $1) AND awaiting_wa = false`;
  const prev = `created_at >= now() - make_interval(days => $1 * 2) AND created_at < now() - make_interval(days => $1) AND awaiting_wa = false`;
  const q = (sql, p = [days]) => pool.query(sql, p).then((r) => r.rows);

  const totals = async (where) =>
    (await q(`SELECT COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS orders,
                     COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'),0) AS revenue,
                     COALESCE(AVG(total) FILTER (WHERE status <> 'cancelled'),0) AS avg_ticket,
                     COALESCE(SUM(discount) FILTER (WHERE status <> 'cancelled'),0) AS discounts,
                     COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
                FROM orders WHERE ${where}`))[0];

  const [now, before] = await Promise.all([totals(cur), totals(prev)]);
  const byDay = await q(`SELECT COALESCE(order_day, (created_at AT TIME ZONE '${TZ}')::date) AS day, COUNT(*)::int AS orders, SUM(total) AS revenue
                           FROM orders WHERE ${cur} AND status <> 'cancelled' GROUP BY 1 ORDER BY 1`);
  const byHour = await q(`SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}')::int AS hour, COUNT(*)::int AS orders, SUM(total) AS revenue
                            FROM orders WHERE ${cur} AND status <> 'cancelled' GROUP BY 1 ORDER BY 1`);
  const byWeekday = await q(`SELECT to_char(created_at AT TIME ZONE '${TZ}', 'ID')::int AS dow, COUNT(*)::int AS orders, SUM(total) AS revenue
                               FROM orders WHERE ${cur} AND status <> 'cancelled' GROUP BY 1 ORDER BY 1`);
  const byType = await q(`SELECT order_type, COUNT(*)::int AS orders, SUM(total) AS revenue FROM orders WHERE ${cur} AND status <> 'cancelled' GROUP BY 1`);
  const bySource = await q(`SELECT CASE WHEN ai_created THEN 'مساعد واتساب' WHEN order_source = 'online' THEN 'الموقع' ELSE 'الكاشير' END AS source,
                                   COUNT(*)::int AS orders, SUM(total) AS revenue FROM orders WHERE ${cur} AND status <> 'cancelled' GROUP BY 1`);
  const byPayment = await q(`SELECT payment_method, COUNT(*)::int AS orders, SUM(total) AS revenue FROM orders WHERE ${cur} AND status <> 'cancelled' GROUP BY 1`);
  const products = await q(`SELECT oi.product_id, MAX(oi.product_name) AS name, MAX(c.name) AS category,
                                   SUM(oi.quantity)::int AS qty, SUM(oi.line_total) AS revenue, COUNT(DISTINCT oi.order_id)::int AS orders
                              FROM order_items oi JOIN orders o ON o.id = oi.order_id
                              LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id
                             WHERE o.created_at >= now() - make_interval(days => $1) AND o.awaiting_wa = false AND o.status <> 'cancelled'
                             GROUP BY oi.product_id ORDER BY revenue DESC`);
  const categories = {};
  for (const p of products) {
    const c = p.category || 'بدون تصنيف';
    categories[c] = categories[c] || { qty: 0, revenue: 0 };
    categories[c].qty += p.qty;
    categories[c].revenue += Number(p.revenue);
  }
  const { rows: notSold } = await pool.query(
    `SELECT p.name FROM products p WHERE p.in_stock = true AND NOT EXISTS (
       SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.status <> 'cancelled' AND o.created_at >= now() - make_interval(days => $1)) LIMIT 30`,
    [days]
  );
  // أزواج الأصناف يلي بتنطلب مع بعض (لأفكار الوجبات)
  const pairs = await q(`SELECT a.product_name AS a, b.product_name AS b, COUNT(DISTINCT a.order_id)::int AS together
                           FROM order_items a JOIN order_items b ON a.order_id = b.order_id AND a.product_id < b.product_id
                           JOIN orders o ON o.id = a.order_id
                          WHERE o.created_at >= now() - make_interval(days => $1) AND o.status <> 'cancelled'
                          GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`);
  const customers = (await q(`SELECT COUNT(DISTINCT customer_id)::int AS unique_customers,
                                     COUNT(DISTINCT customer_id) FILTER (WHERE customer_id IN (
                                       SELECT customer_id FROM orders WHERE customer_id IS NOT NULL GROUP BY customer_id
                                        HAVING MIN(created_at) >= now() - make_interval(days => $1)))::int AS new_customers
                                FROM orders WHERE ${cur} AND status <> 'cancelled' AND customer_id IS NOT NULL`))[0];
  const cancelReasons = await q(`SELECT COALESCE(NULLIF(cancel_reason,''),'بدون سبب') AS reason, COUNT(*)::int AS n FROM orders WHERE ${cur} AND status = 'cancelled' GROUP BY 1 ORDER BY 2 DESC LIMIT 5`);
  const { rows: lowStock } = await pool.query(`SELECT name, quantity, unit, min_threshold FROM inventory_items WHERE min_threshold > 0 AND quantity <= min_threshold LIMIT 20`);
  const wd = ['', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

  return {
    الفترة_بالأيام: days,
    الإجمالي: { طلبات: now.orders, مبيعات: n(now.revenue), متوسط_الفاتورة: n(now.avg_ticket), خصومات: n(now.discounts), ملغية: now.cancelled },
    الفترة_السابقة_للمقارنة: { طلبات: before.orders, مبيعات: n(before.revenue), متوسط_الفاتورة: n(before.avg_ticket), ملغية: before.cancelled },
    حسب_اليوم: byDay.map((r) => ({ يوم: String(r.day).slice(0, 10), طلبات: r.orders, مبيعات: n(r.revenue) })),
    حسب_الساعة: byHour.map((r) => ({ ساعة: r.hour, طلبات: r.orders, مبيعات: n(r.revenue) })),
    حسب_يوم_الأسبوع: byWeekday.map((r) => ({ يوم: wd[r.dow], طلبات: r.orders, مبيعات: n(r.revenue) })),
    حسب_نوع_الطلب: byType.map((r) => ({ نوع: r.order_type, طلبات: r.orders, مبيعات: n(r.revenue) })),
    حسب_المصدر: bySource.map((r) => ({ مصدر: r.source, طلبات: r.orders, مبيعات: n(r.revenue) })),
    حسب_الدفع: byPayment.map((r) => ({ طريقة: r.payment_method, طلبات: r.orders, مبيعات: n(r.revenue) })),
    الأصناف: products.slice(0, 40).map((p) => ({ صنف: p.name, تصنيف: p.category, كمية: p.qty, مبيعات: n(p.revenue), بكم_طلب: p.orders })),
    التصنيفات: Object.entries(categories).map(([k, v]) => ({ تصنيف: k, كمية: v.qty, مبيعات: n(v.revenue) })),
    أصناف_ما_انباعت: notSold.map((r) => r.name),
    أصناف_بتنطلب_مع_بعض: pairs.map((p) => ({ الأول: p.a, التاني: p.b, مرات: p.together })),
    الزبائن: { زبائن_مختلفين: customers.unique_customers, زبائن_جدد: customers.new_customers },
    أسباب_الإلغاء: cancelReasons.map((r) => ({ سبب: r.reason, عدد: r.n })),
    مخزون_قليل: lowStock.map((r) => ({ مادة: r.name, الكمية: Number(r.quantity), الوحدة: r.unit, الحد_الأدنى: Number(r.min_threshold) })),
  };
}

const SYSTEM = `إنت محلل بيانات لمطعم. بتحكي باللهجة الفلسطينية، بوضوح واختصار.
- اعتمد بس على الأرقام يلي بالبيانات. ما تخترع أرقام. إذا البيانات ما بتكفي، احكي هيك.
- ابدأ بملخص بجملتين، وبعدين نقاط قصيرة (**عناوين عريضة** و- نقاط). بدون جداول.
- قارن مع الفترة السابقة لما بيفيد (بالنسبة المئوية).
- اختم بـ٢-٤ اقتراحات عملية ومحددة للمطعم.
- الأرقام بالشيكل (₪).`;

async function analyze({ days, question, provider, model }) {
  const cfg = await store.getConfig();
  const p = provider || cfg.analysis.provider || cfg.chat.provider;
  const m = provider ? model : cfg.analysis.provider ? cfg.analysis.model : cfg.chat.model;
  const data = await collect(days);
  if (!data.الإجمالي.طلبات && !data.الفترة_السابقة_للمقارنة.طلبات) {
    return { text: 'ما في طلبات بهاي الفترة لحتى أحللها.', data };
  }
  const q = String(question || '').trim() || 'اعطيني تحليل شامل لأداء المطعم بهاي الفترة.';
  const out = await ai.runAgent({
    provider: p, model: m, system: SYSTEM, kind: 'analysis', maxTokens: 1500,
    history: [{ role: 'user', text: `البيانات (JSON):\n${JSON.stringify(data)}\n\nالسؤال: ${q.slice(0, 1000)}` }],
  });
  return { text: out.text || 'ما رجع جواب.', provider: p };
}

module.exports = { analyze, collect };
