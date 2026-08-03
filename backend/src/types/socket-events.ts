import type {
  EchoPersonality,
  GameProgress,
  GameSnapshot,
  MemoryFragment,
  Message,
  PlayerMilestone,
} from './domain.js';

/**
 * The realtime contract. Socket.io is typed with these maps on both ends, so a
 * renamed event or a changed payload is a compile error rather than silence.
 */

export interface ClientToServerEvents {
  /** Ask for the current snapshot again, e.g. after a reconnect. */
  'session:sync': () => void;
  'chat:send': (payload: { content: string }) => void;
  'chat:typing': (payload: { isTyping: boolean }) => void;
}

export interface ServerToClientEvents {
  'session:ready': (payload: GameSnapshot) => void;
  'chat:message': (payload: Message) => void;
  'echo:typing': (payload: { isTyping: boolean }) => void;
  /** Trust, mood and traits, after every exchange. */
  'echo:state': (payload: EchoPersonality) => void;
  'memory:restored': (payload: MemoryFragment) => void;
  'progress:updated': (payload: GameProgress) => void;
  /** Only newly earned awards, one event each. */
  'milestone:achieved': (payload: PlayerMilestone) => void;
  'session:expired': (payload: { reason: string }) => void;
  'error': (payload: { code: string; message: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

/**
 * Per-connection state. Populated by the handshake middleware before any
 * handler runs, so handlers can treat these as guaranteed.
 */
export interface SocketData {
  playerId: string;
  sessionId: string;
  conversationId: string;
  playerName: string;
}

/** Room naming lives here so producers and consumers cannot drift apart. */
export const sessionRoom = (sessionId: string): string => `session:${sessionId}`;
