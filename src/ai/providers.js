/**
 * طبقة موحّدة للذكاء الاصطناعي — Claude (Anthropic) و ChatGPT (OpenAI) و Gemini (Google).
 * كل وظيفة (المحادثة، الصور، الصوت، التحليل) بتقدر تختار شركتها وموديلها من الإعدادات.
 * المفاتيح من متغيرات Render فقط: ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY
 */
const pool = require('../db/pool');

const PROVIDERS = {
  anthropic: { label: 'Claude', key: 'ANTHROPIC_API_KEY', base: () => process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com' },
  openai: { label: 'ChatGPT', key: 'OPENAI_API_KEY', base: () => process.env.OPENAI_BASE_URL || 'https://api.openai.com' },
  gemini: { label: 'Gemini', key: 'GEMINI_API_KEY', base: () => process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com' },
};

// موديلات افتراضية — بتقدري تغيّريها من الإعدادات (أسماء الموديلات بتتحدّث مع الوقت)
const DEFAULT_MODELS = {
  chat: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o-mini', gemini: 'gemini-3.8-flash' },
  vision: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o-mini', gemini: 'gemini-3.8-flash' },
  audio: { openai: 'whisper-1', gemini: 'gemini-3.8-flash' },
};

class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const hasKey = (p) => !!(PROVIDERS[p] && process.env[PROVIDERS[p].key]);
const keyStatus = () => Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, hasKey(p)]));

function modelFor(kind, provider, chosen) {
  return (chosen && String(chosen).trim()) || DEFAULT_MODELS[kind]?.[provider] || DEFAULT_MODELS.chat[provider];
}

/** موديلات جيميناي يلي جوجل وقّفتها، ومنستعمل بدالها الموديل يلي هي اقترحته (منحفظها بالذاكرة) */
const geminiReplaced = new Map();
const geminiNoThinking = new Set();
/** طلب لجيميناي: لو الموديل انوقف ورسالة الخطأ بتقترح موديل جديد ("use models/xxx")، منعيد الطلب فيه لحاله.
 * والموديلات الجديدة بتفكّر قبل ما تكتب، فما منعطيها حد كلمات صغير لدرجة يخلص قبل الجواب */
async function geminiCallModel(model, key, body, retries) {
  let m = geminiReplaced.get(model) || model;
  const gc = body.generationConfig || {};
  body = { ...body, generationConfig: { ...gc, maxOutputTokens: Math.max(gc.maxOutputTokens || 0, 2048) } };
  // موديلات جيميناي 3 وما فوق بتفكّر كتير قبل ما تجاوب (وبتتأخر) — لرد واتساب بيكفي تفكير قليل
  const withThinking = (b, model) =>
    /gemini-([3-9]|\d{2})/i.test(model) && !geminiNoThinking.has(model)
      ? { ...b, generationConfig: { ...b.generationConfig, thinkingConfig: { thinkingLevel: 'low' } } }
      : b;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await http(`${PROVIDERS.gemini.base()}/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`, { body: withThinking(body, m), retries });
    } catch (err) {
      // موديل ما بيقبل إعداد التفكير — منشيله ومنعيد
      if (/thinking/i.test(err.message || '') && !geminiNoThinking.has(m) && /gemini-([3-9]|\d{2})/i.test(m)) {
        geminiNoThinking.add(m);
        attempt--;
        continue;
      }
      const next = /use\s+models\/([\w.\-]+)/i.exec(err.message || '')?.[1];
      if (attempt === 0 && next && next !== m) {
        console.warn(`[ai] Gemini model ${m} retired, switching to ${next}`);
        geminiReplaced.set(model, next);
        m = next;
        continue;
      }
      throw err;
    }
  }
}

/** مفاتيح جيميناي: الأساسي، وواحد احتياطي اختياري (مثلاً حساب مجاني تاني) */
const geminiKeys = () => [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);

/** موديلات جيميناي البديلة (flash / flash-lite) يلي متاحة لهاد المفتاح — منجيبها من جوجل نفسها
 * (ما منكتب أسماء ثابتة لأنها بتتغير)، ومنحفظها 6 ساعات */
