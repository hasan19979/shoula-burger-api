/**
 * المساعد الذكي لمحادثات الواتساب:
 *  - بيحفظ كل رسالة بصندوق الرسائل (store.js)
 *  - بيرد على الزبون من المنيو الحقيقي ودليل المطعم، وبياخد طلبات (السعر دايماً من السيرفر)
 *  - بيحوّل لموظف لما ما بيعرف أو الزبون معصّب
 *  - وضع "بيقترح والموظف بيوافق" أو "بيبعت لحاله"
 */
const pool = require('../db/pool');
const { broadcast } = require('../realtime');
const wa = require('../whatsapp');
const ai = require('./providers');
const store = require('./store');
const businessDay = require('../businessDay');

const DEBOUNCE_MS = Number(process.env.AI_DEBOUNCE_MS) || 6000; // الزبون بيبعت كذا رسالة ورا بعض — منستنى شوي ومنرد عليهم سوا
const timers = new Map();
const running = new Set();

/* ---------- استقبال رسالة من الواتساب ---------- */
async function onIncoming(m) {
  const conv = await store.upsertConversation(m.jid, { name: m.fromMe ? '' : m.pushName });
  if (m.fromMe) {
    // رسالة من تلفون المطعم نفسه (موظف رد من التلفون) — منحفظها، والمساعد بيسكت بهاي المحادثة
    const saved = await store.addMessage(conv.id, { direction: 'out', kind: m.kind, body: m.text, sender: 'phone', wa_id: m.id });
    if (saved && conv.ai_enabled) await store.updateConversation(conv.id, { ai_enabled: false });
    return;
  }
  const saved = await store.addMessage(conv.id, { direction: 'in', kind: m.kind, body: m.text, sender: 'customer', wa_id: m.id });
  if (!saved) return; // مكررة

  // صور وفويسات: منحوّلها لكتابة (حسب الإعدادات) — حتى الموظف والمساعد يفهموها
  if (m.kind === 'image' || m.kind === 'audio') {
    processMedia(saved, m.raw).catch((err) => console.error('[ai] media:', err.message));
  }

  // رسالة تأكيد طلب من الموقع (فيها رقم الطلب) — الكاشير بيبعت الوقت، المساعد ما بيرد عليها
  if (require('../waConfirm').extractOrderNo(m.text)) return;
  scheduleReply(conv.id);
}

async function processMedia(message, raw) {
  const cfg = await store.getConfig();
  const which = message.kind === 'image' ? cfg.vision : cfg.audio;
  if (!which?.provider || which.provider === 'off') return;
  const provider = pickProvider(which.provider, message.kind === 'image' ? ['gemini', 'openai', 'anthropic'] : ['gemini', 'openai']);
  if (!provider) return;
  if (provider !== which.provider) Object.assign(which, { provider, model: '' });
  const media = await wa.getMediaBase64(raw);
  if (!media) return;
  let note = '';
  try {
    note =
      message.kind === 'image'
        ? await ai.describeImage({ provider: which.provider, model: which.model, base64: media.base64, mime: media.mimetype })
        : await ai.transcribeAudio({ provider: which.provider, model: which.model, base64: media.base64, mime: media.mimetype });
  } catch (err) {
    note = '';
    console.error('[ai] media convert:', err.message);
  }
  if (!note) return;
  const { rows } = await pool.query('UPDATE wa_messages SET media_note = $1 WHERE id = $2 RETURNING *', [note.slice(0, 2000), message.id]);
  if (rows[0]) broadcast('inbox-message-updated', { conversationId: rows[0].conversation_id, message: rows[0] });
}

function scheduleReply(conversationId, delay = DEBOUNCE_MS) {
  clearTimeout(timers.get(conversationId));
  timers.set(
    conversationId,
    setTimeout(() => {
      timers.delete(conversationId);
      replyNow(conversationId).catch((err) => console.error('[ai] reply failed:', err.message));
    }, delay)
  );
}

