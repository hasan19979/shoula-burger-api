const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAnyAuth = require('../middleware/anyAuth');

const router = express.Router();

function requireManagementLevel(req, res, next) {
  if (req.staff && !['admin', 'manager'].includes(req.staff.role)) {
    return res.status(403).json({ error: 'إدارة الموردين محصورة بالمدير/المدير العام' });
  }
  next();
}

// GET /api/suppliers — محمي، مع إجمالي المشتريات من كل مورد
router.get('/', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      s.*,
      COUNT(sm.id) AS purchase_count,
      COALESCE(SUM(sm.quantity * sm.unit_cost) FILTER (WHERE sm.type = 'purchase'), 0) AS total_spent
    FROM suppliers s
    LEFT JOIN stock_movements sm ON sm.supplier_id = s.id
    GROUP BY s.id
    ORDER BY s.name
  `);
  res.json(rows);
}));

// POST /api/suppliers — محمي
router.post('/', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const { name, contactPerson, phone, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم المورد مطلوب' });
  const result = await pool.query(
    'INSERT INTO suppliers (name, contact_person, phone, notes) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, contactPerson || '', phone || '', notes || '']
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/suppliers/:id — محمي
router.put('/:id', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const { name, contactPerson, phone, notes } = req.body || {};
  const result = await pool.query(
    `UPDATE suppliers SET name = COALESCE($1,name), contact_person = COALESCE($2,contact_person),
      phone = COALESCE($3,phone), notes = COALESCE($4,notes)
     WHERE id = $5 RETURNING *`,
    [name, contactPerson, phone, notes, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'المورد مش موجود' });
  res.json(result.rows[0]);
}));

// DELETE /api/suppliers/:id — محمي
router.delete('/:id', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM suppliers WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'المورد مش موجود' });
  res.json({ success: true });
}));

// GET /api/suppliers/:id/purchases — محمي: سجل مشتريات مورد معيّن
router.get('/:id/purchases', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT sm.*, ii.name AS item_name, ii.unit
    FROM stock_movements sm
    JOIN inventory_items ii ON ii.id = sm.inventory_item_id
    WHERE sm.supplier_id = $1 AND sm.type = 'purchase'
    ORDER BY sm.created_at DESC
    LIMIT 200
  `, [req.params.id]);
  res.json(rows);
}));

module.exports = router;
