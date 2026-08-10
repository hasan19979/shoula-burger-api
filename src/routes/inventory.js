const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /api/inventory — عام: قائمة المخزون
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM inventory_items ORDER BY name');
  res.json(rows);
}));

// POST /api/inventory — محمي
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { name, unit, quantity, min_threshold, cost_per_unit } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم المادة مطلوب' });
  const result = await pool.query(
    'INSERT INTO inventory_items (name, unit, quantity, min_threshold, cost_per_unit) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, unit || 'piece', quantity || 0, min_threshold || 0, cost_per_unit || null]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/inventory/:id — محمي
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { name, unit, min_threshold, cost_per_unit } = req.body || {};
  const result = await pool.query(
    `UPDATE inventory_items SET name = COALESCE($1,name), unit = COALESCE($2,unit),
      min_threshold = COALESCE($3,min_threshold), cost_per_unit = COALESCE($4,cost_per_unit)
     WHERE id = $5 RETURNING *`,
    [name, unit, min_threshold, cost_per_unit, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'المادة مش موجودة' });
  res.json(result.rows[0]);
}));

// DELETE /api/inventory/:id — محمي
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM inventory_items WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'المادة مش موجودة' });
  res.json({ success: true });
}));

// POST /api/inventory/:id/adjust — محمي: شراء/هدر/تعديل يدوي (بيسجل حركة ويحدّث الكمية بمعاملة واحدة)
router.post('/:id/adjust', requireAuth, asyncHandler(async (req, res) => {
  const { delta, type, note } = req.body || {};
  if (!delta || !type) return res.status(400).json({ error: 'الكمية ونوع الحركة مطلوبين' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemRes = await client.query(
      'UPDATE inventory_items SET quantity = GREATEST(0, quantity + $1) WHERE id = $2 RETURNING *',
      [delta, req.params.id]
    );
    if (!itemRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'المادة مش موجودة' }); }
    await client.query(
      'INSERT INTO stock_movements (inventory_item_id, type, quantity, note) VALUES ($1,$2,$3,$4)',
      [req.params.id, type, delta, note || '']
    );
    await client.query('COMMIT');
    res.json(itemRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// بتستخدم داخلياً من مسار الطلبات (orders.js) بعد كل عملية بيع POS، مو Endpoint مباشر
async function deductForOrderItems(client, orderItems) {
  const deductions = new Map();
  for (const item of orderItems) {
    const { rows: recipe } = await client.query(
      'SELECT inventory_item_id, quantity FROM recipe_ingredients WHERE product_id = $1',
      [item.productId]
    );
    for (const ing of recipe) {
      const key = ing.inventory_item_id;
      deductions.set(key, (deductions.get(key) || 0) + Number(ing.quantity) * item.quantity);
    }
  }
  for (const [itemId, qty] of deductions) {
    await client.query('UPDATE inventory_items SET quantity = GREATEST(0, quantity - $1) WHERE id = $2', [qty, itemId]);
    await client.query(
      'INSERT INTO stock_movements (inventory_item_id, type, quantity, note) VALUES ($1,$2,$3,$4)',
      [itemId, 'sale-deduction', -qty, 'خصم تلقائي من عملية بيع']
    );
  }
}

module.exports = router;
module.exports.deductForOrderItems = deductForOrderItems;
