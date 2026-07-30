const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const categoriesRoutes = require('./routes/categories');
const productsRoutes = require('./routes/products');
const ordersRoutes = require('./routes/orders');
const couponsRoutes = require('./routes/coupons');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '1mb' })); // بيحمي من body ضخم/هجمات DoS بسيطة

// CORS: بس النطاقات المسموحة (موقع الطلب ولوحة التحكم) تقدر تتواصل مع الـ API
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('غير مسموح لهاد النطاق يوصل للـ API (CORS)'));
    }
  }
}));

// حماية بسيطة من هجمات القوة العمياء (brute force) على تسجيل الدخول
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'محاولات كتيرة، حاولي بعد شوي' }
});
app.use('/api/auth/login', loginLimiter);

// حد عام لكل الـ API حتى ما حدا يقدر يغرقه بطلبات
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'طلبات كتيرة بوقت قصير، حاولي بعد شوي' }
});
app.use('/api/', generalLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/coupons', couponsRoutes);

// أي مسار مش موجود
app.use((req, res) => {
  res.status(404).json({ error: 'المسار مش موجود' });
});

// معالج أخطاء مركزي — أي خطأ بأي route (حتى لو async) بيوصل لهون
app.use((err, req, res, next) => {
  console.error('❌ خطأ:', err.message);
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'هاي البيانات موجودة مسبقاً (تكرار غير مسموح)' });
  }
  res.status(500).json({ error: 'صار خطأ غير متوقع بالسيرفر' });
});

module.exports = app;
