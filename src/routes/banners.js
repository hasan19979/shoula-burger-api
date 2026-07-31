const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /api/banners — عام، الموقع بيقرا منه (بس البانرات المفعّلة)
router.get('/', asyncHandler(async (req, res) => {
  const onlyActive = req.query.all !== 'true'; // لوحة التحكم بتبعت ?all=true حتى تشوف حتى المعطّلة
  let sql = 'SELECT * FROM banners';
  if (onlyActive) sql += ' WHERE active = true';
  sql += ' ORDER BY sort_order, id';
  const result = await pool.query(sql);
  res.json(result.rows);
}));

// POST /api/banners — محمي
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { title, subtitle, image_url, link_url, active, sort_order } = req.body || {};
  if (!image_url) return res.status(400).json({ error: 'رابط الصورة مطلوب' });
  const result = await pool.query(
    `INSERT INTO banners (title, subtitle, image_url, link_url, active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [title || '', subtitle || '', image_url, link_url || '', active !== false, sort_order || 0]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/banners/:id — محمي
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { title, subtitle, image_url, link_url, active, sort_order } = req.body || {};
  const result = await pool.query(
    `UPDATE banners SET
      title = COALESCE($1, title), subtitle = COALESCE($2, subtitle),
      image_url = COALESCE($3, image_url), link_url = COALESCE($4, link_url),
      active = COALESCE($5, active), sort_order = COALESCE($6, sort_order)
     WHERE id = $7 RETURNING *`,
    [title, subtitle, image_url, link_url, active, sort_order, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'البانر مش موجود' });
  res.json(result.rows[0]);
}));

// DELETE /api/banners/:id — محمي
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM banners WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'البانر مش موجود' });
  res.json({ success: true });
}));

module.exports = router;
