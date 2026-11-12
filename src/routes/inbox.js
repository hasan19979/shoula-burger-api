const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireStaffAuth = require('../middleware/staffAuth');
const store = require('../ai/store');
const assistant = require('../ai/assistant');
const wa = require('../whatsapp');

/** صندوق رسائل الواتساب — للموظفين */
const router = express.Router();
router.use(requireStaffAuth);

const fail = (res, err) => res.status(err.status || 502).json({ error: err.message });

// GET /api/inbox/conversations?filter=all|unread|human&q=
router.get('/conversations', asyncHandler(async (req, res) => {
  const { filter, q } = req.query;
  const cond = [];
  const params = [];
  if (filter === 'unread') cond.push('c.unread > 0');
  if (filter === 'human') cond.push('c.needs_human = true');
  if (q) {
    params.push(`%${String(q).slice(0, 50)}%`);
    cond.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.last_preview ILIKE $${params.length})`);
  }
  const { rows } = await pool.query(
    `SELECT c.*, cu.name AS customer_name, cu.loyalty_points,
            (SELECT COUNT(*)::int FROM wa_messages m WHERE m.conversation_id = c.id AND m.ai_status = 'suggested') AS suggestions
       FROM wa_conversations c LEFT JOIN customers cu ON cu.id = c.customer_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
      ORDER BY c.needs_human DESC, c.last_message_at DESC LIMIT 200`,
    params
  );
  res.json(rows);
}));

// GET /api/inbox/summary — للرقم الأحمر بالقائمة
router.get('/summary', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(unread),0)::int AS unread, COUNT(*) FILTER (WHERE needs_human)::int AS human,
            (SELECT COUNT(*)::int FROM wa_messages WHERE ai_status = 'suggested') AS suggestions FROM wa_conversations`
  );
  res.json(rows[0]);
}));

// GET /api/inbox/conversations/:id — المحادثة + الرسائل + آخر طلبات الزبون
router.get('/conversations/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, cu.name AS customer_name, cu.loyalty_points, cu.address AS customer_address
       FROM wa_conversations c LEFT JOIN customers cu ON cu.id = c.customer_id WHERE c.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'المحادثة مش موجودة' });
  const conv = rows[0];
  const { rows: messages } = await pool.query(
    `SELECT * FROM (SELECT * FROM wa_messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 200) t ORDER BY id`,
    [conv.id]
  );
  const { rows: orders } = await pool.query(
    `SELECT id, order_no, created_at, total, status, order_type, ai_created FROM orders
      WHERE (customer_phone = $1 OR wa_jid = $2) AND awaiting_wa = false ORDER BY created_at DESC LIMIT 5`,
    [conv.phone || '-', conv.jid]
  );
  res.json({ conversation: conv, messages, orders });
}));

// POST /api/inbox/conversations/:id/read
router.post('/conversations/:id/read', asyncHandler(async (req, res) => {
  await store.updateConversation(req.params.id, { unread: 0 });
  res.json({ ok: true });
}));

// PATCH /api/inbox/conversations/:id { ai_enabled?, needs_human? }
router.patch('/conversations/:id', asyncHandler(async (req, res) => {
  const patch = {};
  if (typeof req.body?.ai_enabled === 'boolean') patch.ai_enabled = req.body.ai_enabled;
  if (typeof req.body?.needs_human === 'boolean') {
    patch.needs_human = req.body.needs_human;
    if (!req.body.needs_human) patch.needs_human_reason = null;
  }
  if (req.body?.clear_draft) patch.draft_order = null;
  const conv = await store.updateConversation(req.params.id, patch);
  if (!conv) return res.status(404).json({ error: 'المحادثة مش موجودة' });
  // رجّعتيها للمساعد وآخر رسالة من الزبون — بيرد عليها
  if (patch.ai_enabled === true || patch.needs_human === false) assistant.scheduleReply(conv.id, 1500);
  res.json(conv);
}));

async function loadConv(id) {
  const { rows } = await pool.query('SELECT * FROM wa_conversations WHERE id = $1', [id]);
  return rows[0] || null;
}