/* ---------- هل المساعد بيشتغل هلق؟ ---------- */
function minutesNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: businessDay.TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [h, m] = parts.split(':').map(Number);
  return (h % 24) * 60 + m;
}
const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  return m ? (Number(m[1]) % 24) * 60 + Number(m[2]) : null;
};
function inRange(now, from, to) {
  if (from === null || to === null) return true;
  return from <= to ? now >= from && now < to : now >= from || now < to;
}
async function isOpenNow() {
  const { rows } = await pool.query('SELECT open_time, close_time FROM settings WHERE id = 1');
  const o = toMin(rows[0]?.open_time);
  const c = toMin(rows[0]?.close_time);
  return o === null || c === null ? true : inRange(minutesNow(), o, c);
}
async function scheduleAllows(cfg) {
  if (cfg.schedule === 'always') return true;
  if (cfg.schedule === 'outside') return !(await isOpenNow());
  return inRange(minutesNow(), toMin(cfg.from), toMin(cfg.to));
}

/* ---------- المنيو والسياق ---------- */
async function loadMenu() {
  const { attachIngredients } = require('../routes/products');
  const { rows } = await pool.query(
    `SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON c.id = p.category_id ORDER BY c.sort_order NULLS LAST, p.sort_order, p.id`
  );
  return attachIngredients(rows, true);
}

function menuText(products) {
  const byCat = new Map();
  for (const p of products) {
    if (!byCat.has(p.category_name)) byCat.set(p.category_name, []);
    byCat.get(p.category_name).push(p);
  }
  const lines = [];
  for (const [cat, list] of byCat) {
    lines.push(`## ${cat}`);
    for (const p of list) {
      const parts = [`[${p.id}] ${p.name} — ${Number(p.price)}${p.in_stock ? '' : ' (خلص حالياً — ما تبيعه)'}`];
      if (p.description) parts.push(`  وصف: ${String(p.description).slice(0, 120)}`);
      const vs = (p.variants || []).filter((v) => !v.hiddenFromWebsite);
      if (vs.length) parts.push(`  أحجام/أنواع: ${vs.map((v) => `${v.name}${v.priceDelta ? ` (+${v.priceDelta})` : ''}`).join('، ')}`);
      const base = (p.ingredients || []).filter((i) => i.defaultIncluded).map((i) => i.name);
      const extra = (p.ingredients || []).filter((i) => !i.defaultIncluded).map((i) => `${i.name}${i.price ? ` (+${i.price})` : ''}`);
      if (base.length) parts.push(`  مكوناته (بينشالوا ببلاش): ${base.join('، ')}`);
      if (extra.length) parts.push(`  إضافات: ${extra.join('، ')}`);
      lines.push(parts.join('\n'));
    }
  }
  return lines.join('\n');
}

async function customerContext(conv) {
  if (!conv.phone && !conv.customer_id) return 'زبون جديد (ما إله طلبات سابقة معروفة).';
  const { rows: cust } = await pool.query('SELECT name, address, loyalty_points FROM customers WHERE id = $1 OR phone = $2 LIMIT 1', [conv.customer_id || 0, conv.phone || '']);
  const { rows: orders } = await pool.query(
    `SELECT o.order_no, o.created_at, o.total, o.order_type, o.status, o.kitchen_status,
            (SELECT string_agg(product_name || ' ×' || quantity, '، ') FROM order_items WHERE order_id = o.id) AS items
       FROM orders o WHERE (o.customer_phone = $1 OR o.wa_jid = $2) AND o.awaiting_wa = false
      ORDER BY o.created_at DESC LIMIT 3`,
    [conv.phone || '', conv.jid]
  );
  const c = cust[0];
  const out = [];
  if (c) out.push(`الزبون: ${c.name}${c.address ? ` • عنوانه المعروف: ${c.address}` : ''} • نقاطه: ${c.loyalty_points}`);
  if (orders.length) out.push('آخر طلباته: ' + orders.map((o) => `#${o.order_no} (${o.items || ''}، ${Number(o.total)})`).join(' | '));
  return out.join('\n') || 'زبون جديد.';
}

