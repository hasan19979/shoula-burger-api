/**
 * وصول الذكاء الاصطناعي لكل بيانات النظام — للقراءة بس.
 *
 * المحلل بيكتب استعلام SQL، والسيرفر بيشغّله على نسخة "نظيفة" من البيانات (schema اسمها ai_data):
 * بدون أسماء الزبائن وتلفوناتهم وعناوينهم، وبدون رموز الموظفين.
 * الحماية:
 *  - SELECT / WITH بس، استعلام واحد.
 *  - معاملة للقراءة فقط (READ ONLY) — حتى لو حاول يعدّل، قاعدة البيانات بترفض.
 *  - search_path = ai_data — ما بيشوف الجداول الأصلية، وأي إشارة لـ public. أو pg_ بتنرفض.
 *  - حد وقت (8 ثواني) وحد صفوف (200).
 */
const pool = require('../db/pool');

const MAX_ROWS = 200;
const MAX_CHARS = 20000;

const FORBIDDEN =
  /\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|prepare|deallocate|vacuum|analyze|lock|listen|notify|unlisten|refresh|reindex|cluster|comment|security|set_config|current_setting|dblink\w*|lo_\w+|pg_\w+|information_schema|public)\b|\bset\s+(local\s+|session\s+)?\w+\s*(=|to)\b/i;

function validate(sql) {
  let q = String(sql || '').trim();
  q = q.replace(/;\s*$/, '');
  if (!q) return { error: 'الاستعلام فاضي' };
  if (q.length > 6000) return { error: 'الاستعلام طويل كتير' };
  // تعليقات ممكن تخبّي إشي — منشيلها قبل الفحص
  const bare = q.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (bare.includes(';')) return { error: 'استعلام واحد بس (بدون ;)' };
  if (!/^\s*(select|with)\b/i.test(bare)) return { error: 'مسموح SELECT أو WITH بس' };
  // منفحص الكلمات برا النصوص بين علامات '...'
  const noStrings = bare.replace(/'(?:[^']|'')*'/g, "''");
  const bad = FORBIDDEN.exec(noStrings);
  if (bad) return { error: `كلمة مش مسموحة: ${bad[0]}` };
  return { sql: q };
}

