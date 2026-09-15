const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAnyAuth = require('../middleware/anyAuth');
const requireStaffAuth = require('../middleware/staffAuth');

const router = express.Router();

function requireManagementLevel(req, res, next) {
  if (req.staff && !['admin', 'manager'].includes(req.staff.role)) {
    return res.status(403).json({ error: 'ملفات العملاء محصورة بالمدير/المدير العام' });
  }
  next();
}

// GET /api/customers — محمي (مدير/مدير عام): قائمة العملاء مع إحصائيات كل وحد
router.get('/', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      c.id, c.name, c.phone, c.address, c.loyalty_points, c.created_at,
      COUNT(o.id) FILTER (WHERE o.status != 'cancelled') AS order_count,
      COALESCE(SUM(o.total) FILTER (WHERE o.status != 'cancelled'), 0) AS total_spent,
      MAX(o.created_at) AS last_order_at
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    WHERE c.phone != '-'
    GROUP BY c.id
    ORDER BY total_spent DESC
  `);
  res.json(rows);
}));

// GET /api/customers/:id/favorite-items — أكتر ٣ أصناف طلبهم هاد الزبون
router.get('/:id/favorite-items', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT oi.product_name, SUM(oi.quantity) AS total_quantity
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.customer_id = $1 AND o.status != 'cancelled'
    GROUP BY oi.product_name
    ORDER BY total_quantity DESC
    LIMIT 3
  `, [req.params.id]);
  res.json(rows);
}));

// GET /api/customers/lookup?phone=... — عام لأي موظف كاشير، لعرض رصيد النقاط وقت الدفع
router.get('/lookup', requireStaffAuth, asyncHandler(async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'رقم الجوال مطلوب' });
  const { rows } = await pool.query('SELECT name, phone, loyalty_points FROM customers WHERE phone = $1', [phone]);
  res.json(rows[0] || null);
}));

// GET /api/customers/address-history?phone=... — عام (بدون تسجيل دخول)، لموقع الطلب العام:
// بيرجع اسم الزبون (لو معروف) وآخر ٥ عناوين مختلفة استخدمها بطلبات سابقة، الأحدث أولاً
router.get('/address-history', asyncHandler(async (req, res) => {
  const { phone } = req.query;
  if (!phone || String(phone).trim().length < 6) {
    return res.json({ name: null, addresses: [] }); // رقم قصير/فاضي — منرجع نتيجة فاضية بهدوء بدل خطأ
  }

  const { rows: addressRows } = await pool.query(
    `SELECT address, MAX(created_at) AS last_used
     FROM orders
     WHERE customer_phone = $1 AND address IS NOT NULL AND address != '' AND status != 'cancelled'
     GROUP BY address
     ORDER BY last_used DESC
     LIMIT 5`,
    [phone]
  );
  const { rows: nameRows } = await pool.query('SELECT name FROM customers WHERE phone = $1', [phone]);

  res.json({
    name: nameRows[0]?.name || null,
    addresses: addressRows.map((r) => r.address),
  });
}));

module.exports = router;
