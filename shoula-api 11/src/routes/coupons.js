const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /api/coupons — محمي (لوحة التحكم بس، ما لازم الزبون يشوف كل الأكواد)
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
  res.json(result.rows);
}));

// POST /api/coupons/validate — عام، الموقع بيستخدمه ليتأكد من كود قبل ما يطبقه بالسلة
router.post('/validate', asyncHandler(async (req, res) => {
  const { code, subtotal } = req.body || {};
  if (!code) return res.status(400).json({ error: 'اكتبي كود الخصم' });

  const result = await pool.query(
    `SELECT * FROM coupons WHERE code = $1 AND active = true
     AND (expires_at IS NULL OR expires_at > now())
     AND (max_uses IS NULL OR used_count < max_uses)`,
    [code.trim().toUpperCase()]
  );
  const coupon = result.rows[0];
  if (!coupon) return res.status(404).json({ error: 'كود الخصم غير صالح أو منتهي' });
  if (subtotal !== undefined && Number(subtotal) < Number(coupon.min_order)) {
    return res.status(400).json({ error: `هاد الكود يحتاج طلب بقيمة ${coupon.min_order} على الأقل` });
  }

  res.json({
    code: coupon.code,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    min_order: coupon.min_order
  });
}));

// POST /api/coupons — محمي
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { code, discount_type, discount_value, min_order, max_uses, expires_at } = req.body || {};
  if (!code || discount_value === undefined) {
    return res.status(400).json({ error: 'الكود وقيمة الخصم مطلوبين' });
  }
  if (!['percent', 'fixed'].includes(discount_type)) {
    return res.status(400).json({ error: 'نوع الخصم لازم يكون percent أو fixed' });
  }
  const result = await pool.query(
    `INSERT INTO coupons (code, discount_type, discount_value, min_order, max_uses, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [code.trim().toUpperCase(), discount_type, discount_value, min_order || 0, max_uses || null, expires_at || null]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/coupons/:id — محمي
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { active, discount_value, min_order, max_uses, expires_at } = req.body || {};
  const result = await pool.query(
    `UPDATE coupons SET
      active = COALESCE($1, active),
      discount_value = COALESCE($2, discount_value),
      min_order = COALESCE($3, min_order),
      max_uses = COALESCE($4, max_uses),
      expires_at = COALESCE($5, expires_at)
     WHERE id = $6 RETURNING *`,
    [active, discount_value, min_order, max_uses, expires_at, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'الكوبون مش موجود' });
  res.json(result.rows[0]);
}));

// DELETE /api/coupons/:id — محمي
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM coupons WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'الكوبون مش موجود' });
  res.json({ success: true });
}));

module.exports = router;
