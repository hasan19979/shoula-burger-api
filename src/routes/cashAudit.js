const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAnyAuth = require('../middleware/anyAuth');

const router = express.Router();

// GET /api/cash-audit/summary?date=YYYY-MM-DD — بيحسب مجموع الطلبات (غير الملغاة) ومجموع السحوبات لهاد التاريخ
router.get('/summary', requireAnyAuth, asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });

  const from = `${date} 00:00:00`;
  const to = `${date} 23:59:59`;

  const ordersRes = await pool.query(
    `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
     FROM orders WHERE status != 'cancelled' AND created_at BETWEEN $1 AND $2`,
    [from, to]
  );
  const withdrawalsRes = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
     FROM cash_withdrawals WHERE created_at BETWEEN $1 AND $2`,
    [from, to]
  );

  res.json({
    ordersTotal: Number(ordersRes.rows[0].total),
    ordersCount: Number(ordersRes.rows[0].count),
    withdrawalsTotal: Number(withdrawalsRes.rows[0].total),
    withdrawalsCount: Number(withdrawalsRes.rows[0].count),
  });
}));

// GET /api/cash-audit?date=YYYY-MM-DD — بيرجع سجل الجرد المحفوظ لهاد التاريخ لو موجود
router.get('/', requireAnyAuth, asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const { rows } = await pool.query('SELECT * FROM cash_register_audits WHERE audit_date = $1', [date]);
  res.json(rows[0] || null);
}));

// POST /api/cash-audit — حفظ (أو تصحيح) جرد يوم معيّن
router.post('/', requireAnyAuth, asyncHandler(async (req, res) => {
  const { date, openingBalance, ordersTotal, withdrawalsTotal, actualAmount } = req.body || {};
  if (!date || openingBalance === undefined || actualAmount === undefined) {
    return res.status(400).json({ error: 'التاريخ، الرصيد الافتتاحي، والمبلغ الفعلي كلهم مطلوبين' });
  }
  const expected = Number(openingBalance) + Number(ordersTotal || 0) - Number(withdrawalsTotal || 0);
  const difference = Number(actualAmount) - expected;
  const staffName = req.staff?.name || req.admin?.email || null;

  const result = await pool.query(
    `INSERT INTO cash_register_audits (audit_date, opening_balance, orders_total, withdrawals_total, expected_amount, actual_amount, difference, staff_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (audit_date) DO UPDATE SET
       opening_balance = EXCLUDED.opening_balance,
       orders_total = EXCLUDED.orders_total,
       withdrawals_total = EXCLUDED.withdrawals_total,
       expected_amount = EXCLUDED.expected_amount,
       actual_amount = EXCLUDED.actual_amount,
       difference = EXCLUDED.difference,
       staff_name = EXCLUDED.staff_name
     RETURNING *`,
    [date, openingBalance, ordersTotal || 0, withdrawalsTotal || 0, expected, actualAmount, difference, staffName]
  );
  res.status(201).json(result.rows[0]);
}));

module.exports = router;
