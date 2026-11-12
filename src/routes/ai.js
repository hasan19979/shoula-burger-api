const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireStaffAuth = require('../middleware/staffAuth');
const { requireStaffRole } = requireStaffAuth;
const ai = require('../ai/providers');
const store = require('../ai/store');
const assistant = require('../ai/assistant');
const analysis = require('../ai/analysis');

/** إعدادات المساعد، دليله، تجربته، أداؤه، وتحليل البيانات — للمدير */
const router = express.Router();
router.use(requireStaffAuth, requireStaffRole('admin', 'manager'));

const fail = (res, err) => res.status(err.status || 502).json({ error: err.message });

router.get('/config', asyncHandler(async (req, res) => {
  res.json({ config: await store.getConfig(), keys: ai.keyStatus(), defaults: ai.DEFAULT_MODELS, usedToday: await ai.usedToday() });
}));

router.put('/config', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const ok = (p, extra = []) => p === undefined || ['anthropic', 'openai', 'gemini', ...extra].includes(p);
  if (!ok(body.chat?.provider) || !ok(body.vision?.provider, ['off']) || !ok(body.audio?.provider, ['off']) || !ok(body.analysis?.provider, [''])) {
    return res.status(400).json({ error: 'شركة ذكاء اصطناعي مش معروفة' });
  }
  if (body.audio?.provider === 'anthropic') return res.status(400).json({ error: 'Claude ما بيحوّل الصوت لكتابة — اختاري Gemini أو OpenAI للصوت' });
  const allowed = ['enabled', 'mode', 'schedule', 'from', 'to', 'takeOrders', 'chat', 'vision', 'audio', 'analysis', 'dailyLimit', 'handoffMessage', 'retentionDays'];
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  if (patch.handoffMessage !== undefined) patch.handoffMessage = String(patch.handoffMessage).slice(0, 300);
  res.json({ config: await store.saveConfig(patch) });
}));

// الدليل (شخصية، قواعد، أسئلة وأجوبة، أمثلة) + نسخه
router.get('/guide', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id, note, created_by, created_at FROM ai_guide_versions ORDER BY id DESC LIMIT 30');
  res.json({ guide: await store.getGuide(), versions: rows });
}));
router.put('/guide', asyncHandler(async (req, res) => {
  res.json(await store.saveGuide(req.body?.content || {}, req.staff.name, String(req.body?.note || 'تعديل الدليل').slice(0, 100)));
}));
router.post('/guide/restore/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT content FROM ai_guide_versions WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'النسخة مش موجودة' });
  res.json(await store.saveGuide(rows[0].content, req.staff.name, `رجوع لنسخة #${req.params.id}`));
}));

// محادثة تجريبية (ما بينبعت شي للزبائن) • مقارنة موديلات
router.post('/test', asyncHandler(async (req, res) => {
  try {
    res.json(await assistant.sandboxReply({ messages: req.body?.messages, provider: req.body?.provider, model: req.body?.model }));
  } catch (err) {
    fail(res, err);
  }
}));
router.post('/compare', asyncHandler(async (req, res) => {
  const providers = (Array.isArray(req.body?.providers) ? req.body.providers : ['anthropic', 'openai', 'gemini']).filter((p) => ai.hasKey(p));
  const results = await Promise.all(
    providers.map(async (p) => {
      const t = Date.now();
      try {
        const r = await assistant.sandboxReply({ messages: req.body?.messages, provider: p, model: req.body?.models?.[p] });
        return { provider: p, ...r, ms: Date.now() - t };
      } catch (err) {
        return { provider: p, error: err.message, ms: Date.now() - t };
      }
    })
  );
  res.json(results);
}));

// أداء المساعد
router.get('/stats', asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 7));
  const q = (sql) => pool.query(sql, [days]).then((r) => r.rows);
  const [msg] = await q(`SELECT
      COUNT(*) FILTER (WHERE direction = 'in')::int AS incoming,
      COUNT(*) FILTER (WHERE sender = 'ai' AND ai_status = 'sent')::int AS ai_sent,
      COUNT(*) FILTER (WHERE sender = 'ai' AND ai_status = 'rejected')::int AS ai_rejected,
      COUNT(*) FILTER (WHERE sender = 'ai' AND ai_status = 'suggested')::int AS ai_pending,
      COUNT(*) FILTER (WHERE sender IN ('staff','phone'))::int AS staff_sent,
      COUNT(*) FILTER (WHERE rating = 1)::int AS thumbs_up,
      COUNT(*) FILTER (WHERE rating = -1)::int AS thumbs_down,
      COUNT(DISTINCT conversation_id)::int AS conversations
    FROM wa_messages WHERE created_at >= now() - make_interval(days => $1)`);
  const [orders] = await q(`SELECT COUNT(*) FILTER (WHERE ai_created)::int AS ai_orders, COALESCE(SUM(total) FILTER (WHERE ai_created),0) AS ai_revenue,
      COUNT(*) FILTER (WHERE ai_created AND edited_at IS NOT NULL)::int AS ai_orders_edited
    FROM orders WHERE created_at >= now() - make_interval(days => $1) AND status <> 'cancelled'`);
  const handoffs = await q(`SELECT substring(body from 'حوّل لموظف: (.*)') AS reason, COUNT(*)::int AS n FROM wa_messages
      WHERE direction = 'note' AND body LIKE 'حوّل لموظف:%' AND created_at >= now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  // الرسائل يلي المساعد حوّلها لموظف أو انرفض رده عليها — "شو لازم تعلّميه"
  const unanswered = await q(`SELECT m.body, COUNT(*)::int AS n FROM wa_messages m
      WHERE m.direction = 'in' AND m.created_at >= now() - make_interval(days => $1) AND length(m.body) BETWEEN 3 AND 300
        AND EXISTS (SELECT 1 FROM wa_messages r WHERE r.conversation_id = m.conversation_id AND r.id > m.id
                    AND ((r.sender = 'ai' AND (r.ai_status = 'rejected' OR r.rating = -1)) OR (r.direction = 'note' AND r.body LIKE 'حوّل لموظف:%'))
                    AND r.id = (SELECT MIN(x.id) FROM wa_messages x WHERE x.conversation_id = m.conversation_id AND x.id > m.id AND x.direction <> 'in'))
      GROUP BY m.body ORDER BY 2 DESC LIMIT 15`);
  const usage = await q(`SELECT provider, kind, SUM(requests)::int AS requests, SUM(input_tokens)::bigint AS input_tokens, SUM(output_tokens)::bigint AS output_tokens
      FROM ai_usage WHERE day >= (now() AT TIME ZONE 'Asia/Hebron')::date - $1::int GROUP BY 1, 2 ORDER BY 1, 2`);
  res.json({ days, messages: msg, orders: { ...orders, ai_revenue: Number(orders.ai_revenue) }, handoffs, unanswered, usage });
}));

// تحليل البيانات بالذكاء الاصطناعي
router.post('/analyze', asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.body?.days) || 7));
  try {
    res.json(await analysis.analyze({ days, question: req.body?.question, provider: req.body?.provider, model: req.body?.model }));
  } catch (err) {
    fail(res, err);
  }
}));

module.exports = router;
