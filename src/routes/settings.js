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
  'loyalty_enabled','loyalty_earn_amount','loyalty_redeem_value',
  'receipt_header_slogan_image','receipt_header_lines','receipt_subtitle_delivery','receipt_subtitle_takeaway',
  'receipt_subtitle_dinein','receipt_qr_image','receipt_thanks_text','receipt_bottom_text',
  'receipt_notes_font_size','receipt_table_number_font_size','receipt_order_number_font_size',
  'receipt_customer_font_size','receipt_total_font_size','receipt_logo_size','receipt_qr_size',
  'receipt_name_autofit','receipt_name_min_font_size','receipt_show_item_icon'
];

const BOOLEAN_FIELDS = ['receipt_name_autofit', 'receipt_show_item_icon'];

// حدود آمنة لقيم الطباعة — أي رقم خارجها بيتقصّ للحد الأقرب، حتى ما تنكسر الفاتورة بقيمة غلط بالغلط
// [أدنى, أعلى]. الأحجام بالبكسل، والأبعاد بالمليمتر على تصميم 56مم
const PRINT_LIMITS = {
  receipt_item_font_size: [10, 22], receipt_notes_font_size: [8, 16], receipt_table_number_font_size: [9, 18],
  receipt_order_number_font_size: [11, 26], receipt_customer_font_size: [10, 22], receipt_total_font_size: [10, 22],
  receipt_col_qty_width: [4, 14], receipt_col_price_width: [5, 16], receipt_col_total_width: [6, 18],
  receipt_logo_size: [12, 34], receipt_qr_size: [14, 30], receipt_name_min_font_size: [9, 14],
};

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
      let value = fields[key];
      if (BOOLEAN_FIELDS.includes(key)) value = value === true || value === 'true' || value === 1;
      if (PRINT_LIMITS[key]) {
        const n = Number(value);
        if (!Number.isFinite(n)) return res.status(400).json({ error: 'قيمة الطباعة لازم تكون رقم' });
        value = Math.min(PRINT_LIMITS[key][1], Math.max(PRINT_LIMITS[key][0], Math.round(n)));
      }
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'ما في أي حقل للتحديث' });
  sets.push('updated_at = now()');

  const result = await pool.query(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1 RETURNING *`, params);
  res.json(result.rows[0]);
}));

module.exports = router;
