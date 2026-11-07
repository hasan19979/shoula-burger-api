const pool = require('./db/pool');

/**
 * "يوم العمل" بالمطعم — بيخلص مع انتهاء الدوام (من الإعدادات)، مش الساعة 12 بالليل.
 * مثلاً دوام من 13:00 لـ 02:00: طلب الساعة 1:30 بالليل بيتبع يوم امبارح (رقمه، تقاريره، جرد الصندوق).
 *
 * اليوم الجديد بيبلّش بنص الفترة بين السكّرة والفتحة (مثلاً سكّرة 02:00 وفتحة 13:00 → 07:30 الصبح)،
 * حتى أي طلب متأخر شوي بعد السكّرة يضل محسوب على نفس اليوم.
 * التوقيت دايماً توقيت المطعم (فلسطين) — مش توقيت سيرفر Render (يلي هو UTC).
 */
const TZ = process.env.APP_TIMEZONE || 'Asia/Hebron';

function toMinutes(hhmm, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return fallback;
  return (h * 60 + min) % 1440;
}

/** دقيقة بداية يوم العمل (من نص الليل) حسب ساعات الدوام */
function cutoffMinutes(openTime, closeTime) {
  const open = toMinutes(openTime, 13 * 60);
  const close = toMinutes(closeTime, 0);
  const gap = (open - close + 1440) % 1440; // الفترة يلي المطعم فيها مسكّر
  return (close + Math.floor(gap / 2)) % 1440;
}

let cache = { at: 0, cutoff: 0 };
async function getCutoff() {
  if (Date.now() - cache.at < 60 * 1000) return cache.cutoff;
  try {
    const { rows } = await pool.query('SELECT open_time, close_time FROM settings LIMIT 1');
    cache = { at: Date.now(), cutoff: cutoffMinutes(rows[0]?.open_time, rows[0]?.close_time) };
  } catch {
    cache = { at: Date.now(), cutoff: cache.cutoff };
  }
  return cache.cutoff;
}
/** بعد حفظ الإعدادات — منقرأ ساعات الدوام الجديدة فوراً */
function invalidate() {
  cache.at = 0;
}

module.exports = { TZ, cutoffMinutes, getCutoff, invalidate };
