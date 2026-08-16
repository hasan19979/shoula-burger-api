const jwt = require('jsonwebtoken');

/** مصادقة موظف الكاشير (PIN) — منفصلة عن مصادقة لوحة التحكم (إيميل/كلمة سر) */
function requireStaffAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'مطلوب تسجيل دخول بالكاشير (رمز PIN)' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.staffId) throw new Error('not a staff token');
    req.staff = payload; // { staffId, role, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'جلسة الكاشير منتهية، سجّلي دخول من جديد بالرمز السري' });
  }
}

/** بوّابة إضافية بعد requireStaffAuth — بتتأكد إن دور الموظف المسجّل فعلاً مسموح له بهاي العملية.
 * مثال: requireStaffRole('admin', 'manager') بترفض أي طلب من كاشير أو نادل أو مطبخ. */
function requireStaffRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.staff) return res.status(401).json({ error: 'مطلوب تسجيل دخول بالكاشير' });
    if (!allowedRoles.includes(req.staff.role)) {
      return res.status(403).json({ error: 'ما عندك صلاحية كافية لهاي العملية' });
    }
    next();
  };
}

module.exports = requireStaffAuth;
module.exports.requireStaffRole = requireStaffRole;