const altCache = new Map();
async function geminiAlternatives(key, exclude) {
  const hit = altCache.get(key);
  let names = hit && hit.at > Date.now() - 6 * 3600e3 ? hit.names : null;
  if (!names) {
    names = [];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${PROVIDERS.gemini.base()}/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
      clearTimeout(t);
      const d = await r.json();
      const ver = (n) => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(n) || [])[1] || 0);
      names = (d.models || [])
        .filter((x) => (x.supportedGenerationMethods || []).includes('generateContent'))
        .map((x) => String(x.name || '').replace(/^models\//, ''))
        .filter((n) => /^gemini-.*flash/i.test(n) && !/tts|image|live|audio|embed|exp|computer|robotics/i.test(n))
        // الأحدث أول، والـ lite قبل العادي (أخف وحدّه المجاني أعلى)
        .sort((a, b) => ver(b) - ver(a) || /lite/.test(b) - /lite/.test(a) || /preview/.test(a) - /preview/.test(b));
    } catch {
      /* ما قدرنا نجيب القائمة — بنكمل بدون بدائل */
    }
    altCache.set(key, { at: Date.now(), names });
  }
  return names.filter((n) => n !== exclude).slice(0, 3);
}

/** طلب لجيميناي مع خطة بديلة: لو الموديل مضغوط أو ما رد بالوقت أو خلص حدّه المجاني (429 — الحد لكل موديل لحاله)،
 * منجرب موديل جيميناي تاني، وبعدها المفتاح الاحتياطي. كل هاد بأقل من دقيقتين */
async function geminiCall(model, key, body) {
  const deadline = Date.now() + 100000;
  let firstErr;
  try {
    return await geminiCallModel(model, key, body, 1);
  } catch (err) {
    if (!(err.busy || err.status === 429)) throw err;
    firstErr = err;
  }
  const keys = [key, ...geminiKeys().filter((k) => k !== key)];
  const tried = new Set([`${key}|${model}`]);
  for (const k of keys) {
    for (const m of [model, ...(await geminiAlternatives(k, model))]) {
      if (tried.has(`${k}|${m}`) || Date.now() > deadline) continue;
      tried.add(`${k}|${m}`);
      try {
        console.warn(`[ai] Gemini fallback → ${m}${k !== key ? ' (المفتاح الاحتياطي)' : ''}`);
        return await geminiCallModel(m, k, body, 0);
      } catch (err) {
        if (!(err.busy || err.status === 429)) throw err;
      }
    }
  }
  throw firstErr;
}

/** موديلات OpenAI يلي بتفكّر قبل ما تجاوب (o1/o3/o4، gpt-5...) — التفكير بياكل من حد الكلمات */
const openaiReasoning = (m) => /^(o\d|gpt-[5-9])/i.test(m || '');
/** إعدادات رفضها موديل معيّن — منشيلها عنه بعد أول رفض */
const openaiDropped = new Map();
/** طلب لـ OpenAI: max_completion_tokens (الجديد، بيشتغل مع كل الموديلات)، وتفكير قليل للموديلات يلي بتفكّر.
 * لو الموديل رفض إعداد ("Unsupported parameter/value: 'x'") منشيله ومنعيد لحاله */
async function openaiChat(key, body) {
  body = { ...body };
  if (openaiReasoning(body.model)) {
    body.max_completion_tokens = Math.max(body.max_completion_tokens || 0, 4000);
    body.reasoning_effort = 'low';
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const dropped = openaiDropped.get(body.model) || new Set();
    const b = Object.fromEntries(Object.entries(body).filter(([k]) => !dropped.has(k)));
    if (dropped.has('max_completion_tokens') && !dropped.has('max_tokens')) b.max_tokens = body.max_completion_tokens; // موديل قديم
    try {
      return await http(`${PROVIDERS.openai.base()}/v1/chat/completions`, { headers: { Authorization: `Bearer ${key}` }, body: b });
    } catch (err) {
      const bad = /unsupported (?:parameter|value):\s*'([\w.]+)'/i.exec(err.message || '')?.[1]?.split('.')[0];
      if (!bad || !(bad in b) || bad === 'model' || bad === 'messages') throw err;
      console.warn(`[ai] OpenAI ${body.model}: dropping unsupported '${bad}'`);
      dropped.add(bad);
      openaiDropped.set(body.model, dropped);
    }
  }
  throw new AiError('موديل OpenAI رفض الطلب', 400);
}

