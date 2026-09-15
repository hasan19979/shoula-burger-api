const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const ALLOWED_FIELDS = [
  'restaurant_name','tagline','logo_letter','logo_image','hours_text',
  'open_time','close_time','whatsapp_number','maps_url','currency',
  'delivery_fee','min_order'
];

// GET /api/settings — عام، الموقع بيقرا منه مباشرة
router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM settings WHERE id = 1');
  res.json(result.rows[0] || {});
}));

// PUT /api/settings — محمي
router.put('/', requireAuth, asyncHandler(async (req, res) => {
  const fields = req.body || {};
  const sets = [];
  const params = [];
  for (const key of ALLOWED_FIELDS) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'ما في أي حقل للتحديث' });
  sets.push('updated_at = now()');

  const result = await pool.query(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1 RETURNING *`, params);
  res.json(result.rows[0]);
}));

module.exports = router;
