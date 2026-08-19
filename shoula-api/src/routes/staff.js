const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAnyAuth = require('../middleware/anyAuth');

const router = express.Router();

// بوّابة إضافية بعد requireAnyAuth: لو الداخل موظف كاشير (مو حساب لوحة التحكم)، لازم دوره admin أو manager
function requireManagementLevel(req, res, next) {
  if (req.staff && !['admin', 'manager'].includes(req.staff.role)) {
    return res.status(403).json({ error: 'إدارة الموظفين محصورة بالمدير/المدير العام' });
  }
  next();
}

// POST /api/staff/login — عام: تسجيل دخول موظف الكاشير برمز PIN (4 أرقام)، بيرجع رمز دخول (JWT) قصير الأمد
router.post('/login', asyncHandler(async (req, res) => {
  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ error: 'الرمز السري مطلوب' });

  const { rows } = await pool.query('SELECT * FROM staff_users WHERE active = true');
  for (const staff of rows) {
    if (await bcrypt.compare(String(pin), staff.pin_hash)) {
      const token = jwt.sign(
        { staffId: staff.id, role: staff.role, name: staff.name },
        process.env.JWT_SECRET,
        { expiresIn: '12h' } // شفت عمل عادي — مو 7 أيام زي حساب المالك، بأمان أكتر لجهاز كاشير مشترك
      );
      return res.json({ token, staff: { id: staff.id, name: staff.name, role: staff.role } });
    }
  }
  res.status(401).json({ error: 'رمز غير صحيح' });
}));

// GET /api/staff — محمي (لوحة التحكم بس): قائمة الموظفين، بدون كشف الـ PIN المشفّر
router.get('/', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, role, active, hourly_rate, created_at FROM staff_users ORDER BY created_at DESC');
  res.json(rows);
}));

// POST /api/staff — محمي: إضافة موظف جديد بـ PIN
router.post('/', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const { name, role, pin, hourlyRate } = req.body || {};
  const validRoles = ['admin', 'manager', 'cashier', 'kitchen', 'waiter'];
  if (!name || !validRoles.includes(role) || !pin || String(pin).length !== 4) {
    return res.status(400).json({ error: 'الاسم والدور والرمز (4 أرقام) مطلوبين' });
  }
  const pinHash = await bcrypt.hash(String(pin), 10);
  const result = await pool.query(
    'INSERT INTO staff_users (name, role, pin_hash, hourly_rate) VALUES ($1,$2,$3,$4) RETURNING id, name, role, active, hourly_rate, created_at',
    [name, role, pinHash, hourlyRate || null]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/staff/:id — محمي: تعديل اسم/دور/تفعيل، وتغيير PIN اختياري
router.put('/:id', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  const { name, role, active, pin, hourlyRate } = req.body || {};

  // مديرة شفت (manager) ما بتقدر تعدّل حساب مدير عام (admin) — حماية من تجاوز صلاحيات
  if (req.staff && req.staff.role === 'manager') {
    const target = await pool.query('SELECT role FROM staff_users WHERE id = $1', [req.params.id]);
    if (target.rows[0]?.role === 'admin' || role === 'admin') {
      return res.status(403).json({ error: 'بس المدير العام يقدر يعدّل حسابات المدراء العامين' });
    }
  }

  const sets = [];
  const params = [];
  if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`); }
  if (role !== undefined) { params.push(role); sets.push(`role = $${params.length}`); }
  if (active !== undefined) { params.push(active); sets.push(`active = $${params.length}`); }
  if (hourlyRate !== undefined) { params.push(hourlyRate || null); sets.push(`hourly_rate = $${params.length}`); }
  if (pin) { params.push(await bcrypt.hash(String(pin), 10)); sets.push(`pin_hash = $${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'ما في شي للتحديث' });

  params.push(req.params.id);
  const result = await pool.query(
    `UPDATE staff_users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, name, role, active, hourly_rate, created_at`,
    params
  );
  if (!result.rows.length) return res.status(404).json({ error: 'الموظف مش موجود' });
  res.json(result.rows[0]);
}));

// DELETE /api/staff/:id — محمي
router.delete('/:id', requireAnyAuth, requireManagementLevel, asyncHandler(async (req, res) => {
  if (req.staff && req.staff.role === 'manager') {
    const target = await pool.query('SELECT role FROM staff_users WHERE id = $1', [req.params.id]);
    if (target.rows[0]?.role === 'admin') {
      return res.status(403).json({ error: 'بس المدير العام يقدر يحذف حساب مدير عام' });
    }
  }
  const result = await pool.query('DELETE FROM staff_users WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'الموظف مش موجود' });
  res.json({ success: true });
}));

module.exports = router;
