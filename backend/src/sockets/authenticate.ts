import type { Socket } from 'socket.io';
import { sessionService } from '../services/session.service.js';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../types/socket-events.js';
import { logger } from '../utils/logger.js';

type EchoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Handshake guard, the socket equivalent of `requireSession`.
 *
 * Validating here rather than in a `join` event means a connection either
 * arrives already belonging to a real session or never opens at all. Handlers
 * can then treat `socket.data.sessionId` as guaranteed instead of checking it
 * on every message.
 *
 * The client connects with:
 *   io(url, { auth: { sessionId } })
 */
export async function authenticateSocket(
  socket: EchoSocket,
  next: (error?: Error) => void
): Promise<void> {
  const auth = socket.handshake.auth as { sessionId?: unknown };
  const sessionId = typeof auth.sessionId === 'string' ? auth.sessionId : null;

  if (!sessionId) {
    next(new Error('A sessionId is required to connect'));
    return;
  }

  try {
    const { session, player, conversation } = await sessionService.authorize(sessionId);

    socket.data.sessionId = session.id;
    socket.data.playerId = player.id;
    socket.data.conversationId = conversation.id;
    socket.data.playerName = player.displayName;

    next();
  } catch (error) {
    logger.warn(`socket handshake rejected: ${(error as Error).message}`);
    next(error instanceof Error ? error : new Error('Session rejected'));
  }
}
