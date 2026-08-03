import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../types/socket-events.js';
import { logger } from '../utils/logger.js';
import { authenticateSocket } from './authenticate.js';
import { registerChatHandlers } from './chat.handler.js';

export type EchoIoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Attaches Socket.io to the HTTP server, guards the handshake, and registers
 * every handler group.
 *
 * Scaling past one instance means adding a Redis adapter here so rooms span
 * processes; nothing in the handlers would change.
 */
export function createSocketServer(httpServer: HttpServer): EchoIoServer {
  const io: EchoIoServer = new Server(httpServer, {
    cors: { origin: env.clientOrigin, credentials: true },
    // Slightly above the client's default heartbeat, so a brief network blip
    // does not end a conversation.
    pingTimeout: 25_000,
  });

  io.use((socket, next) => {
    void authenticateSocket(socket, next);
  });

  io.on('connection', (socket) => {
    logger.info(`socket connected ${socket.id} session=${socket.data.sessionId}`);

    registerChatHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info(`socket disconnected ${socket.id} (${reason})`);
    });
  });

  return io;
}
