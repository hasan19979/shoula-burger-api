const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAnyAuth = require('../middleware/anyAuth');

const router = express.Router();

const ALLOWED_FIELDS = [
  'restaurant_name','tagline','logo_letter','logo_image','tagline_image','hours_text',
  'open_time','close_time','whatsapp_number','maps_url','currency',
  'delivery_fee','min_order',
  'receipt_item_font_size','receipt_col_qty_width','receipt_col_price_width','receipt_col_total_width',
  'loyalty_enabled','loyalty_earn_amount','loyalty_redeem_value'
];

// GET /api/settings — عام، الموقع بيقرا منه مباشرة
router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM settings WHERE id = 1');
  res.json(result.rows[0] || {});
}));

// PUT /api/settings — محمي (تسجيل دخول لوحة التحكم أو رمز موظف)
router.put('/', requireAnyAuth, asyncHandler(async (req, res) => {
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