// التواريخ بترجع من pg كـ Date بتوقيت السيرفر — منحوّلها لنص مقروء (الـ views أصلاً بتوقيت المطعم)
const pad = (x) => String(x).padStart(2, '0');
function fmtDate(d) {
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (!d.getHours() && !d.getMinutes() && !d.getSeconds() && !d.getMilliseconds()) return day;
  return `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const clean = (row) => {
  const o = {};
  for (const [k, v] of Object.entries(row)) o[k] = v instanceof Date ? fmtDate(v) : v;
  return o;
};

async function runQuery(sql) {
  const v = validate(sql);
  if (v.error) return { error: v.error };
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '8s'");
    await client.query('SET LOCAL search_path = ai_data');
    const r = await client.query(`SELECT * FROM (${v.sql}) AS _q LIMIT ${MAX_ROWS + 1}`);
    await client.query('ROLLBACK');
    const rows = r.rows.slice(0, MAX_ROWS).map(clean);
    let json = JSON.stringify(rows);
    let truncated = r.rows.length > MAX_ROWS;
    if (json.length > MAX_CHARS) {
      // منقص الصفوف لحد ما تزبط بالحجم
      let n = rows.length;
      while (n > 1 && json.length > MAX_CHARS) {
        n = Math.floor(n * 0.7);
        json = JSON.stringify(rows.slice(0, n));
      }
      truncated = true;
    }
    return { rows: JSON.parse(json), rowCount: r.rows.length > MAX_ROWS ? `${MAX_ROWS}+` : r.rows.length, truncated };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return { error: `خطأ بالاستعلام: ${String(err.message).slice(0, 300)}` };
  } finally {
    client.release();
  }
}

/** شرح البيانات للموديل — بينحط بتعليمات المحلل */
const SCHEMA_DOC = `# البيانات المتاحة (PostgreSQL، schema اسمها ai_data — اكتب أسماء الجداول بدون بادئة)
كل الأوقات بتوقيت المطعم (local_time). business_day = يوم العمل (بيخلص مع سكّرة المطعم، مش 12 بالليل).
المبالغ بالشيكل (₪).

- orders: id, order_no, business_day, local_time, order_type (dine-in|takeaway|delivery|pos), status (pending|accepted|preparing|ready|delivered|cancelled),
  payment_method (cash|card), source (online=الموقع | pos=الكاشير | whatsapp_ai=مساعد الواتساب), subtotal, discount, delivery_fee, total, amount_paid,
  coupon_code, cashier_name (مين عمل الطلب), table_number, customer_id, points_earned, points_redeemed,
  cancelled_by, cancelled_local_time, cancel_reason, edited_by, edited_local_time (تعديل بعد الطباعة), kitchen_status, eta_minutes,
  awaiting_wa (طلب موقع لسا ما تأكّد بالواتساب — استثنيه من المبيعات),
  payment_method = 'pay-later' يعني لسا ما انقبض؛ paid_local_time, paid_by = وقت ومين قبض طلب "دفع لاحقاً"؛ money_day = يوم دخول المصاري
  ⚠ المبيعات الحقيقية: status <> 'cancelled' AND awaiting_wa = false
- order_items: order_id, product_id, product_name, quantity, unit_price, line_total, variant_name, removed_ingredients (JSON), added_ingredients (JSON),
  price_changed_by_cashier (الكاشير غيّر السعر يدوياً), original_unit_price
- products: id, category_id, name, description, price, cost (تكلفة)، in_stock, is_featured, is_popular
- categories: id, name • product_variants: id, product_id, name, price_delta, is_default • product_ingredients: product_id, name, price, default_included
- customers: id, loyalty_points, created_local_time (بدون أسماء أو أرقام)
- coupons: code, discount_type, discount_value, min_order, max_uses, used_count, expires_at, active
- staff: id, name, role, active, hourly_rate • time_entries: staff_id, staff_name, role, clock_in_local, clock_out_local, hours
- inventory_items: id, name, unit, quantity, min_threshold, cost_per_unit • recipe_ingredients: product_id, inventory_item_id, quantity (لكل وحدة مبيعة)
- stock_movements: inventory_item_id, supplier_id, type (purchase|sale-deduction|waste|adjustment), quantity, unit_cost, note, local_time, business_day
- suppliers: id, name
- cash_withdrawals: amount, reason, staff_name, recipient_type, recipient_name, local_time, business_day
- cash_register_audits: audit_date, opening_balance, orders_total, withdrawals_total, expected_amount, actual_amount, difference, staff_name
- restaurant_tables: number, seats, status • whatsapp_conversations: id, customer_id, ai_enabled, needs_human, created_local_time
- daily_reports: day, sent_at, text (تقارير يومية سابقة)

دوال مساعدة: business_day(timestamptz)، cutoff_minutes().
حدود: SELECT/WITH بس، استعلام واحد، 200 صف بالكتير. استعمل GROUP BY وتجميع بدل ما تجيب صفوف خام.`;

const QUERY_TOOL = {
  name: 'query_data',
  description: 'شغّل استعلام SQL (SELECT بس) على بيانات المطعم وارجع النتيجة. استعمله لكل رقم بدك تحكي عنه — لا تخمّن.',
  parameters: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'استعلام PostgreSQL واحد يبلش بـ SELECT أو WITH' },
      purpose: { type: 'string', description: 'شو بدك تعرف من هالاستعلام (جملة قصيرة)' },
    },
    required: ['sql'],
  },
};

module.exports = { runQuery, validate, SCHEMA_DOC, QUERY_TOOL };