async function buildSystem(conv, cfg, guide, { menu, sandbox, prior } = {}) {
  const { rows } = await pool.query('SELECT * FROM settings WHERE id = 1');
  const s = rows[0] || {};
  const open = await isOpenNow();
  const g = guide.content;
  const now = new Intl.DateTimeFormat('ar', { timeZone: businessDay.TZ, weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const parts = [
    g.persona,
    `اسم المطعم: ${s.restaurant_name || ''}. ${s.address ? `العنوان: ${s.address}.` : ''} ${s.phone ? `الهاتف: ${s.phone}.` : ''}`,
    `ساعات الدوام: ${s.hours_text || `${s.open_time || ''} - ${s.close_time || ''}`}. الوقت هلق: ${now} — المطعم ${open ? 'فاتح' : 'مسكّر'} هلق.`,
    'التوصيل مجاني (ما في رسوم توصيل). العملة: ' + (s.currency || '₪') + '.',
    '',
    '# قواعد مهمة',
    '- جاوب بس من المعلومات هون (المنيو، الدليل، معلومات المطعم). ما تخترع أصناف أو أسعار أو عروض.',
    '- إذا السؤال برا هاد كله، أو الزبون معصّب أو عنده شكوى، أو طلب شي ما بتقدر تعمله: استعمل أداة handoff_to_human.',
    '- رسائلك قصيرة ومناسبة للواتساب، بدون عناوين أو جداول.',
    ...(g.rules || []).map((r) => `- ${r}`),
  ];
  if (cfg.takeOrders) {
    parts.push(
      '',
      '# أخذ الطلبات',
      '- لما الزبون يطلب أكل: استعمل update_order_draft بأرقام الأصناف [id] من المنيو. السعر والمجموع بيرجعوا من النظام — احكيهم للزبون زي ما هم بالضبط.',
      '- اسأل عن الناقص بس: نوع الطلب (توصيل / سفري / بالمطعم)، والعنوان إذا توصيل، والاسم إذا مش معروف.',
      '- اعرض ملخص الطلب والمجموع واسأله يأكد. ما تستعمل place_order إلا بعد ما الزبون يأكد صراحة (مثلاً "تمام" أو "أكد").',
      !open ? '- المطعم مسكّر هلق: ما تاخد طلبات، احكيله إمتى بنفتح.' : ''
    );
  } else {
    parts.push('', '- ما بتاخد طلبات بالمحادثة. إذا بدو يطلب، احكيله يطلب من الموقع أو حوّل لموظف.');
  }
  if ((g.faqs || []).length) parts.push('', '# أسئلة وأجوبة', ...g.faqs.map((f) => `س: ${f.q}\nج: ${f.a}`));
  if ((g.examples || []).length) parts.push('', '# أمثلة لردود منيحة (قلّد أسلوبها)', ...g.examples.map((e) => `الزبون: ${e.customer}\nالرد: ${e.reply}`));
  parts.push('', '# المنيو (الرقم بين [] للأدوات بس، ما تذكره للزبون)', menuText(menu || (await loadMenu())));
  parts.push('', '# الزبون', sandbox ? 'محادثة تجريبية.' : await customerContext(conv));
  if (prior) {
    parts.push(
      '', '# محادثة سابقة انحلت مع موظف المطعم (للسياق بس)', prior,
      'الموظف تعامل مع الموضوع هاد ورجّع المحادثة إلك. ما تحوّل لموظف مرة تانية على نفس الموضوع إلا إذا الزبون طلب هالشي صراحة أو صار إشي جديد ما بتعرفه.'
    );
  }
  if (conv.draft_order?.lines?.length) parts.push('', '# الطلب يلي عم يتجهّز هلق', conv.draft_order.lines.join('\n'), `المجموع: ${conv.draft_order.total}`);
  return parts.filter((x) => x !== '').join('\n');
}

/* ---------- الأدوات ---------- */
const TOOLS = [
  {
    name: 'update_order_draft',
    description: 'بيجهّز/بيحدّث طلب الزبون (كل الطلب كامل كل مرة). بيرجّع الأسطر والمجموع من النظام، أو أخطاء.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'integer', description: 'رقم الصنف من المنيو' },
              quantity: { type: 'integer' },
              variant: { type: 'string', description: 'اسم الحجم/النوع إذا في' },
              remove: { type: 'array', items: { type: 'string' }, description: 'مكونات بدها تنشال' },
              add: { type: 'array', items: { type: 'string' }, description: 'إضافات' },
              note: { type: 'string' },
            },
            required: ['product_id', 'quantity'],
          },
        },
        order_type: { type: 'string', description: 'delivery أو takeaway أو dine-in' },
        address: { type: 'string' },
        customer_name: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['items'],
    },
  },
  { name: 'place_order', description: 'بيبعت الطلب الجاهز للمطبخ. بس بعد ما الزبون يأكد صراحة.', parameters: { type: 'object', properties: {} } },
  { name: 'order_status', description: 'حالة آخر طلبات هاد الزبون.', parameters: { type: 'object', properties: {} } },
  {
    name: 'handoff_to_human',
    description: 'تحويل المحادثة لموظف (سؤال برا معلوماتك، شكوى، زبون معصّب، طلب خاص).',
    parameters: { type: 'object', properties: { reason: { type: 'string', description: 'السبب باختصار' } }, required: ['reason'] },
  },
];

