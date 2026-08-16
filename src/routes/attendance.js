const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireStaffAuth = require('../middleware/staffAuth');
const { requireStaffRole } = require('../middleware/staffAuth');

const router = express.Router();

// GET /api/attendance/status — أي موظف يشوف بس حالته هو (هل هو بالدوام حالياً؟)
router.get('/status', requireStaffAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM time_entries WHERE staff_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
    [req.staff.staffId]
  );
  res.json({ clockedIn: rows.length > 0, entry: rows[0] || null });
}));

// POST /api/attendance/clock-in
router.post('/clock-in', requireStaffAuth, asyncHandler(async (req, res) => {
  const existing = await pool.query(
    'SELECT id FROM time_entries WHERE staff_id = $1 AND clock_out IS NULL',
    [req.staff.staffId]
  );
  if (existing.rows.length) return res.status(409).json({ error: 'إنتِ مسجّلة حضور أصلاً — سجّلي انصراف الأول' });

  const result = await pool.query(
    'INSERT INTO time_entries (staff_id) VALUES ($1) RETURNING *',
    [req.staff.staffId]
  );
  res.status(201).json(result.rows[0]);
}));

// POST /api/attendance/clock-out
router.post('/clock-out', requireStaffAuth, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `UPDATE time_entries SET clock_out = now()
     WHERE staff_id = $1 AND clock_out IS NULL
     RETURNING *`,
    [req.staff.staffId]
  );
  if (!result.rows.length) return res.status(400).json({ error: 'ما إنتِ مسجّلة حضور حالياً' });
  res.json(result.rows[0]);
}));

// GET /api/attendance — محمي (مدير/مدير عام بس): كل السجلات، مع فلتر تاريخ اختياري
router.get('/', requireStaffAuth, requireStaffRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { from, to, staffId } = req.query;
  const conditions = [];
  const params = [];

  if (from) { params.push(from); conditions.push(`t.clock_in >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`t.clock_in <= $${params.length}`); }
  if (staffId) { params.push(staffId); conditions.push(`t.staff_id = $${params.length}`); }

  let sql = `
    SELECT t.*, s.name AS staff_name, s.hourly_rate
    FROM time_entries t
    JOIN staff_users s ON s.id = t.staff_id`;
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY t.clock_in DESC LIMIT 500';

  const { rows } = await pool.query(sql, params);
  res.json(rows);
}));

module.exports = router;
