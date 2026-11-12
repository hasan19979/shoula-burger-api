/**
 * صندوق الرسائل: تخزين المحادثات والرسائل + إعدادات المساعد + الدليل.
 * كل رسالة بتوصل أو بتطلع من واتساب المطعم بتنحفظ هون — والكاشير بيشوفها لحظياً.
 */
const pool = require('../db/pool');
const { broadcast } = require('../realtime');

const DEFAULT_CONFIG = {
  enabled: false, // المساعد بيرد؟ (الصندوق بيشتغل دايماً)
  mode: 'suggest', // suggest = بيقترح والموظف بيوافق • auto = بيبعت لحاله
  schedule: 'always', // always • outside (برا الدوام بس) • custom
  from: '22:00',
  to: '13:00',
  takeOrders: true,
  chat: { provider: 'anthropic', model: '' },
  vision: { provider: 'gemini', model: '' },
  audio: { provider: 'gemini', model: '' },
  analysis: { provider: '', model: '' }, // فاضي = نفس المحادثة
  dailyLimit: 300,
  handoffMessage: 'لحظة من فضلك، رح يرد عليك حدا من المطعم 🙏',
  retentionDays: 30,
};

const DEFAULT_GUIDE = {
  persona: 'إنت موظف خدمة زبائن ودود بالمطعم. احكي باللهجة الفلسطينية، بلطف وباختصار (جملة أو جملتين)، وإيموجي قليل.',
  rules: [
    'ما تعطي خصومات أو عروض من عندك.',
    'إذا ما بتعرف الجواب، حوّل لموظف وما تخمّن.',
  ],
  faqs: [],
  examples: [],
};

async function getConfig() {
  const { rows } = await pool.query('SELECT ai_config FROM settings WHERE id = 1');
  const c = rows[0]?.ai_config || {};
  return { ...DEFAULT_CONFIG, ...c, chat: { ...DEFAULT_CONFIG.chat, ...(c.chat || {}) }, vision: { ...DEFAULT_CONFIG.vision, ...(c.vision || {}) }, audio: { ...DEFAULT_CONFIG.audio, ...(c.audio || {}) }, analysis: { ...DEFAULT_CONFIG.analysis, ...(c.analysis || {}) } };
}

async function saveConfig(patch) {
  const current = await getConfig();
  const next = { ...current, ...patch };
  for (const k of ['chat', 'vision', 'audio', 'analysis']) if (patch[k]) next[k] = { ...current[k], ...patch[k] };
  next.dailyLimit = Math.max(0, Math.min(100000, Number(next.dailyLimit) || 0));
  next.retentionDays = Math.max(7, Math.min(365, Number(next.retentionDays) || 30));
  if (!['suggest', 'auto'].includes(next.mode)) next.mode = 'suggest';
  if (!['always', 'outside', 'custom'].includes(next.schedule)) next.schedule = 'always';
  await pool.query('UPDATE settings SET ai_config = $1 WHERE id = 1', [JSON.stringify(next)]);
  return next;
}

async function getGuide() {
  const { rows } = await pool.query('SELECT id, content, note, created_by, created_at FROM ai_guide_versions ORDER BY id DESC LIMIT 1');
  if (!rows.length) return { id: null, content: DEFAULT_GUIDE };
  return { ...rows[0], content: { ...DEFAULT_GUIDE, ...rows[0].content } };
}

function cleanGuide(c) {
  const str = (v, max) => String(v || '').slice(0, max);
  const list = (v, max, n) => (Array.isArray(v) ? v : []).map((x) => str(x, max).trim()).filter(Boolean).slice(0, n);
  return {
    persona: str(c.persona, 2000),
    rules: list(c.rules, 500, 100),
    faqs: (Array.isArray(c.faqs) ? c.faqs : []).map((f) => ({ q: str(f?.q, 300).trim(), a: str(f?.a, 1000).trim() })).filter((f) => f.q && f.a).slice(0, 200),
    examples: (Array.isArray(c.examples) ? c.examples : []).map((e) => ({ customer: str(e?.customer, 500).trim(), reply: str(e?.reply, 1000).trim() })).filter((e) => e.customer && e.reply).slice(0, 100),
  };
}

async function saveGuide(content, by, note) {
  const { rows } = await pool.query('INSERT INTO ai_guide_versions (content, note, created_by) VALUES ($1, $2, $3) RETURNING *', [
    JSON.stringify(cleanGuide(content)), note || null, by || null,
  ]);
  return rows[0];
}