async function priceDraft(args, menu) {
  const { priceOrderItems } = require('../routes/orders');
  const items = Array.isArray(args.items) ? args.items : [];
  if (!items.length) return { error: 'الطلب فاضي' };
  const problems = [];
  const payload = [];
  for (const it of items) {
    const p = menu.find((x) => x.id === Number(it.product_id));
    if (!p) {
      problems.push(`صنف رقم ${it.product_id} مش موجود`);
      continue;
    }
    if (!p.in_stock) {
      problems.push(`${p.name} خلص حالياً`);
      continue;
    }
    const vs = p.variants || [];
    let variantId = null;
    if (it.variant) {
      const v = vs.find((x) => x.name === it.variant) || vs.find((x) => x.name.includes(it.variant) || it.variant.includes(x.name));
      if (v) variantId = v.id;
      else problems.push(`${p.name}: ما في حجم "${it.variant}" (المتوفر: ${vs.map((x) => x.name).join('، ') || 'ولا شي'})`);
    } else if (vs.length) {
      variantId = (vs.find((x) => x.isDefault) || vs[0]).id;
    }
    const base = (p.ingredients || []).filter((i) => i.defaultIncluded).map((i) => i.name);
    const extras = (p.ingredients || []).filter((i) => !i.defaultIncluded).map((i) => i.name);
    const remove = (it.remove || []).filter((n) => base.includes(n));
    const add = (it.add || []).filter((n) => extras.includes(n));
    for (const n of it.remove || []) if (!base.includes(n)) problems.push(`${p.name}: "${n}" مش من مكوناته`);
    for (const n of it.add || []) if (!extras.includes(n)) problems.push(`${p.name}: ما في إضافة "${n}"`);
    payload.push({
      productId: p.id,
      quantity: Math.max(1, Math.min(50, parseInt(it.quantity, 10) || 1)),
      variantId,
      removedIngredients: remove,
      addedIngredients: add,
      includedIngredients: [...base.filter((n) => !remove.includes(n)), ...add],
      itemNote: typeof it.note === 'string' ? it.note.slice(0, 200) : '',
    });
  }
  if (!payload.length) return { error: problems.join(' • ') || 'الطلب فاضي' };
  const client = await pool.connect();
  let priced;
  try {
    priced = await priceOrderItems(client, payload);
  } finally {
    client.release();
  }
  if (priced.error) return { error: priced.error.message };
  const lines = priced.preparedItems.map((pi, idx) => {
    const src = payload[idx];
    const mods = [...src.addedIngredients.map((n) => `+${n}`), ...src.removedIngredients.map((n) => `بدون ${n}`), ...(src.itemNote ? [src.itemNote] : [])];
    return `${pi.quantity}× ${pi.product_name}${mods.length ? ` (${mods.join('، ')})` : ''} = ${Number(pi.line_total)}`;
  });
  const type = ['delivery', 'takeaway', 'dine-in'].includes(args.order_type) ? args.order_type : null;
  const missing = [];
  if (!type) missing.push('نوع الطلب (توصيل/سفري/بالمطعم)');
  if (type === 'delivery' && !String(args.address || '').trim()) missing.push('العنوان');
  return {
    draft: { items: payload, order_type: type, address: String(args.address || '').trim(), customer_name: String(args.customer_name || '').trim(), notes: String(args.notes || '').slice(0, 300), lines, total: priced.subtotal },
    result: { ok: true, lines, total: priced.subtotal, problems, missing },
  };
}

