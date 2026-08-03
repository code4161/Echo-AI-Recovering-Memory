import { config } from '@/config';
import { ApiError, api } from '@/lib/api';
import type {
  EchoPersonality,
  GameProgress,
  GameSnapshot,
  MemoryFragment,
  Message,
  PlayerMilestone,
} from '@/types/domain';
import { io, type Socket } from 'socket.io-client';
import type { GameConnection, GameEvents, OpenResult, StartIntent } from './types';

interface ServerToClientEvents {
  'session:ready': (snapshot: GameSnapshot) => void;
  'chat:message': (message: Message) => void;
  'echo:typing': (payload: { isTyping: boolean }) => void;
  'echo:state': (state: EchoPersonality) => void;
  'memory:restored': (fragment: MemoryFragment) => void;
  'progress:updated': (progress: GameProgress) => void;
  'milestone:achieved': (milestone: PlayerMilestone) => void;
  'session:expired': (payload: { reason: string }) => void;
  error: (payload: { code: string; message: string }) => void;
}

interface ClientToServerEvents {
  'session:sync': () => void;
  'chat:send': (payload: { content: string }) => void;
  'chat:typing': (payload: { isTyping: boolean }) => void;
}

type EchoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A session id is only useful if the server still recognises it. */
async function bootstrap(intent: StartIntent): Promise<GameSnapshot> {
  if (intent.type === 'new') {
    return api.createPlayer(intent.displayName);
  }

  if (intent.identity.mode !== 'server') {
    throw new Error('Cannot resume an offline save over the network');
  }

  const { playerId, sessionId } = intent.identity;

  try {
    return await api.getSession(sessionId);
  } catch (error) {
    // 410 gone or 404: the session expired or was swept. The player still
    // exists, so open a fresh session rather than making them start over.
    if (error instanceof ApiError && (error.status === 410 || error.status === 404)) {
      return api.startSession(playerId);
    }
    throw error;
  }
}

/**
 * The real connection: REST to obtain a session, then Socket.io for the
 * conversation. The server is authoritative — every message, trust change and
 * memory unlock arrives as an event and is simply rendered.
 */
export async function openSocketConnection(
  intent: StartIntent,
  events: GameEvents
): Promise<OpenResult> {
  events.mode('server');
  events.status('connecting');

  const snapshot = await bootstrap(intent);

  let sessionId = snapshot.session.id;
  const playerId = snapshot.player.id;

  // Paint immediately from the REST snapshot rather than waiting for the
  // socket's own session:ready.
  events.snapshot(snapshot);
  events.identity({ mode: 'server', playerId, sessionId });

  const socket: EchoSocket = io(config.socketUrl, {
    auth: { sessionId },
    // WebSocket first for latency, with polling kept as a fallback for
    // networks that block the upgrade.
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
  });

  let closed = false;
  let renewing = false;

  /**
   * The session died while we were connected. Ask for a new one and reconnect
   * with it, so an idle player is not dumped back to the title screen.
   */
  const renewSession = async () => {
    if (renewing || closed) return;
    renewing = true;

    try {
      const fresh = await api.startSession(playerId);
      sessionId = fresh.session.id;

      events.snapshot(fresh);
      events.identity({ mode: 'server', playerId, sessionId });

      socket.auth = { sessionId };
      socket.connect();
    } catch {
      events.status('error', 'Your session ended and could not be renewed.');
    } finally {
      renewing = false;
    }
  };

  socket.on('connect', () => events.status('ready'));

  socket.on('disconnect', (reason) => {
    if (closed) return;
    // An explicit server-side disconnect will not auto-retry.
    events.status(reason === 'io server disconnect' ? 'error' : 'reconnecting');
  });

  socket.on('connect_error', (error) => {
    if (closed) return;

    // The handshake guard rejects an unknown or expired session id.
    if (/session/i.test(error.message)) {
      void renewSession();
      return;
    }

    events.status('reconnecting', error.message);
  });

  socket.on('session:ready', (payload) => {
    events.snapshot(payload);
    events.status('ready');
  });

  socket.on('chat:message', (message) => events.message(message));
  socket.on('echo:typing', ({ isTyping }) => events.typing(isTyping));
  socket.on('echo:state', (state) => events.echoState(state));
  socket.on('memory:restored', (fragment) => events.memoryRestored(fragment));
  socket.on('progress:updated', (progress) => events.progress(progress));
  socket.on('milestone:achieved', (milestone) => events.milestone(milestone));

  socket.on('session:expired', () => {
    events.typing(false);
    void renewSession();
  });

  socket.on('error', (payload) => {
    events.typing(false);
    events.error(payload);
  });

  const connection: GameConnection = {
    mode: 'server',

    send(content: string) {
      if (!socket.connected) {
        events.error({ code: 'offline', message: 'Not connected to Echo right now.' });
        return;
      }
      socket.emit('chat:send', { content });
    },

    close() {
      closed = true;
      socket.removeAllListeners();
      socket.disconnect();
    },
  };

  return { connection, identity: { mode: 'server', playerId, sessionId } };
}
