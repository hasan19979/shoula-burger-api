const jwt = require('jsonwebtoken');
const sessions = require('../sessions');

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
    if (sessions.checkToken(payload) === 'replaced') {
      return res.status(401).json({ error: 'حسابك انفتح على جهاز تاني، فانسكّرت الجلسة هون', code: 'SESSION_REPLACED' });
    }
    req.staff = payload; // { staffId, role, name, sid }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'جلسة الكاشير منتهية، سجّلي دخول من جديد بالرمز السري', code: 'SESSION_EXPIRED' });
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
