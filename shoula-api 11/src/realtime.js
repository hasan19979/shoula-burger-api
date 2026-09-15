const { Server } = require('socket.io');

let io = null;

/** بتتصل مرة وحدة من server.js وقت بدء تشغيل السيرفر */
function initRealtime(httpServer) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 اتصال لحظي جديد (${socket.id})`);
    socket.on('disconnect', () => console.log(`🔌 انقطع اتصال (${socket.id})`));
  });

  return io;
}

/** بتستخدم من أي مسار (زي orders.js) لبث حدث لحظي لكل الشاشات المتصلة (المطبخ، الطلبات) */
function broadcast(event, payload) {
  if (io) io.emit(event, payload);
}

module.exports = { initRealtime, broadcast };
