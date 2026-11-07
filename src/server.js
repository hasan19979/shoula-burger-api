const http = require('http');
const app = require('./app');
const { initRealtime } = require('./realtime');
const autoMigrate = require('./db/autoMigrate');

if (!process.env.JWT_SECRET) {
  console.error('❌ متغير JWT_SECRET مش موجود بملف .env — لازم تحطي نص سري طويل حتى يشتغل تسجيل الدخول.');
  process.exit(1);
}

const PORT = process.env.PORT || 4000;

// بنستخدم http.createServer بدل app.listen العادي حتى نقدر نلصق Socket.IO على نفس البورت
// (بث لحظي لشاشة المطبخ والطلبات — بدون ما نحتاج بورت أو سيرفر منفصل)
const server = http.createServer(app);
initRealtime(server);

// منحدّث قاعدة البيانات أول (أعمدة/جداول جديدة) وبعدين منشغّل السيرفر —
// لو التحديث فشل منكمّل نشغّل، حتى ما يوقف الموقع كله بسبب عمود ناقص
autoMigrate()
  .catch((err) => console.error('⚠️ التحديث التلقائي لقاعدة البيانات فشل:', err.message))
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`🚀 السيرفر شغال على البورت ${PORT} (مع اتصال لحظي Socket.IO)`);
    });
  });