/** بيعمل الطلب فعلياً (من المساعد أو من موظف بالصندوق) */
async function createOrderFromDraft(conv, draft, { by } = {}) {
  const { buildAndSaveOrder } = require('../routes/orders');
  if (!draft?.items?.length) return { error: 'ما في طلب جاهز' };
  if (!draft.order_type) return { error: 'نوع الطلب ناقص' };
  if (draft.order_type === 'delivery' && !draft.address) return { error: 'العنوان ناقص' };
  const name = draft.customer_name || conv.name || 'زبون واتساب';
  const phone = conv.phone || wa.targetOf(conv.jid);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await buildAndSaveOrder(client, {
      items: draft.items, customerName: name, customerPhone: phone, address: draft.address, notes: draft.notes,
      orderType: draft.order_type, status: 'pending', paymentMethod: 'cash', chargeDeliveryFee: false, enforceMinOrder: false,
      orderSource: 'online', kitchenStatus: 'new',
    });
    if (result.error) {
      await client.query('ROLLBACK');
      return { error: result.error.message };
    }
    await client.query('UPDATE orders SET ai_created = $2, wa_jid = $3, wa_confirmed_at = now() WHERE id = $1', [result.order.id, by !== 'staff', conv.jid]);
    await client.query('COMMIT');
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [result.order.id]);
    broadcast('new-order', { ...result.order, ai_created: by !== 'staff', items });
    await store.updateConversation(conv.id, { draft_order: null });
    return { order: result.order };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function makeExecTool(conv, cfg, menu, state, { sandbox } = {}) {
  return async (name, args) => {
    if (name === 'update_order_draft') {
      if (!cfg.takeOrders) return { error: 'أخذ الطلبات مطفي' };
      const r = await priceDraft(args, menu);
      if (r.draft) {
        state.draft = r.draft;
        conv.draft_order = r.draft;
        if (!sandbox) await store.updateConversation(conv.id, { draft_order: r.draft });
      }
      return r.result || { error: r.error };
    }
    if (name === 'place_order') {
      if (!cfg.takeOrders) return { error: 'أخذ الطلبات مطفي' };
      const draft = state.draft || conv.draft_order;
      if (!draft) return { error: 'لازم تجهّز الطلب أول (update_order_draft)' };
      if (sandbox) return { ok: true, order_no: 'تجربة-001', total: draft.total, note: 'محادثة تجريبية — ما انبعت شي فعلياً' };
      if (cfg.mode !== 'auto') {
        state.awaitingStaffOrder = true;
        return { ok: false, pending_staff: true, message: 'الطلب جاهز وبيستنى موافقة موظف. احكي للزبون إنه طلبه وصل ورح يتأكد خلال لحظات.' };
      }
      const r = await createOrderFromDraft(conv, draft, { by: 'ai' });
      if (r.error) return { error: r.error };
      state.placed = r.order;
      return { ok: true, order_no: r.order.order_no, total: Number(r.order.total) };
    }
    if (name === 'order_status') {
      if (sandbox) return { orders: [] };
      const { rows } = await pool.query(
        `SELECT order_no, created_at, status, kitchen_status, eta_minutes, eta_sent_at, ready_sent_at FROM orders
          WHERE (customer_phone = $1 OR wa_jid = $2) AND awaiting_wa = false ORDER BY created_at DESC LIMIT 3`,
        [conv.phone || '', conv.jid]
      );
      return {
        orders: rows.map((o) => ({
          order_no: o.order_no,
          حالة: o.status === 'cancelled' ? 'ملغي' : o.ready_sent_at ? 'جاهز' : o.kitchen_status === 'served' ? 'بالتحضير' : 'استلمناه',
          الوقت_المقدر_دقايق: o.eta_minutes,
        })),
      };
    }
    if (name === 'handoff_to_human') {
      state.handoff = String(args.reason || 'طلب موظف').slice(0, 200);
      return { ok: true, message: 'تم التحويل. احكي للزبون جملة قصيرة إنه موظف رح يرد عليه.' };
    }
    return { error: 'أداة مش معروفة' };
  };
}

