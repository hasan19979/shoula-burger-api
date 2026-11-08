/**
 * إرسال رسائل واتساب للزبائن عن طريق Evolution API (على الـVPS).
 * الإعداد من متغيرات Render فقط — المفتاح ما بيطلع أبداً للكاشير ولا للموقع:
 *   EVOLUTION_URL       مثلاً https://wa.example.com
 *   EVOLUTION_INSTANCE  اسم الـInstance المربوط على رقم المطعم
 *   EVOLUTION_API_KEY   مفتاح Evolution (AUTHENTICATION_API_KEY)
 * ما في Claude ولا ذكاء اصطناعي هون — الرسائل قوالب ثابتة من الإعدادات.
 */
const TIMEOUT_MS = 15000;

function config() {
  const url = (process.env.EVOLUTION_URL || '').trim().replace(/\/+$/, '');
  const instance = (process.env.EVOLUTION_INSTANCE || '').trim();
  const key = (process.env.EVOLUTION_API_KEY || '').trim();
  return { url, instance, key, ready: !!(url && instance && key) };
}

class WhatsAppError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

async function evoFetch(path, { method = 'GET', body } = {}) {
  const c = config();
  if (!c.ready) throw new WhatsAppError('ربط الواتساب مش مفعّل — لازم EVOLUTION_URL و EVOLUTION_INSTANCE و EVOLUTION_API_KEY على Render', 503);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${c.url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', apikey: c.key },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      const detail = JSON.stringify(data?.response?.message || data?.message || data?.error || data || '').slice(0, 200);
      if (res.status === 401 || res.status === 403) throw new WhatsAppError('مفتاح Evolution غلط (EVOLUTION_API_KEY)', 502);
      if (res.status === 404) throw new WhatsAppError(`الـInstance مش موجود على Evolution (EVOLUTION_INSTANCE) ${detail}`, 502);
      if (/exists|not.*whatsapp|jid/i.test(detail)) throw new WhatsAppError('هاد الرقم مش عليه واتساب', 422);
      throw new WhatsAppError(`Evolution رد بخطأ (${res.status}) ${detail}`, 502);
    }
    return data;
  } catch (err) {
    if (err instanceof WhatsAppError) throw err;
    if (err.name === 'AbortError') throw new WhatsAppError('Evolution ما رد بالوقت — تأكدي إنه الـVPS شغال', 504);
    throw new WhatsAppError('ما قدرنا نوصل لـEvolution — تأكدي من الرابط وإنه الـVPS شغال', 502);
  } finally {
    clearTimeout(t);
  }
}

/**
 * رقم الزبون بالصيغة الدولية (أرقام بس).
 *  059 / 056 → 970 (جوال، أوريدو)  •  باقي 05x → 972  •  رقم دولي (+ أو 00) بيضل زي ما هو
 */
function normalizePhone(raw, defaultCountry = '970') {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) {
    const local = d.slice(1); // 59xxxxxxx
    if (/^5[69]\d{7}$/.test(local)) d = '970' + local;
    else if (/^5\d{8}$/.test(local)) d = '972' + local;
    else d = String(defaultCountry || '970').replace(/\D/g, '') + local;
  } else if (/^5\d{8}$/.test(d)) {
    d = (/^5[69]/.test(d) ? '970' : '972') + d;
  }
  d = d.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15 ? d : null;
}

async function sendText(number, text) {
  const c = config();
  // نفس الطلب بيشتغل على Evolution v2 (text) و v1 (textMessage)
  return evoFetch(`/message/sendText/${encodeURIComponent(c.instance)}`, {
    method: 'POST',
    body: { number, text, textMessage: { text }, delay: 1200 },
  });
}

/** حالة الربط: 'open' = متصل وجاهز */
async function connectionState() {
  const c = config();
  if (!c.ready) return { configured: false, state: null };
  try {
    const data = await evoFetch(`/instance/connectionState/${encodeURIComponent(c.instance)}`);
    const state = data?.instance?.state || data?.state || null;
    return { configured: true, state };
  } catch (err) {
    return { configured: true, state: null, error: err.message };
  }
}

/** بيعبّي قالب الرسالة: {الاسم} {رقم_الطلب} {الدقائق} {الوقت} {المطعم} */
function fillTemplate(template, vars) {
  return String(template || '').replace(/\{([^}]+)\}/g, (m, k) => (vars[k.trim()] !== undefined ? String(vars[k.trim()]) : m));
}

module.exports = { config, normalizePhone, sendText, connectionState, fillTemplate, WhatsAppError };
