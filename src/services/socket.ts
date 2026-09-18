import { io, type Socket } from 'socket.io-client';

// نفس نطاق السيرفر بالضبط، بس بدون /api بالآخر (Socket.IO بيتصل بجذر السيرفر مباشرة)
const SOCKET_URL = 'https://shoula-burger-api.onrender.com';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 2000,
    });
  }
  return socket;
}
