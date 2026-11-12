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
      if (/"exists"\s*:\s*false/i.test(detail)) {
        const e = new WhatsAppError('هاد الرقم مش عليه واتساب', 422);
        e.notOnWhatsApp = true;
        throw e;
      }
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

/**
 * أرقام جوال وأوريدو (059/056) ممكن يكون الواتساب عليها مسجّل على 970 أو على 972 —
 * كثير ناس بفلسطين مسجّلين واتساب على 972 مع إنه الشريحة فلسطينية. فمنجرب الاثنين.
 */
function phoneCandidates(raw) {
  const first = normalizePhone(raw);
  if (!first) return [];
  const m = /^(970|972)(5\d{8})$/.exec(first);
  if (!m) return [first];
  return [first, (m[1] === '970' ? '972' : '970') + m[2]];
}

/** بيبعت لرقم الزبون — لو الصيغة الأولى مش عليها واتساب، بيجرب التانية. بيرجّع الرقم يلي نجح */
async function sendToCustomer(raw, text, jid) {
  // أول شي: نفس حساب الواتساب يلي بعت رسالة الطلب (من أي بلد) — بدون أي تخمين
  if (jid) {
    const target = /@s\.whatsapp\.net$/.test(jid) ? jid.split('@')[0] : jid;
    try {
      await sendText(target, text);
      return target;
    } catch (err) {
      if (!err.notOnWhatsApp && !raw) throw err;
      // ما زبط على الحساب المحفوظ — منكمّل على الرقم المكتوب بالطلب
    }
  }
  const list = phoneCandidates(raw);
  if (!list.length) throw new WhatsAppError('رقم الزبون مش صالح للواتساب', 422);
  let lastErr = null;
  for (const number of list) {
    try {
      await sendText(number, text);
      return number;
    } catch (err) {
      if (!err.notOnWhatsApp) throw err;
      lastErr = err;
    }
  }
  throw new WhatsAppError(`هاد الرقم مش عليه واتساب (جربنا ${list.map((n) => '+' + n).join(' و ')})`, 422);
}

/** بيجيب ملف (صورة/فويس) من رسالة واتساب عن طريق Evolution — بيرجّع { base64, mimetype } أو null */
async function getMediaBase64(data) {
  if (data?.message?.base64) {
    const mt = data.message.imageMessage?.mimetype || data.message.audioMessage?.mimetype || 'application/octet-stream';
    return { base64: data.message.base64, mimetype: mt };
  }
  const c = config();
  if (!c.ready || !data?.key?.id) return null;
  try {
    const r = await evoFetch(`/chat/getBase64FromMediaMessage/${encodeURIComponent(c.instance)}`, {
      method: 'POST',
      body: { message: { key: { id: data.key.id, remoteJid: data.key.remoteJid, fromMe: !!data.key.fromMe } }, convertToMp4: false },
    });
    if (!r?.base64) return null;
    return { base64: r.base64, mimetype: r.mimetype || r.mimeType || 'application/octet-stream' };
  } catch {
    return null;
  }
}

/** رقم/حساب الإرسال من الـjid (الحسابات العادية بالأرقام، والمخفية @lid زي ما هي) */
function targetOf(jid) {
  return /@s\.whatsapp\.net$/.test(jid) ? jid.split('@')[0] : jid;
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

module.exports = { config, normalizePhone, phoneCandidates, sendText, sendToCustomer, connectionState, fillTemplate, getMediaBase64, targetOf, WhatsAppError };
