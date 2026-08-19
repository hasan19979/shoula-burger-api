const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const SLUG_RE = /^[a-z0-9_-]+$/;

// GET /api/categories — عام، تستخدمه واجهة الموقع
router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT id, slug, name, icon, sort_order FROM categories ORDER BY sort_order, id');
  res.json(result.rows);
}));

// POST /api/categories — محمي، لوحة التحكم بس
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { slug, name, icon, sort_order } = req.body || {};
  if (!slug || !name) return res.status(400).json({ error: 'المعرف (slug) والاسم مطلوبين' });
  if (!SLUG_RE.test(slug)) return res.status(400).json({ error: 'المعرف لازم يكون أحرف إنجليزية صغيرة وأرقام وشرطات بس' });

  const result = await pool.query(
    `INSERT INTO categories (slug, name, icon, sort_order) VALUES ($1, $2, $3, COALESCE($4, 0)) RETURNING *`,
    [slug, name, icon || 'ti-circle-dot', sort_order]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/categories/:id — محمي
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, icon, sort_order } = req.body || {};
  const result = await pool.query(
    `UPDATE categories SET name = COALESCE($1, name), icon = COALESCE($2, icon), sort_order = COALESCE($3, sort_order)
     WHERE id = $4 RETURNING *`,
    [name, icon, sort_order, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'الفئة مش موجودة' });
  res.json(result.rows[0]);
}));

// DELETE /api/categories/:id — محمي، بيرفض الحذف لو في منتجات مرتبطة (RESTRICT بقاعدة البيانات)
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'الفئة مش موجودة' });
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') { // foreign key violation
      return res.status(409).json({ error: 'ما بقدر أحذف هاي الفئة لأنه في أصناف بالمنيو مرتبطة فيها. احذفي أو نقّلي الأصناف أولاً.' });
    }
    throw err;
  }
}));

module.exports = router;
