const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ متغير DATABASE_URL مش موجود. انسخي .env.example باسم .env واملي رابط قاعدة البيانات.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // مطلوب لأغلب مزودي Postgres المجانيين (Neon/Render)
  max: 10, // أقصى عدد اتصالات مفتوحة بنفس الوقت — بدون حد، طلبات كتير متزامنة (زي حفظ ترتيب عدة أصناف) ممكن تفتح اتصالات أكتر من المسموح وتعلّق كل شي
  connectionTimeoutMillis: 8000, // لو ما قدر ياخد اتصال خلال ٨ ثواني، بيفشل بخطأ واضح بدل ما ينتظر للأبد ويجمّد السيرفر كامل
  idleTimeoutMillis: 30000, // بيسكّر الاتصالات الخاملة بعد ٣٠ ثانية، حتى تضل متوفرة لطلبات تانية
});

pool.on('error', (err) => {
  console.error('خطأ غير متوقع بقاعدة البيانات:', err);
});

module.exports = pool;
