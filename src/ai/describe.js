/**
 * أوصاف الأصناف بالذكاء الاصطناعي — وصف قصير بيفتح النفس، بيظهر بموقع الطلبات تحت اسم الصنف.
 * الموديل بيكتب من المعلومات يلي عنا بس (الاسم، التصنيف، المكونات، الأنواع) — ما بيخترع مكونات.
 */
const pool = require('../db/pool');
const ai = require('./providers');
const store = require('./store');

const STYLES = {
  local: 'باللهجة الفلسطينية الدارجة، دافية وقريبة (متل "طازة"، "عالفحم"، "بتذوب بالتم").',
  fusha: 'بالعربية الفصحى البسيطة، أنيقة وواضحة.',
};

function systemPrompt(style, emoji) {
  return `إنت كاتب منيو لمطعم. بتكتب وصف قصير بيفتح النفس لكل صنف، بيظهر بموقع الطلبات تحت اسم الصنف.
- ${STYLES[style] || STYLES.local}
- جملة وحدة أو جملتين قصار: بين 50 و 130 حرف.
- اذكر بس المكونات والمعلومات يلي معطاة. ما تخترع مكونات ولا طريقة طبخ مش مذكورة (إذا ما في مكونات، احكي عن الطعم والإحساس بشكل عام).
- بدون أسعار، بدون مبالغات متل "الأفضل بالعالم"، وبدون اسم الصنف ببداية الوصف.
- ${emoji ? 'مسموح إيموجي واحد بالآخر.' : 'بدون إيموجي.'}
- لو في وصف قديم، حسّنه بس ما تغيّر معلوماته.
رجّع JSON بس، بدون أي كلام تاني: [{"id": ..., "description": "..."}]`;
}

/** منقرأ الأصناف من قاعدة البيانات مع مكوناتها وأنواعها */
async function loadProducts({ ids, onlyEmpty }) {
  const where = [];
  const params = [];
  if (ids?.length) {
    params.push(ids.map(Number).filter(Boolean));
    where.push(`p.id = ANY($${params.length})`);
  }
  if (onlyEmpty) where.push(`COALESCE(TRIM(p.description), '') = ''`);
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.description, p.price, c.name AS category,
            COALESCE((SELECT json_agg(json_build_object('name', i.name, 'extra', NOT i.default_included) ORDER BY i.sort_order)
                        FROM product_ingredients i WHERE i.product_id = p.id), '[]') AS ingredients,
            COALESCE((SELECT json_agg(v.name ORDER BY v.sort_order) FROM product_variants v WHERE v.product_id = p.id), '[]') AS variants
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.sort_order, p.sort_order, p.id
      LIMIT 200`,
    params
  );
  return rows;
}

function toPromptItem(p) {
  const ings = (p.ingredients || []).filter((i) => i && i.name);
  return {
    id: p.id,
    name: p.name,
    category: p.category || '',
    ingredients: ings.filter((i) => !i.extra).map((i) => i.name),
    optional_extras: ings.filter((i) => i.extra).map((i) => i.name),
    variants: p.variants || [],
    current_description: p.description || '',
  };
}

function parseJsonArray(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function pickProvider() {
  const cfg = await store.getConfig();
  let p = cfg.chat.provider;
  let m = cfg.chat.model;
  if (!ai.hasKey(p)) {
    p = ['anthropic', 'openai', 'gemini'].find((x) => ai.hasKey(x));
    m = '';
  }
  if (!p) {
    const e = new Error('ما في مفتاح ذكاء اصطناعي على السيرفر');
    e.status = 400;
    throw e;
  }
  return { p, m };
}

/**
 * items: أصناف جاهزة (من شاشة التعديل قبل الحفظ) — أو ids/onlyEmpty من قاعدة البيانات.
 * بيرجّع اقتراحات بس — ما بيحفظ شي.
 */
async function suggest({ items, ids, onlyEmpty, style = 'local', emoji = false }) {
  const source = items?.length
    ? items.slice(0, 1).map((x, i) => ({
        id: x.id || `new-${i}`,
        name: String(x.name || '').slice(0, 80),
        category: String(x.category || '').slice(0, 60),
        ingredients: (x.ingredients || []).map((n) => ({ name: String(n).slice(0, 40) })),
        variants: (x.variants || []).map((n) => String(n).slice(0, 40)),
        description: String(x.description || '').slice(0, 300),
      }))
    : await loadProducts({ ids, onlyEmpty });
  if (!source.length) return [];
  const { p, m } = await pickProvider();
  const out = [];
  // دفعات صغيرة — أرخص من طلب لكل صنف، وما بتطول على الموديل
  for (let i = 0; i < source.length; i += 10) {
    const batch = source.slice(i, i + 10);
    const r = await ai.runAgent({
      provider: p, model: m, kind: 'chat', maxTokens: 1800, system: systemPrompt(style, emoji),
      history: [{ role: 'user', text: JSON.stringify(batch.map(toPromptItem)) }],
    });
    const parsed = parseJsonArray(r.text);
    const byId = new Map(parsed.map((x) => [String(x.id), String(x.description || '').trim()]));
    for (const prod of batch) {
      const d = (byId.get(String(prod.id)) || '').replace(/^["«]|["»]$/g, '').slice(0, 220);
      out.push({ id: prod.id, name: prod.name, category: prod.category || '', current: prod.description || '', description: d });
    }
  }
  return out;
}

async function apply(list) {
  let n = 0;
  for (const x of (list || []).slice(0, 200)) {
    const id = Number(x.id);
    const d = String(x.description || '').trim().slice(0, 500);
    if (!id || !d) continue;
    const r = await pool.query('UPDATE products SET description = $1, updated_at = now() WHERE id = $2', [d, id]);
    n += r.rowCount;
  }
  return n;
}

module.exports = { suggest, apply, loadProducts };
