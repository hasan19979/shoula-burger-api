// استرجاع من نسخة احتياطية — بتقرا ملف backup-....json وبتضيف أي صف ناقص بقاعدة البيانات.
// تشغيل: npm run restore -- backups/backup-2026-08-14T12-00-00-000Z.json
//
// آمن بالتصميم: ما بيمسح ولا يبدّل أي صف موجود أصلاً — بس بيضيف الصفوف الناقصة (ON CONFLICT DO NOTHING).
// يعني لو استرجعتي بالغلط، أسوأ اللي ممكن يصير إنه ما ينضاف شي، مش إنه ينمسح شي.

require('dotenv').config();
const fs = require('fs');
const pool = require('./pool');

// نفس ترتيب الجداول بالضبط متل schema.sql (حتى نحترم الروابط الأجنبية Foreign Keys)
const TABLE_ORDER = [
  'settings', 'categories', 'admins', 'customers', 'staff_users',
  'modifier_groups', 'modifier_options', 'inventory_items', 'restaurant_tables',
  'products', 'product_ingredients', 'product_modifier_groups', 'recipe_ingredients',
  'coupons', 'banners', 'cash_shifts',
  'orders', 'order_items', 'stock_movements'
];

async function restore(filePath) {
  if (!filePath) {
    console.error('❌ لازم تحددي مسار ملف النسخة الاحتياطية. مثال:');
    console.error('   npm run restore -- backups/backup-2026-08-14T12-00-00-000Z.json');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`❌ الملف مش موجود: ${filePath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`🔄 جاري الاسترجاع من: ${filePath}\n`);

  let totalInserted = 0;

  for (const table of TABLE_ORDER) {
    const rows = data[table];
    if (!rows || rows.length === 0) continue;

    const columns = Object.keys(rows[0]);
    let insertedCount = 0;

    for (const row of rows) {
      const values = columns.map((c) => row[c]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      try {
        const result = await pool.query(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
          values
        );
        insertedCount += result.rowCount;
      } catch (err) {
        console.log(`  ⚠️  صف بجدول ${table} ما انضاف: ${err.message}`);
      }
    }

    console.log(`  ✓ ${table}: ${insertedCount} صف جديد انضاف (من أصل ${rows.length} بالنسخة الاحتياطية)`);
    totalInserted += insertedCount;
  }

  console.log(`\n✅ خلص الاسترجاع — ${totalInserted} صف جديد انضاف إجمالاً.`);
  await pool.end();
}

const filePath = process.argv[2];
restore(filePath).catch((err) => {
  console.error('❌ صار خطأ أثناء الاسترجاع:', err.message);
  process.exit(1);
});
