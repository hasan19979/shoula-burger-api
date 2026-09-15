const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// بتحسب مبيعات الكاش خلال الشفت (من وقت الفتح لهلق، أو لوقت الإغلاق لو محدد)
async function calcCashSales(openedAt, closedAt) {
  const params = [openedAt];
  let sql = `SELECT COALESCE(SUM(total),0) AS cash_total, COUNT(*) AS cash_count
             FROM orders WHERE payment_method = 'cash' AND status != 'cancelled' AND created_at >= $1`;
  if (closedAt) { params.push(closedAt); sql += ` AND created_at <= $2`; }
  const { rows } = await pool.query(sql, params);
  return { cashTotal: Number(rows[0].cash_total), cashCount: Number(rows[0].cash_count) };
}

async function calcCardSales(openedAt, closedAt) {
  const params = [openedAt];
  let sql = `SELECT COALESCE(SUM(total),0) AS card_total, COUNT(*) AS card_count
             FROM orders WHERE payment_method = 'card' AND status != 'cancelled' AND created_at >= $1`;
  if (closedAt) { params.push(closedAt); sql += ` AND created_at <= $2`; }
  const { rows } = await pool.query(sql, params);
  return { cardTotal: Number(rows[0].card_total), cardCount: Number(rows[0].card_count) };
}

// GET /api/shifts/current — محمي: الشفت المفتوح حالياً (لو في)، مع أرقام حية
router.get('/current', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1`);
  const shift = rows[0];
  if (!shift) return res.json(null);

  const cash = await calcCashSales(shift.opened_at);
  const card = await calcCardSales(shift.opened_at);
  res.json({
    ...shift,
    liveCashSales: cash.cashTotal,
    liveCashOrders: cash.cashCount,
    liveCardSales: card.cardTotal,
    liveCardOrders: card.cardCount,
    liveExpectedCash: Number(shift.opening_cash) + cash.cashTotal
  });
}));

// POST /api/shifts/open — محمي
router.post('/open', requireAuth, asyncHandler(async (req, res) => {
  const { openingCash } = req.body || {};
  const existing = await pool.query(`SELECT id FROM cash_shifts WHERE status = 'open' LIMIT 1`);
  if (existing.rows.length) return res.status(409).json({ error: 'في شفت مفتوح أصلاً — لازم تقفليه قبل ما تفتحي وحدة جديدة' });

  const result = await pool.query(
    `INSERT INTO cash_shifts (opened_by, opened_by_name, opening_cash) VALUES ($1,$2,$3) RETURNING *`,
    [req.admin.id, req.admin.name || req.admin.email, Number(openingCash) || 0]
  );
  res.status(201).json(result.rows[0]);
}));

// POST /api/shifts/:id/close — محمي
router.post('/:id/close', requireAuth, asyncHandler(async (req, res) => {
  const { closingCashActual, notes } = req.body || {};
  if (closingCashActual === undefined || closingCashActual === null) {
    return res.status(400).json({ error: 'لازم تكتبي المبلغ الفعلي بالدرج' });
  }

  const { rows } = await pool.query(`SELECT * FROM cash_shifts WHERE id = $1`, [req.params.id]);
  const shift = rows[0];
  if (!shift) return res.status(404).json({ error: 'الشفت مش موجود' });
  if (shift.status === 'closed') return res.status(409).json({ error: 'هاد الشفت مقفول أصلاً' });

  const closedAt = new Date();
  const cash = await calcCashSales(shift.opened_at, closedAt);
  const expected = Number(shift.opening_cash) + cash.cashTotal;
  const actual = Number(closingCashActual);
  const difference = actual - expected;

  const result = await pool.query(
    `UPDATE cash_shifts SET
      status = 'closed', closed_at = $1, closing_cash_expected = $2,
      closing_cash_actual = $3, difference = $4, notes = $5
     WHERE id = $6 RETURNING *`,
    [closedAt, expected, actual, difference, notes || '', req.params.id]
  );
  res.json(result.rows[0]);
}));

// GET /api/shifts — محمي: سجل الشفتات السابقة
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM cash_shifts ORDER BY opened_at DESC LIMIT 100`);
  res.json(rows);
}));

module.exports = router;
