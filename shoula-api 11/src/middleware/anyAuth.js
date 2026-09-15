const jwt = require('jsonwebtoken');

/** بتسمح بأي وحدة من الاثنين: تسجيل دخول لوحة التحكم (إيميل/كلمة سر) أو تسجيل دخول الكاشير (PIN) */
function requireAnyAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'مطلوب تسجيل دخول' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.staffId) {
      req.staff = payload;
    } else {
      req.admin = payload;
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'رمز الدخول غير صالح أو منتهي، سجّلي دخول من جديد' });
  }
}

module.exports = requireAnyAuth;
