const app = require('./app');

if (!process.env.JWT_SECRET) {
  console.error('❌ متغير JWT_SECRET مش موجود بملف .env — لازم تحطي نص سري طويل حتى يشتغل تسجيل الدخول.');
  process.exit(1);
}

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على البورت ${PORT}`);
});
