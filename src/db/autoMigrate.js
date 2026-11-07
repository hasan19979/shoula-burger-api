const fs = require('fs');
const path = require('path');
const pool = require('./pool');

/**
 * تحديث قاعدة البيانات تلقائياً عند تشغيل السيرفر.
 * ملف schema.sql كله "IF NOT EXISTS"، فتشغيله كل مرة آمن وما بيمسح ولا بيغيّر بيانات —
 * بس بيضيف الأعمدة والجداول الجديدة. هيك أي تحديث بينرفع على Render بيشتغل بدون npm run migrate.
 */
async function autoMigrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    // قفل حتى لو اشتغلت نسختين من السيرفر بنفس الوقت، وحدة بس بتحدّث
    await client.query('SELECT pg_advisory_lock(728391)');
    await client.query(sql);
    console.log('✅ قاعدة البيانات محدّثة (تحديث تلقائي)');
  } finally {
    await client.query('SELECT pg_advisory_unlock(728391)').catch(() => {});
    client.release();
  }
}

module.exports = autoMigrate;
