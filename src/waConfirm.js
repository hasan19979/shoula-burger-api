const pool = require('./db/pool');
const { broadcast } = require('./realtime');

/**
 * تأكيد طلبات الموقع برسالة الواتساب:
 *  - الزبون بيبعت رسالة الطلب (فيها "#1108-003") على واتساب المطعم
 *  - Evolution بيبعت الرسالة لسيرفرنا (Webhook)
 *  - منلاقي الطلب برقمه، منحفظ حساب الواتساب يلي بعته (حتى نرد عليه بالضبط)، والطلب بيطلع بالكاشير
 *  - طلب ما وصلت رسالته خلال ساعة بينلغى لحاله (ومنرجّع النقاط والكوبون)
 */
const EXPIRE_MINUTES = Number(process.env.WA_CONFIRM_EXPIRE_MINUTES) || 60;
let lastWebhookAt = null;
let lastMatchAt = null;

/** رقم الطلب من نص الرسالة: 1108-003 (الجديد) أو A123456 (القديم) */
function extractOrderNo(text) {
  const t = String(text || '');
  const m = /#\s*(\d{4}-\d{3,})/.exec(t) || /\b(\d{4}-\d{3,})\b/.exec(t) || /#\s*(A\d{6})\b/i.exec(t);
  return m ? m[1].toUpperCase() : null;
}

/** بيطلّع من رسالة Evolution (v1 أو v2): النص، ومين بعت، وهل هي منا أو من جروب */
function parseMessage(d) {
  if (!d || typeof d !== 'object') return null;
  const key = d.key || {};
  const msg = d.message || {};
  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.ephemeralMessage?.message?.extendedTextMessage?.text ||
    msg.ephemeralMessage?.message?.conversation ||
    d.body ||
    '';
  let jid = key.remoteJid || d.remoteJid || '';
  // بعض نسخ واتساب بتخفي الرقم (@lid) — لو في رقم حقيقي جنبه منستعمله
  if (/@lid$/.test(jid)) jid = key.senderPn || key.remoteJidAlt || d.senderPn || jid;
  const kind = msg.imageMessage ? 'image' : msg.audioMessage || msg.pttMessage ? 'audio' : text ? 'text' : 'other';
  return {
    text: String(text),
    jid: String(jid),
    fromMe: !!key.fromMe,
    isGroup: /@g\.us$/.test(jid) || /@broadcast$/.test(jid),
    pushName: d.pushName || '',
    kind,
    id: key.id || null,
    raw: d,
  };
}

/** بيأكد طلب (من رسالة الواتساب أو يدوي من الكاشير) — بيرجّع الطلب أو null */
async function confirmOrder(orderId, jid) {
  const { rows } = await pool.query(
    `UPDATE orders SET awaiting_wa = false,
            wa_confirmed_at = COALESCE(wa_confirmed_at, now()),
            wa_jid = COALESCE($2, wa_jid)
      WHERE id = $1 AND status <> 'cancelled'
      RETURNING *`,
    [orderId, jid || null]
  );
  return rows[0] || null;
}

/** وصلت رسالة على واتساب المطعم */
async function handleIncoming(payload) {
  lastWebhookAt = new Date().toISOString();
  const event = String(payload?.event || '').toLowerCase().replace(/_/g, '.');
  if (event && event !== 'messages.upsert') return { ignored: 'event' };
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.data?.messages) ? payload.data.messages : [payload?.data];
  const results = [];
  for (const d of list) {
    const m = parseMessage(d);
    if (!m || m.isGroup || !m.jid || /@broadcast$/.test(m.jid)) continue;
    // صندوق الرسائل + المساعد (كل رسالة — من الزبون أو من تلفون المطعم نفسه)
    try {
      await require('./ai/assistant').onIncoming(m);
    } catch (err) {
      console.error('[inbox] store failed:', err.message);
    }
    if (m.fromMe) continue;
    const orderNo = extractOrderNo(m.text);
    if (!orderNo) continue;
    // أحدث طلب من الموقع بهاد الرقم خلال آخر يوم
    const { rows } = await pool.query(
      `SELECT id, awaiting_wa, wa_confirmed_at, status FROM orders
        WHERE order_no = $1 AND order_source = 'online' AND created_at > now() - interval '24 hours'
        ORDER BY created_at DESC LIMIT 1`,
      [orderNo]
    );
    const o = rows[0];
    if (!o || o.status === 'cancelled') {
      results.push({ orderNo, matched: false });
      continue;
    }
    const wasAwaiting = o.awaiting_wa;
    const order = await confirmOrder(o.id, m.jid);
    lastMatchAt = new Date().toISOString();
    if (order) {
      const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [order.id]);
      const full = { ...order, items };
      // كان مستني الرسالة → هلق بيطلع بالكاشير (مع الصوت)، وإلا بس منحدّث علامة "وصلت رسالته"
      if (wasAwaiting) broadcast('new-order', full);
      else broadcast('order-whatsapp', { id: order.id, eta_minutes: order.eta_minutes, eta_sent_at: order.eta_sent_at, ready_sent_at: order.ready_sent_at, wa_confirmed_at: order.wa_confirmed_at });
    }
    results.push({ orderNo, matched: true, released: wasAwaiting });
  }
  return { results };
}

/** طلبات استنت أكتر من ساعة وما وصلت رسالتها — بتنلغى، ومنرجّع نقاط الزبون والكوبون */
async function expireAwaiting() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'النظام',
              cancel_reason = 'ما وصلت رسالة الواتساب من الزبون'
        WHERE awaiting_wa = true AND status <> 'cancelled' AND created_at < now() - make_interval(mins => $1)
        RETURNING id, customer_id, points_earned, points_redeemed, coupon_code`,
      [EXPIRE_MINUTES]
    );
    for (const o of rows) {
      const back = (Number(o.points_redeemed) || 0) - (Number(o.points_earned) || 0);
      if (o.customer_id && back !== 0) {
        await client.query('UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points + $1) WHERE id = $2', [back, o.customer_id]);
      }
      if (o.coupon_code) {
        await client.query('UPDATE coupons SET used_count = GREATEST(0, used_count - 1) WHERE code = $1', [o.coupon_code]);
      }
    }
    await client.query('COMMIT');
    if (rows.length) console.log(`[wa-confirm] انلغى ${rows.length} طلب ما وصلت رسالته`);
    return rows.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[wa-confirm] expire failed:', err.message);
    return 0;
  } finally {
    client.release();
  }
}

let timer = null;
function startExpiryJob() {
  if (timer) return;
  timer = setInterval(expireAwaiting, 5 * 60 * 1000);
  timer.unref?.();
}

module.exports = {
  extractOrderNo, parseMessage, handleIncoming, confirmOrder, expireAwaiting, startExpiryJob,
  stats: () => ({ lastWebhookAt, lastMatchAt, expireMinutes: EXPIRE_MINUTES }),
};
