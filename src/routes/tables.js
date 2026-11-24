const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAnyAuth = require('../middleware/anyAuth');
const requireStaffAuth = require('../middleware/staffAuth');

const router = express.Router();

// GET /api/tables — عام. بيرجع كل الطاولات (المفعّلة والمعطّلة) — شاشة الطاولات الحية بتفلتر
// المعطّلة بنفسها، وشاشة الإعدادات بتوريهم كلهم للإدارة
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM restaurant_tables ORDER BY number');
  res.json(rows);
}));

// POST /api/tables — محمي: إضافة طاولة جديدة
router.post('/', requireAnyAuth, asyncHandler(async (req, res) => {
  const { number, seats } = req.body || {};
  if (!number) return res.status(400).json({ error: 'رقم الطاولة مطلوب' });
  const result = await pool.query(
    'INSERT INTO restaurant_tables (number, seats) VALUES ($1,$2) RETURNING *',
    [number, seats || 4]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/tables/:id — محمي: تعديل رقم الطاولة وعدد الكراسي
router.put('/:id', requireAnyAuth, asyncHandler(async (req, res) => {
  const { number, seats } = req.body || {};
  const result = await pool.query(
    `UPDATE restaurant_tables SET number = COALESCE($1, number), seats = COALESCE($2, seats)
     WHERE id = $3 RETURNING *`,
    [number, seats, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'الطاولة مش موجودة' });
  res.json(result.rows[0]);
}));

// PATCH /api/tables/:id/enabled — محمي: تفعيل/تعطيل طاولة من الإعدادات
router.patch('/:id/enabled', requireAnyAuth, asyncHandler(async (req, res) => {
  const { enabled } = req.body || {};
  const result = await pool.query(
    'UPDATE restaurant_tables SET enabled = $1 WHERE id = $2 RETURNING *',
    [!!enabled, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'الطاولة مش موجودة' });
  res.json(result.rows[0]);
}));

// PATCH /api/tables/:id/open — محمي
router.patch('/:id/open', requireStaffAuth, asyncHandler(async (req, res) => {
  const { partySize } = req.body || {};
  const result = await pool.query(
    `UPDATE restaurant_tables SET status = 'occupied', party_size = $1, opened_at = now(), cashier_name = $2,
       reserved_name = NULL, reserved_phone = NULL, reserved_for = NULL, reserved_party = NULL, reserved_note = NULL
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
      ${clearSession ? ', party_size = NULL, opened_at = NULL, cashier_name = NULL, reserved_name = NULL, reserved_phone = NULL, reserved_for = NULL, reserved_party = NULL, reserved_note = NULL' : ''}
     WHERE id = $2 RETURNING *`,
    [status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'الطاولة مش موجودة' });
  res.json(result.rows[0]);
}));

// PATCH /api/tables/:id/reserve — محمي: حجز طاولة باسم ورقم تلفون ووقت
router.patch('/:id/reserve', requireStaffAuth, asyncHandler(async (req, res) => {
  const { name, phone, time, partySize, note } = req.body || {};
  const cleanPhone = String(phone || '').replace(/[^\d+]/g, '');
  if (cleanPhone.length < 7) return res.status(400).json({ error: 'اكتبي رقم تلفون الزبون' });
  const when = time ? new Date(time) : null;
  if (time && isNaN(when)) return res.status(400).json({ error: 'وقت الحجز مش مفهوم' });
  const { rows: cur } = await pool.query('SELECT status FROM restaurant_tables WHERE id = $1', [req.params.id]);
  if (!cur.length) return res.status(404).json({ error: 'الطاولة مش موجودة' });
  if (cur[0].status === 'occupied') return res.status(409).json({ error: 'الطاولة مشغولة هلأ — ما بينفع تنحجز' });
  const result = await pool.query(
    `UPDATE restaurant_tables SET status = 'reserved', reserved_name = $1, reserved_phone = $2, reserved_for = $3,
       reserved_party = $4, reserved_note = $5
     WHERE id = $6 RETURNING *`,
    [String(name || '').trim() || null, cleanPhone, when, Number(partySize) || null, String(note || '').trim() || null, req.params.id]
  );
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
