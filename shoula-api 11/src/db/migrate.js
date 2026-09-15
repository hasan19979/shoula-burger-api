const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log('⏳ جاري تطبيق مخطط قاعدة البيانات...');
  try {
    await pool.query(sql);
    console.log('✅ تم إنشاء/تحديث كل الجداول بنجاح.');
  } catch (err) {
    console.error('❌ صار خطأ أثناء تطبيق المخطط:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
