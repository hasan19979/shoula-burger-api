const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');
const requireStaffAuth = require('../middleware/staffAuth');

const router = express.Router();

// GET /api/tables — عام
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM restaurant_tables ORDER BY number');
  res.json(rows);
}));

// POST /api/tables — محمي: إضافة طاولة جديدة
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { number, seats } = req.body || {};
  if (!number) return res.status(400).json({ error: 'رقم الطاولة مطلوب' });
  const result = await pool.query(
    'INSERT INTO restaurant_tables (number, seats) VALUES ($1,$2) RETURNING *',
    [number, seats || 4]
  );
  res.status(201).json(result.rows[0]);
}));

// PATCH /api/tables/:id/open — محمي
router.patch('/:id/open', requireStaffAuth, asyncHandler(async (req, res) => {
  const { partySize } = req.body || {};
  const result = await pool.query(
    `UPDATE restaurant_tables SET status = 'occupied', party_size = $1, opened_at = now(), cashier_name = $2
     WHERE id = $3 RETURNING *`,
    [partySize || null, req.staff?.name || '', req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'الطاولة مش موجودة' });
  res.json(result.rows[0]);
}));

// PATCH /api/tables/:id/status — محمي: تحديث الحالة (needs-cleaning / available / reserved)
router.patch('/:id/status', requireStaffAuth, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  const valid = ['available', 'occupied', 'reserved', 'needs-cleaning'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'حالة غير معروفة' });

  const clearSession = status === 'available' || status === 'needs-cleaning';
  const result = await pool.query(
    `UPDATE restaurant_tables SET status = $1
      ${clearSession ? ', party_size = NULL, opened_at = NULL, cashier_name = NULL' : ''}
     WHERE id = $2 RETURNING *`,
    [status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'الطاولة مش موجودة' });
  res.json(result.rows[0]);
}));

// POST /api/tables/:id/transfer — محمي: نقل جلسة لطاولة تانية فارغة
router.post('/:id/transfer', requireStaffAuth, asyncHandler(async (req, res) => {
  const { toTableId } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fromRes = await client.query('SELECT * FROM restaurant_tables WHERE id = $1', [req.params.id]);
    if (!fromRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'الطاولة الأصلية مش موجودة' }); }
    const from = fromRes.rows[0];

    await client.query(
      `UPDATE restaurant_tables SET status='occupied', party_size=$1, opened_at=$2, cashier_name=$3 WHERE id=$4`,
      [from.party_size, from.opened_at, from.cashier_name, toTableId]
    );
    await client.query(
      `UPDATE restaurant_tables SET status='available', party_size=NULL, opened_at=NULL, cashier_name=NULL WHERE id=$1`,
      [req.params.id]
    );
    await client.query('COMMIT');
    const { rows } = await pool.query('SELECT * FROM restaurant_tables ORDER BY number');
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