/** المحادثة بشكل الموديل (آخر 20 رسالة) */
const RETURN_MARK = 'رجعت للمساعد';

/** آخر مرة الموظف رجّع المحادثة للمساعد (رقم الملاحظة) — 0 لو ما صار */
async function lastReturnId(conversationId) {
  const { rows } = await pool.query(
    `SELECT id FROM wa_messages WHERE conversation_id = $1 AND direction = 'note' AND body LIKE $2 ORDER BY id DESC LIMIT 1`,
    [conversationId, RETURN_MARK + '%']
  );
  return rows[0]?.id || 0;
}

function toTurn(m) {
  let text = m.body || '';
  if (m.kind === 'image') text = `[صورة${m.media_note ? `: ${m.media_note}` : ' — ما قدرنا نشوف محتواها'}] ${text}`;
  if (m.kind === 'audio') text = `[رسالة صوتية${m.media_note ? `: ${m.media_note}` : ' — ما قدرنا نسمعها، اطلب منه يكتب'}] ${text}`;
  if (m.direction === 'out' && m.sender !== 'ai') text = `(رد موظف) ${text}`;
  return { role: m.direction === 'in' ? 'user' : 'assistant', text };
}

/** الرسائل يلي المساعد بيشوفها: بس يلي بعد آخر "رجعت للمساعد" — الموضوع يلي قبل انحل مع الموظف،
 * وإلا رح يقراه من جديد ويحوّل مرة تانية (ويعلق). يلي قبل بيوصله كسياق قصير بس */
async function historyOf(conversationId) {
  const since = await lastReturnId(conversationId);
  const q = (cond) =>
    pool.query(
      `SELECT * FROM (SELECT * FROM wa_messages WHERE conversation_id = $1 AND direction <> 'note' AND (ai_status IS NULL OR ai_status = 'sent') AND ${cond} ORDER BY id DESC LIMIT 20) t ORDER BY id`,
      [conversationId, since]
    );
  const turns = (await q('id > $2')).rows.map(toTurn);
  while (turns.length && turns[0].role !== 'user') turns.shift(); // لازم تبلش برسالة الزبون
  let prior = '';
  if (since) {
    const before = (await q('id < $2')).rows.slice(-6).map(toTurn);
    prior = before.map((t) => `${t.role === 'user' ? 'الزبون' : 'المطعم'}: ${t.text}`).join('\n');
  }
  return { turns, prior };
}

/* ---------- الرد ---------- */
/** الشركة المختارة لو إلها مفتاح، وإلا أول شركة إلها مفتاح */
function pickProvider(chosen, order) {
  if (chosen && ai.hasKey(chosen)) return chosen;
  return order.find((p) => ai.hasKey(p)) || null;
}

/** ملاحظة "ليش ما رد" — ما منكررها بنفس المحادثة قبل ما تمرق المدة (بالدقايق) */
async function skipNote(conversationId, body, everyMin) {
  const { rows } = await pool.query(
    `SELECT 1 FROM wa_messages WHERE conversation_id = $1 AND direction = 'note' AND body = $2 AND created_at > now() - ($3::int * interval '1 minute') LIMIT 1`,
    [conversationId, body, everyMin]
  );
  if (!rows.length) await store.addMessage(conversationId, { direction: 'note', sender: 'system', body });
}

