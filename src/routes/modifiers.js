const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /api/modifiers — عام: كل المجموعات مع خياراتها
router.get('/', asyncHandler(async (req, res) => {
  const { rows: groups } = await pool.query('SELECT * FROM modifier_groups ORDER BY sort_order, id');
  const { rows: options } = await pool.query('SELECT * FROM modifier_options ORDER BY sort_order, id');
  const optionsByGroup = {};
  for (const opt of options) (optionsByGroup[opt.group_id] ||= []).push(opt);
  res.json(groups.map((g) => ({ ...g, options: optionsByGroup[g.id] || [] })));
}));

// POST /api/modifiers — محمي: مجموعة جديدة
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { name, selection_type, required, min_select, max_select } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم المجموعة مطلوب' });
  const result = await pool.query(
    `INSERT INTO modifier_groups (name, selection_type, required, min_select, max_select)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, selection_type || 'multiple', !!required, min_select || 0, max_select || 1]
  );
  res.status(201).json({ ...result.rows[0], options: [] });
}));

// PUT /api/modifiers/:id — محمي: تعديل بيانات المجموعة
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { name, selection_type, required, min_select, max_select } = req.body || {};
  const result = await pool.query(
    `UPDATE modifier_groups SET
      name = COALESCE($1, name), selection_type = COALESCE($2, selection_type),
      required = COALESCE($3, required), min_select = COALESCE($4, min_select), max_select = COALESCE($5, max_select)
     WHERE id = $6 RETURNING *`,
    [name, selection_type, required, min_select, max_select, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'المجموعة مش موجودة' });
  res.json(result.rows[0]);
}));

// DELETE /api/modifiers/:id — محمي
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM modifier_groups WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'المجموعة مش موجودة' });
  res.json({ success: true });
}));

// POST /api/modifiers/:id/options — محمي: خيار جديد بمجموعة
router.post('/:id/options', requireAuth, asyncHandler(async (req, res) => {
  const { name, price, default_included } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم الخيار مطلوب' });
  const result = await pool.query(
    'INSERT INTO modifier_options (group_id, name, price, default_included) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, name, price || 0, !!default_included]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/modifiers/options/:optionId — محمي
router.put('/options/:optionId', requireAuth, asyncHandler(async (req, res) => {
  const { name, price, default_included } = req.body || {};
  const result = await pool.query(
    `UPDATE modifier_options SET name = COALESCE($1,name), price = COALESCE($2,price), default_included = COALESCE($3,default_included)
     WHERE id = $4 RETURNING *`,
    [name, price, default_included, req.params.optionId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'الخيار مش موجود' });
  res.json(result.rows[0]);
}));

// DELETE /api/modifiers/options/:optionId — محمي
router.delete('/options/:optionId', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM modifier_options WHERE id = $1 RETURNING id', [req.params.optionId]);
  if (!result.rows.length) return res.status(404).json({ error: 'الخيار مش موجود' });
  res.json({ success: true });
}));

module.exports = router;