/** الشركة مضغوطة مؤقتاً (high demand / overloaded) — منعيد المحاولة، وبعدها منجرب شركة تانية */
const isBusy = (status, msg) => [500, 502, 503, 504, 529].includes(status) || /high demand|overloaded|unavailable|try again later/i.test(String(msg || ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(url, opts = {}) {
  const waits = [2000, 5000].slice(0, opts.retries ?? 2);
  for (let attempt = 0; ; attempt++) {
    try {
      return await httpOnce(url, opts);
    } catch (err) {
      if (!err.busy || err.timeout || attempt >= waits.length) throw err;
      await sleep(waits[attempt]);
    }
  }
}

async function httpOnce(url, { headers = {}, body, form, timeout = 45000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: form ? headers : { 'Content-Type': 'application/json', ...headers },
      body: form || JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.type || data?.message || data?.raw || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new AiError(`المفتاح غلط أو مش مفعّل (${msg})`, 502);
      if (res.status === 404) throw new AiError(`اسم الموديل غلط أو مش متاح لحسابك (${msg})`, 502);
      if (isBusy(res.status, msg)) {
        const e = new AiError('شركة الذكاء الاصطناعي مضغوطة هلأ (ضغط مؤقت) — جربي كمان شوي أو اختاري شركة تانية', 503);
        e.busy = true;
        throw e;
      }
      if (res.status === 429) throw new AiError('الحد المسموح من الشركة خلص (بالحساب المجاني في حد بالدقيقة وباليوم) — حاولي بعد شوي', 429);
      throw new AiError(`خطأ من شركة الذكاء الاصطناعي: ${String(msg).slice(0, 200)}`, 502);
    }
    return data;
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err.name === 'AbortError') {
      const e = new AiError('شركة الذكاء الاصطناعي ما ردت بالوقت — جربي كمان شوي أو اختاري شركة تانية', 504);
      e.busy = true; // منجرب شركة تانية
      e.timeout = true; // بس ما منعيد على نفس الشركة (كانت رح تاخد نفس الوقت)
      throw e;
    }
    throw new AiError('ما قدرنا نوصل لشركة الذكاء الاصطناعي', 502);
  } finally {
    clearTimeout(t);
  }
}

/* ---------- الاستهلاك والحد اليومي (بتوقيت المطعم) ---------- */
async function recordUsage(provider, kind, inTok = 0, outTok = 0) {
  try {
    await pool.query(
      `INSERT INTO ai_usage (day, provider, kind, requests, input_tokens, output_tokens)
       VALUES ((now() AT TIME ZONE 'Asia/Hebron')::date, $1, $2, 1, $3, $4)
       ON CONFLICT (day, provider, kind) DO UPDATE SET requests = ai_usage.requests + 1,
         input_tokens = ai_usage.input_tokens + $3, output_tokens = ai_usage.output_tokens + $4`,
      [provider, kind, Math.round(inTok) || 0, Math.round(outTok) || 0]
    );
  } catch {
    /* الإحصائيات مش ضرورية لنجاح الرد */
  }
}