async function replyNow(conversationId) {
  if (running.has(conversationId)) return scheduleReply(conversationId, 3000);
  running.add(conversationId);
  try {
    const cfg = await store.getConfig();
    const { rows } = await pool.query('SELECT * FROM wa_conversations WHERE id = $1', [conversationId]);
    const conv = rows[0];
    if (!conv) return;
    // ليش المساعد ما رد؟ منكتبها كملاحظة صغيرة بالمحادثة (مرة وحدة كل فترة) — حتى ما يضل سكوت بدون سبب
    if (!cfg.enabled) return skipNote(conv.id, 'المساعد ما رد: مطفي من الإعدادات ← الذكاء الاصطناعي', 360);
    if (!conv.ai_enabled) return skipNote(conv.id, 'المساعد ما رد: مطفي بهاي المحادثة (لأنه موظف رد). شغّليه من زر "المساعد" فوق المحادثة', 60);
    if (conv.needs_human) {
      // لو تحوّلت لموظف بسبب خطأ تقني (ضغط، تأخير...) والزبون بعت رسالة جديدة — منرجع نجرب
      if (/^المساعد ما قدر يرد/.test(conv.needs_human_reason || '')) {
        await store.updateConversation(conv.id, { needs_human: false, needs_human_reason: null });
        conv.needs_human = false;
      } else {
        return skipNote(conv.id, 'المساعد ما رد: المحادثة محوّلة لموظف. اكبسي "تم — رجّعيها للمساعد"', 60);
      }
    }
    const chatProvider = pickProvider(cfg.chat.provider, ['anthropic', 'openai', 'gemini']);
    if (!chatProvider) return skipNote(conv.id, 'المساعد ما رد: ما في مفتاح ذكاء اصطناعي على Render', 60);
    if (chatProvider !== cfg.chat.provider) cfg.chat = { provider: chatProvider, model: '' };
    if (!(await scheduleAllows(cfg))) return skipNote(conv.id, 'المساعد ما رد: هلأ برا أوقات شغله (حسب الإعدادات)', 60);
    // آخر رسالة لازم تكون من الزبون (ما في داعي نرد مرتين)
    const last = await pool.query(`SELECT id, direction, ai_status FROM wa_messages WHERE conversation_id = $1 AND direction <> 'note' ORDER BY id DESC LIMIT 1`, [conversationId]);
    if (!last.rows.length || last.rows[0].direction !== 'in') return;
    // رسالة قديمة من قبل ما ترجّعيها — الموظف تعامل معها، منستنى رسالة جديدة من الزبون
    if (last.rows[0].id < (await lastReturnId(conversationId))) return;
    if (cfg.dailyLimit && (await ai.usedToday()) >= cfg.dailyLimit) {
      await store.updateConversation(conversationId, { needs_human: true, needs_human_reason: 'الحد اليومي للمساعد خلص' });
      await store.addMessage(conversationId, { direction: 'note', sender: 'system', body: 'حوّل لموظف: الحد اليومي للمساعد خلص' });
      return;
    }
    // ننطر الصور والفويسات تتحوّل لكتابة (لحد 20 ثانية)
    for (let i = 0; i < 10; i++) {
      const p = await pool.query(`SELECT 1 FROM wa_messages WHERE conversation_id = $1 AND direction = 'in' AND kind IN ('image','audio') AND media_note IS NULL AND created_at > now() - interval '25 seconds' LIMIT 1`, [conversationId]);
      if (!p.rows.length) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    const guide = await store.getGuide();
    const menu = await loadMenu();
    const { turns, prior } = await historyOf(conversationId);
    if (!turns.length) return;
    const system = await buildSystem(conv, cfg, guide, { menu, prior });
    const state = {};
    let out;
    try {
      out = await ai.runAgent({
        provider: cfg.chat.provider, model: cfg.chat.model, system, history: turns,
        tools: TOOLS, execTool: makeExecTool(conv, cfg, menu, state), kind: 'chat',
      });
    } catch (err) {
      await store.updateConversation(conversationId, { needs_human: true, needs_human_reason: `المساعد ما قدر يرد: ${err.message}`.slice(0, 200) });
      await store.addMessage(conversationId, { direction: 'note', sender: 'system', body: `المساعد ما قدر يرد: ${err.message}`.slice(0, 300) });
      return;
    }
    let text = (out.text || '').trim();
    if (state.handoff) {
      await store.updateConversation(conversationId, { needs_human: true, needs_human_reason: state.handoff });
      await store.addMessage(conversationId, { direction: 'note', sender: 'system', body: `حوّل لموظف: ${state.handoff}` });
      if (!text) text = cfg.handoffMessage;
    }
    if (state.awaitingStaffOrder) {
      await store.updateConversation(conversationId, { needs_human: true, needs_human_reason: 'طلب جاهز — بيستنى موافقتك' });
    }
    if (!text) return;
    await deliverAiText(conv, cfg, text);
  } finally {
    running.delete(conversationId);
  }
}

/** وضع "تلقائي" بيبعت فوراً • وضع "اقتراح" بيحفظه وبيستنى الموظف */
async function deliverAiText(conv, cfg, text) {
  if (cfg.mode !== 'auto') {
    await store.addMessage(conv.id, { direction: 'out', body: text, sender: 'ai', ai_status: 'suggested' });
    return;
  }
  await sendOut(conv, text, { sender: 'ai', ai_status: 'sent' });
}

/** إرسال رسالة للزبون عبر Evolution وحفظها (من الموظف أو المساعد) */
async function sendOut(conv, text, { sender, sender_name, ai_status, existingId } = {}) {
  let waId = null;
  let error = null;
  try {
    const r = await wa.sendText(wa.targetOf(conv.jid), text);
    waId = r?.key?.id || null;
  } catch (err) {
    error = err.message;
  }
  if (existingId) {
    const { rows } = await pool.query(
      `UPDATE wa_messages SET body = $2, ai_status = $3, wa_id = COALESCE($4, wa_id), error = $5, sender_name = COALESCE($6, sender_name), created_at = now() WHERE id = $1 RETURNING *`,
      [existingId, text, error ? 'suggested' : 'sent', waId, error, sender_name || null]
    );
    if (!error) {
      await pool.query(`UPDATE wa_conversations SET last_message_at = now(), last_preview = $2 WHERE id = $1`, [conv.id, text.slice(0, 140)]);
    }
    broadcast('inbox-message-updated', { conversationId: conv.id, message: rows[0] });
    if (error) throw new wa.WhatsAppError(error);
    return rows[0];
  }
  const saved = await store.addMessage(conv.id, { direction: 'out', body: text, sender, sender_name, ai_status, wa_id: waId, error });
  if (error) throw new wa.WhatsAppError(error);
  return saved;
}

/* ---------- محادثة تجريبية بالإعدادات (ما بينبعت شي) ---------- */
async function sandboxReply({ messages, provider, model }) {
  const cfg = await store.getConfig();
  const guide = await store.getGuide();
  const menu = await loadMenu();
  const conv = { id: 0, jid: 'sandbox', name: 'تجربة', draft_order: null };
  const p = provider || pickProvider(cfg.chat.provider, ['anthropic', 'openai', 'gemini']) || cfg.chat.provider;
  if (!provider && p !== cfg.chat.provider) cfg.chat = { provider: p, model: '' };
  const system = await buildSystem(conv, { ...cfg, mode: 'auto' }, guide, { menu, sandbox: true });
  const state = {};
  const out = await ai.runAgent({
    provider: p, model: provider ? model : cfg.chat.model, system, fallback: !provider, // بالمقارنة بدنا جواب نفس الشركة
    history: (messages || []).slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: String(m.text || '').slice(0, 2000) })),
    tools: TOOLS, execTool: makeExecTool(conv, { ...cfg, mode: 'auto' }, menu, state, { sandbox: true }), kind: 'chat',
  });
  return { text: out.text || (state.handoff ? cfg.handoffMessage : ''), draft: state.draft || null, handoff: state.handoff || null, calls: out.calls.map((c) => c.name) };
}

module.exports = {
  RETURN_MARK, onIncoming, replyNow, scheduleReply, sendOut, createOrderFromDraft, sandboxReply, loadMenu, TOOLS };
