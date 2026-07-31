const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'الإيميل وكلمة السر مطلوبين' });
  }

  const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email.trim().toLowerCase()]);
  const admin = result.rows[0];
  if (!admin) {
    return res.status(401).json({ error: 'الإيميل أو كلمة السر غلط' });
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'الإيميل أو كلمة السر غلط' });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
}));

// GET /api/auth/me  — للتأكد إن الرمز لسا صالح وجلب بيانات المستخدم الحالي
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ admin: req.admin });
}));

// POST /api/auth/change-password
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'كلمة السر الحالية والجديدة مطلوبين' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'كلمة السر الجديدة لازم تكون 8 أحرف على الأقل' });
  }

  const result = await pool.query('SELECT * FROM admins WHERE id = $1', [req.admin.id]);
  const admin = result.rows[0];
  const valid = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'كلمة السر الحالية غلط' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [newHash, req.admin.id]);
  res.json({ success: true });
}));

module.exports = router;