async function usedToday() {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(requests),0)::int AS n FROM ai_usage WHERE day = (now() AT TIME ZONE 'Asia/Hebron')::date`
  );
  return rows[0].n;
}

function ensureKey(provider) {
  if (!PROVIDERS[provider]) throw new AiError('شركة ذكاء اصطناعي مش معروفة', 400);
  if (!hasKey(provider)) throw new AiError(`مفتاح ${PROVIDERS[provider].label} مش محطوط على Render (${PROVIDERS[provider].key})`, 503);
  return process.env[PROVIDERS[provider].key];
}

/* ---------- تحويل المحادثة لشكل كل شركة ---------- */
// المحادثة الموحّدة: [{ role: 'user'|'assistant', text }] — منجمع الرسائل المتتالية من نفس الطرف
function mergeTurns(history) {
  const out = [];
  for (const m of history) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const text = String(m.text || '').trim();
    if (!text) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].text += '\n' + text;
    else out.push({ role, text });
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', text: '(بداية المحادثة)' });
  return out;
}

/**
 * محادثة مع أدوات (Function calling) — نفس الواجهة لكل الشركات.
 * tools: [{ name, description, parameters (JSON Schema بسيط) }]
 * execTool(name, args) → نتيجة (object) بترجع للموديل
 * بيرجّع { text, calls: [{name, args, result}] }
 */
async function runAgentOnce({ provider, model, system, history, tools = [], execTool, maxSteps = 5, maxTokens = 800, kind = 'chat' }) {
  const key = ensureKey(provider);
  const turns = mergeTurns(history);
  const calls = [];
  const m = modelFor(kind, provider, model);

  if (provider === 'anthropic') {
    const messages = turns.map((t) => ({ role: t.role, content: t.text }));
    for (let step = 0; step < maxSteps; step++) {
      const data = await http(`${PROVIDERS.anthropic.base()}/v1/messages`, {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: {
          model: m, max_tokens: maxTokens, system, messages,
          ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
        },
      });
      await recordUsage('anthropic', kind, data.usage?.input_tokens, data.usage?.output_tokens);
      const blocks = data.content || [];
      const uses = blocks.filter((b) => b.type === 'tool_use');
      if (!uses.length || !execTool) return { text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(), calls };
      messages.push({ role: 'assistant', content: blocks });
      const results = [];
      for (const u of uses) {
        const result = await safeExec(execTool, u.name, u.input || {});
        calls.push({ name: u.name, args: u.input || {}, result });
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: results });
    }
    return { text: '', calls };
  }

  if (provider === 'openai') {
    const messages = [{ role: 'system', content: system }, ...turns.map((t) => ({ role: t.role, content: t.text }))];
    for (let step = 0; step < maxSteps; step++) {
      const data = await openaiChat(key, {
        model: m, messages, max_completion_tokens: maxTokens,
        ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
      });
      await recordUsage('openai', kind, data.usage?.prompt_tokens, data.usage?.completion_tokens);
      const msg = data.choices?.[0]?.message || {};
      const tc = msg.tool_calls || [];
      if (!tc.length || !execTool) return { text: String(msg.content || '').trim(), calls };
      messages.push(msg);
      for (const c of tc) {
        let args = {};
        try {
          args = JSON.parse(c.function?.arguments || '{}');
        } catch {
          args = {};
        }
        const result = await safeExec(execTool, c.function?.name, args);
        calls.push({ name: c.function?.name, args, result });
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
      }
    }
    return { text: '', calls };
  }

  // gemini
  const contents = turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] }));
  for (let step = 0; step < maxSteps; step++) {
    const data = await geminiCall(m, key, {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
        ...(tools.length ? { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }] } : {}),
    });
    await recordUsage('gemini', kind, data.usageMetadata?.promptTokenCount, data.usageMetadata?.candidatesTokenCount);
    const content = data.candidates?.[0]?.content || { role: 'model', parts: [] };
    const parts = content.parts || [];
    const fcs = parts.filter((p) => p.functionCall);
    if (!fcs.length || !execTool) return { text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim(), calls };
    contents.push({ role: 'model', parts });
    const responses = [];
    for (const p of fcs) {
      const result = await safeExec(execTool, p.functionCall.name, p.functionCall.args || {});
      calls.push({ name: p.functionCall.name, args: p.functionCall.args || {}, result });
      responses.push({ functionResponse: { name: p.functionCall.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { text: '', calls };
}

async function safeExec(execTool, name, args) {
  try {
    return await execTool(name, args);
  } catch (err) {
    return { error: err.message || 'خطأ' };
  }
}

/** وصف صورة بالكتابة (حتى تدخل للمحادثة) */
async function describeImageOnce({ provider, model, base64, mime = 'image/jpeg', prompt }) {
  const key = ensureKey(provider);
  const m = modelFor('vision', provider, model);
  const p = prompt || 'صف هاي الصورة باختصار بالعربي (جملة أو جملتين). إذا فيها أكل أو منيو أو طلب أو عنوان، اذكر التفاصيل المهمة.';
  if (provider === 'anthropic') {
    const d = await http(`${PROVIDERS.anthropic.base()}/v1/messages`, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: { model: m, max_tokens: 300, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } }, { type: 'text', text: p }] }] },
    });
    await recordUsage('anthropic', 'vision', d.usage?.input_tokens, d.usage?.output_tokens);
    return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  }
  if (provider === 'openai') {
    const d = await openaiChat(key, { model: m, max_completion_tokens: 300, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }, { type: 'text', text: p }] }] });
    await recordUsage('openai', 'vision', d.usage?.prompt_tokens, d.usage?.completion_tokens);
    return String(d.choices?.[0]?.message?.content || '').trim();
  }
  const d = await geminiCall(m, key, { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: p }] }], generationConfig: { maxOutputTokens: 300 } });
  await recordUsage('gemini', 'vision', d.usageMetadata?.promptTokenCount, d.usageMetadata?.candidatesTokenCount);
  return (d.candidates?.[0]?.content?.parts || []).filter((x) => x.text && !x.thought).map((x) => x.text).join('\n').trim();
}

/** تحويل فويس لكتابة — Claude ما بيسمع صوت، فبس OpenAI أو Gemini */
async function transcribeAudioOnce({ provider, model, base64, mime = 'audio/ogg' }) {
  if (provider === 'anthropic') throw new AiError('Claude ما بيحوّل الصوت لكتابة — اختاري Gemini أو OpenAI للصوت', 400);
  const key = ensureKey(provider);
  const m = modelFor('audio', provider, model);
  if (provider === 'openai') {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(base64, 'base64')], { type: mime }), 'voice.ogg');
    form.append('model', m);
    const d = await http(`${PROVIDERS.openai.base()}/v1/audio/transcriptions`, { headers: { Authorization: `Bearer ${key}` }, form });
    await recordUsage('openai', 'audio', 0, 0);
    return String(d.text || '').trim();
  }
  const d = await geminiCall(m, key, {
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime.split(';')[0], data: base64 } }, { text: 'اكتب حرفياً شو انقال بهاد التسجيل، بنفس اللهجة، بدون أي إضافة.' }] }],
      generationConfig: { maxOutputTokens: 500 },
  });
  await recordUsage('gemini', 'audio', d.usageMetadata?.promptTokenCount, d.usageMetadata?.candidatesTokenCount);
  return (d.candidates?.[0]?.content?.parts || []).filter((x) => x.text && !x.thought).map((x) => x.text).join(' ').trim();
}

/** لو الشركة المختارة مضغوطة، منجرب الشركات التانية يلي إلها مفتاح (بموديلها الافتراضي) */
async function withFallback(provider, allowed, fn) {
  try {
    return await fn(provider, true);
  } catch (err) {
    if (!err.busy) throw err;
    for (const p of allowed.filter((x) => x !== provider && hasKey(x))) {
      try {
        console.warn(`[ai] ${provider} busy, falling back to ${p}`);
        return await fn(p, false);
      } catch (e2) {
        if (!e2.busy) throw e2;
      }
    }
    throw err;
  }
}

const ALL = ['anthropic', 'openai', 'gemini'];
async function runAgent(opts) {
  if (opts.fallback === false) return runAgentOnce(opts);
  return withFallback(opts.provider, ALL, async (p, same) => ({ ...(await runAgentOnce({ ...opts, provider: p, model: same ? opts.model : '' })), provider: p }));
}
async function describeImage(opts) {
  return withFallback(opts.provider, ALL, (p, same) => describeImageOnce({ ...opts, provider: p, model: same ? opts.model : '' }));
}
async function transcribeAudio(opts) {
  return withFallback(opts.provider, ['openai', 'gemini'], (p, same) => transcribeAudioOnce({ ...opts, provider: p, model: same ? opts.model : '' }));
}

module.exports = { PROVIDERS, DEFAULT_MODELS, AiError, hasKey, keyStatus, runAgent, describeImage, transcribeAudio, usedToday, recordUsage, modelFor };
