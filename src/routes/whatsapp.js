const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireStaffAuth = require('../middleware/staffAuth');
const { requireStaffRole } = requireStaffAuth;
const wa = require('../whatsapp');
const businessDay = require('../businessDay');
const { broadcast } = require('../realtime');

const router = express.Router();

const DEFAULT_ETA = 'أهلين {الاسم} 👋\nاستلمنا طلبك رقم {رقم_الطلب} وبيكون جاهز خلال {الدقائق} دقيقة تقريباً (حوالي الساعة {الوقت}).\nشكراً إنك اخترت {المطعم} 🔥';
const DEFAULT_READY = 'يا هلا {الاسم} 🔥\nطلبك رقم {رقم_الطلب} صار جاهز!\n{المطعم}';

/** الاسم الأول للتحية — "أبو أحمد" و"أم علي" بيضلوا كلمتين */
function firstName(name, fallback = 'يا غالي') {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return fallback;
  return /^(أبو|ابو|أم|ام|بنت|ابن)$/.test(w[0]) && w[1] ? `${w[0]} ${w[1]}` : w[0];
}

function clockAfter(minutes) {
  const d = new Date(Date.now() + minutes * 60000);
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: businessDay.TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

async function loadOrderAndSettings(id) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (!rows.length) return { order: null };
  const { rows: s } = await pool.query('SELECT * FROM settings WHERE id = 1');
  return { order: rows[0], settings: s[0] || {} };
}

function sendError(res, err) {
  if (err instanceof wa.WhatsAppError) return res.status(err.status).json({ error: err.message });
  throw err;
}

// GET /api/whatsapp/status — هل الربط مفعّل ومتصل؟ (للإعدادات وشاشة طلبات واتساب)
router.get('/status', requireStaffAuth, asyncHandler(async (req, res) => {
  res.json(await wa.connectionState());
}));

// POST /api/whatsapp/orders/:id/eta { minutes, force? } — بيبعت للزبون الوقت المقدّر للطلب
router.post('/orders/:id/eta', requireStaffAuth, asyncHandler(async (req, res) => {
  const minutes = Math.round(Number(req.body?.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) return res.status(400).json({ error: 'الوقت لازم يكون بين 1 و 240 دقيقة' });
  const { order, settings } = await loadOrderAndSettings(req.params.id);
  if (!order) return res.status(404).json({ error: 'الطلب مش موجود' });
  if (order.eta_sent_at && !req.body?.force) {
    return res.status(409).json({ error: `انبعت الوقت قبل (${order.eta_minutes} دقيقة). اكبسي "إرسال مرة تانية" إذا بدك تبعتي وقت جديد.`, code: 'ALREADY_SENT' });
  }
  const number = wa.normalizePhone(order.customer_phone);
  if (!number) return res.status(422).json({ error: 'رقم الزبون مش صالح للواتساب' });

  const text = wa.fillTemplate(settings.wa_eta_template || DEFAULT_ETA, {
    'الاسم': firstName(order.customer_name),
    'رقم_الطلب': order.order_no,
    'الدقائق': minutes,
    'الوقت': clockAfter(minutes),
    'المطعم': settings.restaurant_name || '',
  });
  try {
    await wa.sendText(number, text);
  } catch (err) {
    return sendError(res, err);
  }
  const { rows } = await pool.query(
    'UPDATE orders SET eta_minutes = $1, eta_sent_at = now(), eta_sent_by = $2 WHERE id = $3 RETURNING id, eta_minutes, eta_sent_at, ready_sent_at',
    [minutes, req.staff?.name || null, order.id]
  );
  broadcast('order-whatsapp', rows[0]); // باقي الأجهزة بتشوف إنه انبعت
  res.json(rows[0]);
}));

// POST /api/whatsapp/orders/:id/ready { force? } — "طلبك جاهز"
router.post('/orders/:id/ready', requireStaffAuth, asyncHandler(async (req, res) => {
  const { order, settings } = await loadOrderAndSettings(req.params.id);
  if (!order) return res.status(404).json({ error: 'الطلب مش موجود' });
  if (order.ready_sent_at && !req.body?.force) {
    return res.status(409).json({ error: 'انبعتت رسالة "جاهز" قبل.', code: 'ALREADY_SENT' });
  }
  const number = wa.normalizePhone(order.customer_phone);
  if (!number) return res.status(422).json({ error: 'رقم الزبون مش صالح للواتساب' });
  const text = wa.fillTemplate(settings.wa_ready_template || DEFAULT_READY, {
    'الاسم': firstName(order.customer_name),
    'رقم_الطلب': order.order_no,
    'المطعم': settings.restaurant_name || '',
  });
  try {
    await wa.sendText(number, text);
  } catch (err) {
    return sendError(res, err);
  }
  const { rows } = await pool.query(
    'UPDATE orders SET ready_sent_at = now() WHERE id = $1 RETURNING id, eta_minutes, eta_sent_at, ready_sent_at',
    [order.id]
  );
  broadcast('order-whatsapp', rows[0]);
  res.json(rows[0]);
}));

// POST /api/whatsapp/test { phone, template? } — المدير: رسالة تجربة لرقمه
router.post('/test', requireStaffAuth, requireStaffRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const number = wa.normalizePhone(req.body?.phone);
  if (!number) return res.status(400).json({ error: 'اكتبي رقم صالح' });
  const { rows: s } = await pool.query('SELECT * FROM settings WHERE id = 1');
  const settings = s[0] || {};
  const which = req.body?.template === 'ready' ? 'ready' : 'eta';
  const text = wa.fillTemplate(which === 'ready' ? settings.wa_ready_template || DEFAULT_READY : settings.wa_eta_template || DEFAULT_ETA, {
    'الاسم': firstName(req.staff?.name, 'تجربة'),
    'رقم_الطلب': '1106-023',
    'الدقائق': 20,
    'الوقت': clockAfter(20),
    'المطعم': settings.restaurant_name || '',
  });
  try {
    await wa.sendText(number, `🧪 رسالة تجربة\n\n${text}`);
  } catch (err) {
    return sendError(res, err);
  }
  res.json({ ok: true, number });
}));

module.exports = router;
module.exports.DEFAULT_ETA = DEFAULT_ETA;
module.exports.DEFAULT_READY = DEFAULT_READY;
