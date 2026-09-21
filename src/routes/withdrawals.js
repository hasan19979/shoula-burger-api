const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAnyAuth = require('../middleware/anyAuth');

const router = express.Router();

// GET /api/withdrawals?from=YYYY-MM-DD&to=YYYY-MM-DD&recipientType=&recipientId= — سجل السحوبات، بترتيب الأحدث أول
router.get('/', requireAnyAuth, asyncHandler(async (req, res) => {
  const { from, to, recipientType, recipientId } = req.query;
  const conditions = [];
  const params = [];
  if (from) {
    params.push(`${from} 00:00:00`);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (to) {
    params.push(`${to} 23:59:59`);
    conditions.push(`created_at <= $${params.length}`);
  }
  if (recipientType) {
    params.push(recipientType);
    conditions.push(`recipient_type = $${params.length}`);
  }
  if (recipientId) {
    params.push(recipientId);
    conditions.push(`recipient_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM cash_withdrawals ${where} ORDER BY created_at DESC`, params);
  res.json(rows);
}));

// POST /api/withdrawals — تسجيل سحبة جديدة من الصندوق
router.post('/', requireAnyAuth, asyncHandler(async (req, res) => {
  const { amount, reason, recipientType, recipientId, recipientName } = req.body || {};
  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) return res.status(400).json({ error: 'المبلغ لازم يكون رقم أكبر من صفر' });

  const staffName = req.staff?.name || req.admin?.email || null;
  const result = await pool.query(
    'INSERT INTO cash_withdrawals (amount, reason, staff_name, recipient_type, recipient_id, recipient_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [numAmount, reason || '', staffName, recipientType || null, recipientId || null, recipientName || null]
  );
  res.status(201).json(result.rows[0]);
}));

// DELETE /api/withdrawals/:id — حذف سحبة (تصحيح خطأ إدخال)
router.delete('/:id', requireAnyAuth, asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM cash_withdrawals WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'السحبة مش موجودة' });
  res.json({ success: true });
}));

module.exports = router;
