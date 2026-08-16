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
      COUNT(o.id) FILTER (WHERE o.status = 'completed') AS order_count,
      COALESCE(SUM(o.total) FILTER (WHERE o.status = 'completed'), 0) AS total_spent,
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
    WHERE o.customer_id = $1 AND o.status = 'completed'
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

module.exports = router;
