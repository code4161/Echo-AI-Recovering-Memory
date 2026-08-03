import type { Server, Socket } from 'socket.io';
import { chatService } from '../services/chat.service.js';
import { sessionService } from '../services/session.service.js';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../types/socket-events.js';
import { sessionRoom } from '../types/socket-events.js';
import { isAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { wait } from '../utils/time.js';

type EchoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type EchoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Realtime transport for the conversation.
 *
 * This layer owns rooms, pacing and error reporting. It contains no game
 * rules — every decision comes from chatService, which the REST controller
 * also calls.
 */
export function registerChatHandlers(io: EchoServer, socket: EchoSocket): void {
  const { sessionId, playerId, conversationId, playerName } = socket.data;
  const room = sessionRoom(sessionId);

  // Guards against one client flooding the provider with overlapping turns.
  let answering = false;

  const fail = (error: unknown, fallback: string) => {
    if (isAppError(error)) {
      socket.emit('error', { code: error.code, message: error.message });
      if (error.status === 410) {
        socket.emit('session:expired', { reason: error.message });
        socket.disconnect(true);
      }
      return;
    }

    logger.warn(fallback, error);
    socket.emit('error', { code: 'internal_error', message: fallback });
  };

  void socket.join(room);

  // The client gets the whole world state as soon as it connects, so it never
  // has to ask for it.
  void sessionService
    .snapshot(sessionId)
    .then((snapshot) => socket.emit('session:ready', snapshot))
    .catch((error: unknown) => fail(error, 'Could not load your session'));

  socket.on('session:sync', () => {
    void sessionService
      .snapshot(sessionId)
      .then((snapshot) => socket.emit('session:ready', snapshot))
      .catch((error: unknown) => fail(error, 'Could not refresh your session'));
  });

  socket.on('chat:send', async ({ content }) => {
    if (answering) {
      socket.emit('error', { code: 'busy', message: 'Echo is still answering' });
      return;
    }

    answering = true;

    try {
      const result = await chatService.exchange({
        sessionId,
        playerId,
        conversationId,
        playerName,
        content,
      });

      // The player's own line echoes back immediately, so the transcript is
      // server-ordered rather than optimistically guessed by the client.
      io.to(room).emit('chat:message', result.playerMessage);

      io.to(room).emit('echo:typing', { isTyping: true });
      await wait(result.thinkingMs);
      io.to(room).emit('echo:typing', { isTyping: false });

      io.to(room).emit('chat:message', result.echoMessage);
      io.to(room).emit('echo:state', result.echo);

      if (result.restoredFragment) {
        io.to(room).emit('memory:restored', result.restoredFragment);
      }

      io.to(room).emit('progress:updated', result.progress);

      for (const milestone of result.milestones) {
        io.to(room).emit('milestone:achieved', milestone);
      }
    } catch (error) {
      io.to(room).emit('echo:typing', { isTyping: false });
      fail(error, 'Echo could not answer just now');
    } finally {
      answering = false;
    }
  });

  // Relayed to other tabs on the same session, never back to the sender.
  socket.on('chat:typing', ({ isTyping }) => {
    socket.to(room).emit('echo:typing', { isTyping });
  });
}