// POST /api/inbox/conversations/:id/send { text } — رد من الموظف (المساعد بيسكت بهاي المحادثة)
router.post('/conversations/:id/send', asyncHandler(async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: 'الرسالة فاضية' });
  const conv = await loadConv(req.params.id);
  if (!conv) return res.status(404).json({ error: 'المحادثة مش موجودة' });
  try {
    const msg = await assistant.sendOut(conv, text, { sender: 'staff', sender_name: req.staff.name });
    await store.updateConversation(conv.id, { ai_enabled: false, needs_human: false, needs_human_reason: null, unread: 0 });
    res.json(msg);
  } catch (err) {
    fail(res, err);
  }
}));

// POST /api/inbox/messages/:id/approve { text? } — إرسال اقتراح المساعد (مع تعديل اختياري)
router.post('/messages/:id/approve', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM wa_messages WHERE id = $1 AND ai_status = 'suggested'`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'الاقتراح مش موجود أو انبعت' });
  const conv = await loadConv(rows[0].conversation_id);
  const text = String(req.body?.text ?? rows[0].body).trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: 'الرسالة فاضية' });
  try {
    const msg = await assistant.sendOut(conv, text, { existingId: rows[0].id, sender_name: req.staff.name });
    await store.updateConversation(conv.id, { unread: 0 });
    res.json(msg);
  } catch (err) {
    fail(res, err);
  }
}));

// POST /api/inbox/messages/:id/reject
router.post('/messages/:id/reject', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`UPDATE wa_messages SET ai_status = 'rejected' WHERE id = $1 AND ai_status = 'suggested' RETURNING *`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'الاقتراح مش موجود' });
  require('../realtime').broadcast('inbox-message-updated', { conversationId: rows[0].conversation_id, message: rows[0] });
  res.json(rows[0]);
}));

// POST /api/inbox/messages/:id/rate { rating: 1 | -1 | 0 }
router.post('/messages/:id/rate', asyncHandler(async (req, res) => {
  const r = Number(req.body?.rating);
  const { rows } = await pool.query(`UPDATE wa_messages SET rating = $2 WHERE id = $1 AND sender = 'ai' RETURNING *`, [req.params.id, [1, -1].includes(r) ? r : null]);
  if (!rows.length) return res.status(404).json({ error: 'الرسالة مش موجودة' });
  res.json(rows[0]);
}));

// POST /api/inbox/messages/:id/correct { text, saveAs: 'example'|'rule'|'none', rule? }
// تصحيح رد المساعد — بينحفظ بالدليل حتى ما يرجع يغلط
router.post('/messages/:id/correct', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM wa_messages WHERE id = $1 AND sender = 'ai'`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'الرسالة مش موجودة' });
  const m = rows[0];
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  const saveAs = req.body?.saveAs;
  await pool.query('UPDATE wa_messages SET rating = -1 WHERE id = $1', [m.id]);
  if (saveAs === 'example' || saveAs === 'rule') {
    const guide = await store.getGuide();
    const c = { ...guide.content };
    if (saveAs === 'example') {
      if (!text) return res.status(400).json({ error: 'اكتبي الرد الصح' });
      const { rows: prev } = await pool.query(
        `SELECT body, media_note FROM wa_messages WHERE conversation_id = $1 AND id < $2 AND direction = 'in' ORDER BY id DESC LIMIT 1`,
        [m.conversation_id, m.id]
      );
      const customer = (prev[0]?.body || prev[0]?.media_note || '').trim() || '(رسالة الزبون)';
      c.examples = [...(c.examples || []), { customer, reply: text }];
    } else {
      const rule = String(req.body?.rule || text).trim();
      if (!rule) return res.status(400).json({ error: 'اكتبي القاعدة' });
      c.rules = [...(c.rules || []), rule];
    }
    await store.saveGuide(c, req.staff.name, saveAs === 'example' ? 'تصحيح من محادثة (مثال)' : 'تصحيح من محادثة (قاعدة)');
  }
  res.json({ ok: true });
}));

// POST /api/inbox/conversations/:id/create-order — الموظف بيعتمد الطلب يلي جهّزه المساعد
router.post('/conversations/:id/create-order', asyncHandler(async (req, res) => {
  const conv = await loadConv(req.params.id);
  if (!conv) return res.status(404).json({ error: 'المحادثة مش موجودة' });
  const r = await assistant.createOrderFromDraft(conv, conv.draft_order, { by: 'staff' });
  if (r.error) return res.status(400).json({ error: r.error });
  if (conv.needs_human_reason === 'طلب جاهز — بيستنى موافقتك') await store.updateConversation(conv.id, { needs_human: false, needs_human_reason: null });
  res.json(r.order);
}));

module.exports = router;
