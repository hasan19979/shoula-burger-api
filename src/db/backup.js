// نسخة احتياطية كاملة لقاعدة البيانات — بتصدّر بيانات كل جدول لملف JSON واحد بالتاريخ والوقت.
// تشغيل: npm run backup
// الملف بيتحفظ بفولدر backups/ (متجاهل من Git تلقائياً — ما بيترفع لـ GitHub، آمن)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

// كل الجداول المهمة بالمشروع — لو ضفتي جدول جديد بالمستقبل، ضيفي اسمه هون كمان
const TABLES = [
  'settings', 'categories', 'products', 'product_ingredients',
  'coupons', 'banners', 'admins', 'customers', 'orders', 'order_items',
  'cash_shifts', 'staff_users', 'modifier_groups', 'modifier_options',
  'product_modifier_groups', 'inventory_items', 'recipe_ingredients',
  'stock_movements', 'restaurant_tables'
];

async function backup() {
  console.log('🔄 جاري أخذ نسخة احتياطية...\n');
  const result = {};
  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table}`);
      result[table] = rows;
      totalRows += rows.length;
      console.log(`  ✓ ${table}: ${rows.length} صف`);
    } catch (err) {
      console.log(`  ⚠️  ${table}: ما قدرنا نجيبه (${err.message}) — ممكن الجدول مش موجود بعد`);
    }
  }

  const backupDir = path.join(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(backupDir, `backup-${timestamp}.json`);
  fs.writeFileSync(filename, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`\n✅ تم! النسخة الاحتياطية (${totalRows} صف إجمالي) محفوظة بـ:`);
  console.log(`   ${filename}`);
  console.log('\n⚠️  مهم: انسخي هاد الملف لمكان آمن (Google Drive، إيميلك، USB) — ما تعتمدي إنه بس على هاد الجهاز.');

  await pool.end();
}

backup().catch((err) => {
  console.error('❌ صار خطأ أثناء أخذ النسخة الاحتياطية:', err.message);
  process.exit(1);
});
