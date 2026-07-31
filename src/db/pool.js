const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ متغير DATABASE_URL مش موجود. انسخي .env.example باسم .env واملي رابط قاعدة البيانات.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // مطلوب لأغلب مزودي Postgres المجانيين (Neon/Render)
});

pool.on('error', (err) => {
  console.error('خطأ غير متوقع بقاعدة البيانات:', err);
});

module.exports = pool;
