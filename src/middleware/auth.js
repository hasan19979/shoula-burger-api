const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'مطلوب تسجيل دخول (لا يوجد رمز مصادقة)' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload; // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'رمز الدخول غير صالح أو منتهي، سجّلي دخول من جديد' });
  }
}

module.exports = requireAuth;