/* ---------- المحادثات ---------- */
/** 9725xxxxxxxx@s.whatsapp.net → 05xxxxxxxx (نفس شكل الأرقام بالنظام) */
function jidToPhone(jid) {
  const d = String(jid || '').split('@')[0].replace(/\D/g, '');
  if (!/@s\.whatsapp\.net$/.test(jid)) return null;
  const m = /^(970|972)(5\d{8})$/.exec(d);
  return m ? '0' + m[2] : '+' + d;
}

async function upsertConversation(jid, { name } = {}) {
  const phone = jidToPhone(jid);
  const { rows } = await pool.query(
    `INSERT INTO wa_conversations (jid, phone, name) VALUES ($1, $2, NULLIF($3, ''))
     ON CONFLICT (jid) DO UPDATE SET name = COALESCE(NULLIF($3, ''), wa_conversations.name),
       phone = COALESCE(wa_conversations.phone, $2)
     RETURNING *`,
    [jid, phone, name || '']
  );
  const conv = rows[0];
  if (!conv.customer_id && phone) {
    const c = await pool.query('SELECT id FROM customers WHERE phone = $1', [phone]);
    if (c.rows.length) {
      await pool.query('UPDATE wa_conversations SET customer_id = $1 WHERE id = $2', [c.rows[0].id, conv.id]);
      conv.customer_id = c.rows[0].id;
    }
  }
  return conv;
}

const preview = (m) => (m.kind === 'image' ? '📷 صورة' : m.kind === 'audio' ? '🎤 رسالة صوتية' : '') + (m.body ? (m.kind !== 'text' ? ' ' : '') + m.body : '');

/**
 * بيحفظ رسالة وبيحدّث المحادثة وبيبلّغ الكاشير لحظياً.
 * رسالة من الزبون بتزيد "غير مقروء". بيرجّع الرسالة (أو null لو مكررة).
 */
async function addMessage(conversationId, msg) {
  const r = await pool.query(
    `INSERT INTO wa_messages (conversation_id, direction, kind, body, media_note, sender, sender_name, ai_status, wa_id, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [conversationId, msg.direction, msg.kind || 'text', msg.body || '', msg.media_note || null, msg.sender || 'customer', msg.sender_name || null, msg.ai_status || null, msg.wa_id || null, msg.error || null]
  );
  const saved = r.rows[0];
  if (!saved) return null;
  // الاقتراح (لسا ما انبعت) ما بيغيّر آخر رسالة بالقائمة
  if (msg.ai_status !== 'suggested' && msg.direction !== 'note') {
    await pool.query(
      `UPDATE wa_conversations SET last_message_at = now(), last_preview = $2,
              unread = CASE WHEN $3 THEN unread + 1 ELSE unread END
        WHERE id = $1`,
      [conversationId, preview(saved).slice(0, 140), msg.direction === 'in']
    );
  }
  broadcast('inbox-message', { conversationId, message: saved });
  return saved;
}

async function updateConversation(id, patch) {
  const allowed = ['ai_enabled', 'needs_human', 'needs_human_reason', 'draft_order', 'unread'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    params.push(k === 'draft_order' && patch[k] !== null ? JSON.stringify(patch[k]) : patch[k]);
    sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) return null;
  params.push(id);
  const { rows } = await pool.query(`UPDATE wa_conversations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (rows[0]) broadcast('inbox-conversation', rows[0]);
  return rows[0] || null;
}

/** تنظيف الرسائل القديمة (حسب الإعدادات) — حتى ما تكبر قاعدة البيانات */
async function cleanupOld() {
  try {
    const c = await getConfig();
    await pool.query('DELETE FROM wa_messages WHERE created_at < now() - make_interval(days => $1)', [c.retentionDays]);
    await pool.query(`DELETE FROM wa_conversations WHERE last_message_at < now() - make_interval(days => $1)
                        AND NOT EXISTS (SELECT 1 FROM wa_messages m WHERE m.conversation_id = wa_conversations.id)`, [c.retentionDays]);
  } catch (err) {
    console.error('[inbox] cleanup failed:', err.message);
  }
}
let cleanupTimer = null;
function startCleanupJob() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupOld, 6 * 60 * 60 * 1000);
  cleanupTimer.unref?.();
}

module.exports = { DEFAULT_CONFIG, DEFAULT_GUIDE, getConfig, saveConfig, getGuide, saveGuide, cleanGuide, jidToPhone, upsertConversation, addMessage, updateConversation, startCleanupJob };
