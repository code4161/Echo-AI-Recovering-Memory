import type {
  EchoPersonality,
  GameProgress,
  GameSnapshot,
  MemoryFragment,
  Message,
  PlayerMilestone,
} from '@/types/domain';

export type GameMode = 'server' | 'offline';

export type ConnectionStatus =
  | 'connecting'
  | 'ready'
  /** Dropped, but Socket.io is retrying on its own. */
  | 'reconnecting'
  | 'error';

/** What the client persists so a refresh resumes rather than restarts. */
export type SavedIdentity =
  | { mode: 'server'; playerId: string; sessionId: string }
  | { mode: 'offline' };

export type StartIntent =
  | { type: 'new'; displayName: string }
  | { type: 'resume'; identity: SavedIdentity };

/**
 * Everything the game can be told. The server pushes these over Socket.io;
 * offline mode produces the identical sequence locally, so nothing above this
 * layer knows or cares which one is running.
 */
export interface GameEvents {
  /** Announced once, before anything else, by whichever connection opened. */
  mode: (mode: GameMode) => void;
  /** Full state. Sent on connect and whenever the server resynchronises. */
  snapshot: (snapshot: GameSnapshot) => void;
  message: (message: Message) => void;
  typing: (isTyping: boolean) => void;
  /** Trust, mood and traits, after every exchange. */
  echoState: (state: EchoPersonality) => void;
  memoryRestored: (fragment: MemoryFragment) => void;
  progress: (progress: GameProgress) => void;
  milestone: (milestone: PlayerMilestone) => void;
  status: (status: ConnectionStatus, detail?: string) => void;
  error: (error: { code: string; message: string }) => void;
  /** The session id changed — persist it or a refresh will start over. */
  identity: (identity: SavedIdentity) => void;
}

export interface GameConnection {
  readonly mode: GameMode;
  send: (content: string) => void;
  close: () => void;
}

export interface OpenResult {
  connection: GameConnection;
  identity: SavedIdentity;
}
