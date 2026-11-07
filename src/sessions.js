const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * جلسات الموظفين المفتوحة — بذاكرة السيرفر بس (ولا شي بقاعدة البيانات، فما في أي ضغط على Neon).
 * السيرفر بيعرف إنه الجهاز لسا شغال من الاتصال اللحظي (Socket.IO) يلي موجود أصلاً بالبرنامج:
 *  - طول ما الجهاز متصل → الجلسة مفتوحة، وأي دخول على نفس الحساب من جهاز تاني بينرفض
 *  - الجهاز سكّر/انقطعت الكهربا/النت → الاتصال بينقطع، وبعد مهلة دقيقة الجلسة بتعتبر مسكّرة
 * لو السيرفر عمل إعادة تشغيل، الذاكرة بتنمسح، وكل جهاز بيرجع يسجّل جلسته لحاله أول ما يتصل.
 */
const GRACE_MS = Number(process.env.SESSION_GRACE_MS) || 60 * 1000; // مهلة بعد انقطاع الاتصال (أو بعد الدخول لحد ما يتصل الجهاز)
const TOKEN_TTL = '12h';

/** staffId → { sid, deviceId, deviceName, name, role, createdAt, sockets:Set, lastSeen } */
const sessions = new Map();
/** جلسات انسكّرت (خروج، مدير سكّرها، حدا دخل مكانها) — رموزها ما بتنقبل حتى لو لسا ما خلص وقتها */
const revoked = new Set();
function revoke(sid) {
  if (!sid) return;
  revoked.add(sid);
  if (revoked.size > 5000) revoked.delete(revoked.values().next().value);
}
let io = null;

function attachIo(server) {
  io = server;
}

function isActive(s) {
  if (!s) return false;
  if (s.sockets.size > 0) return true;
  return Date.now() - s.lastSeen < GRACE_MS;
}

function signToken(staff, sid, deviceId) {
  return jwt.sign(
    { staffId: staff.id, role: staff.role, name: staff.name, sid, did: deviceId || null },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/** بيبعت للجهاز القديم يطلع لشاشة الرمز */
function kick(s, reason) {
  if (!io || !s) return;
  for (const socketId of s.sockets) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock) {
      sock.emit('force-logout', { reason });
      sock.data.staffId = null;
    }
  }
  s.sockets.clear();
}

/**
 * محاولة فتح جلسة. بيرجّع { ok:true, token } أو { ok:false, conflict:{ deviceName, since } }.
 * نفس الجهاز (deviceId) دايماً بيقدر يرجع يدخل — مثلاً سكّر البرنامج وفتحه فوراً.
 */
function openSession(staff, { deviceId, deviceName, force }) {
  const existing = sessions.get(staff.id);
  if (existing && isActive(existing) && existing.deviceId !== deviceId && !force) {
    return { ok: false, conflict: { deviceName: existing.deviceName || 'جهاز تاني', since: existing.createdAt } };
  }
  // نفس الجهاز رجع دخل (أو جدد جلسته): منكمّل على نفس الاتصال بدون ما نطلّعه
  const sameDevice = existing && deviceId && existing.deviceId === deviceId;
  if (existing) {
    if (!sameDevice) kick(existing, 'replaced');
    revoke(existing.sid);
  }

  const sid = crypto.randomBytes(9).toString('base64url');
  sessions.set(staff.id, {
    sid, deviceId: deviceId || null, deviceName: deviceName || null,
    name: staff.name, role: staff.role,
    createdAt: sameDevice ? existing.createdAt : new Date().toISOString(),
    sockets: sameDevice ? existing.sockets : new Set(), lastSeen: Date.now(),
  });
  if (sameDevice && io) for (const id of existing.sockets) { const sk = io.sockets.sockets.get(id); if (sk) sk.data.sid = sid; }
  return { ok: true, token: signToken(staff, sid, deviceId) };
}

/**
 * هل رمز الدخول هاد لسا صالح للجلسة الحالية؟
 *  - 'ok'        → صالح
 *  - 'replaced'  → في حدا دخل على نفس الحساب من جهاز تاني بعده
 * رمز بدون sid (نسخة قديمة من البرنامج) أو ما في جلسة بالذاكرة (السيرفر عمل إعادة تشغيل) → منقبله ومنرجّع نسجّله
 */
function checkToken(payload) {
  if (!payload?.sid) return 'ok';
  if (revoked.has(payload.sid)) return 'replaced';
  const s = sessions.get(payload.staffId);
  if (!s) {
    restore(payload);
    return 'ok';
  }
  if (s.sid === payload.sid) return 'ok';
  // جلسة تانية لنفس الحساب: لو الجلسة التانية مش شغالة فعلاً (ما في اتصال ومرّت المهلة) منرجّع هاد الجهاز
  if (!isActive(s)) {
    revoke(s.sid);
    restore(payload);
    return 'ok';
  }
  return 'replaced';
}

function restore(payload) {
  sessions.set(payload.staffId, {
    sid: payload.sid, deviceId: payload.did || null, deviceName: null,
    name: payload.name, role: payload.role,
    createdAt: new Date().toISOString(), sockets: new Set(), lastSeen: Date.now(),
  });
}

/** الجهاز اتصل لحظياً وبلّغ عن رمز دخوله — من هون منعرف إنه لسا شغال */
function bindSocket(socket, token, deviceName) {
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    socket.emit('session-invalid', { reason: 'expired' });
    return;
  }
  if (!payload.staffId || !payload.sid) return;
  const state = checkToken(payload);
  if (state === 'replaced') {
    socket.emit('force-logout', { reason: 'replaced' });
    return;
  }
  const s = sessions.get(payload.staffId);
  s.sockets.add(socket.id);
  s.lastSeen = Date.now();
  if (deviceName && !s.deviceName) s.deviceName = String(deviceName).slice(0, 60);
  socket.data.staffId = payload.staffId;
  socket.data.sid = payload.sid;
}

function unbindSocket(socket) {
  const staffId = socket.data.staffId;
  if (!staffId) return;
  const s = sessions.get(staffId);
  if (s && s.sid === socket.data.sid) {
    s.sockets.delete(socket.id);
    s.lastSeen = Date.now(); // من هون بتبلّش مهلة الدقيقة
  }
}

/** تسجيل خروج عادي من الجهاز */
function closeSession(payload) {
  const s = sessions.get(payload.staffId);
  if (s && s.sid === payload.sid) sessions.delete(payload.staffId);
  revoke(payload.sid);
}

/** المدير سكّر جلسة موظف من الإعدادات */
function endSession(staffId) {
  const s = sessions.get(Number(staffId));
  if (!s) return false;
  kick(s, 'ended');
  revoke(s.sid);
  sessions.delete(Number(staffId));
  return true;
}

function listSessions() {
  const out = [];
  for (const [staffId, s] of sessions) {
    if (!isActive(s)) continue;
    out.push({ staffId, name: s.name, role: s.role, deviceName: s.deviceName, since: s.createdAt, online: s.sockets.size > 0 });
  }
  return out;
}

module.exports = { attachIo, openSession, checkToken, bindSocket, unbindSocket, closeSession, endSession, listSessions, signToken };
