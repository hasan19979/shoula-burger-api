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
  chat: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash' },
  vision: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash' },
  audio: { openai: 'whisper-1', gemini: 'gemini-2.5-flash' },
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

async function http(url, { headers = {}, body, form, timeout = 60000 } = {}) {
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
      if (res.status === 429) throw new AiError('الحد المسموح من الشركة خلص أو الرصيد خلص — حاولي بعد شوي', 429);
      throw new AiError(`خطأ من شركة الذكاء الاصطناعي: ${String(msg).slice(0, 200)}`, 502);
    }
    return data;
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err.name === 'AbortError') throw new AiError('شركة الذكاء الاصطناعي ما ردت بالوقت', 504);
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
async function runAgent({ provider, model, system, history, tools = [], execTool, maxSteps = 5, maxTokens = 800, kind = 'chat' }) {
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
      const data = await http(`${PROVIDERS.openai.base()}/v1/chat/completions`, {
        headers: { Authorization: `Bearer ${key}` },
        body: {
          model: m, messages, max_tokens: maxTokens,
          ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
        },
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
    const data = await http(`${PROVIDERS.gemini.base()}/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`, {
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
        ...(tools.length ? { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }] } : {}),
      },
    });
    await recordUsage('gemini', kind, data.usageMetadata?.promptTokenCount, data.usageMetadata?.candidatesTokenCount);
    const content = data.candidates?.[0]?.content || { role: 'model', parts: [] };
    const parts = content.parts || [];
    const fcs = parts.filter((p) => p.functionCall);
    if (!fcs.length || !execTool) return { text: parts.filter((p) => p.text).map((p) => p.text).join('\n').trim(), calls };
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
async function describeImage({ provider, model, base64, mime = 'image/jpeg', prompt }) {
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
    const d = await http(`${PROVIDERS.openai.base()}/v1/chat/completions`, {
      headers: { Authorization: `Bearer ${key}` },
      body: { model: m, max_tokens: 300, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }, { type: 'text', text: p }] }] },
    });
    await recordUsage('openai', 'vision', d.usage?.prompt_tokens, d.usage?.completion_tokens);
    return String(d.choices?.[0]?.message?.content || '').trim();
  }
  const d = await http(`${PROVIDERS.gemini.base()}/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`, {
    body: { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: p }] }], generationConfig: { maxOutputTokens: 300 } },
  });
  await recordUsage('gemini', 'vision', d.usageMetadata?.promptTokenCount, d.usageMetadata?.candidatesTokenCount);
  return (d.candidates?.[0]?.content?.parts || []).filter((x) => x.text).map((x) => x.text).join('\n').trim();
}

/** تحويل فويس لكتابة — Claude ما بيسمع صوت، فبس OpenAI أو Gemini */
async function transcribeAudio({ provider, model, base64, mime = 'audio/ogg' }) {
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
  const d = await http(`${PROVIDERS.gemini.base()}/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`, {
    body: {
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime.split(';')[0], data: base64 } }, { text: 'اكتب حرفياً شو انقال بهاد التسجيل، بنفس اللهجة، بدون أي إضافة.' }] }],
      generationConfig: { maxOutputTokens: 500 },
    },
  });
  await recordUsage('gemini', 'audio', d.usageMetadata?.promptTokenCount, d.usageMetadata?.candidatesTokenCount);
  return (d.candidates?.[0]?.content?.parts || []).filter((x) => x.text).map((x) => x.text).join(' ').trim();
}

module.exports = { PROVIDERS, DEFAULT_MODELS, AiError, hasKey, keyStatus, runAgent, describeImage, transcribeAudio, usedToday, recordUsage, modelFor };
