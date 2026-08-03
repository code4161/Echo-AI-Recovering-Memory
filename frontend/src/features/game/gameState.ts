import type { ConnectionStatus, GameMode } from '@/services/game/types';
import type {
  EchoPersonality,
  Emotion,
  GameProgress,
  GameSnapshot,
  MemoryChapter,
  MemoryFragment,
  Message,
  PlayerMemory,
  PlayerMilestone,
  TraitScores,
} from '@/types/domain';

export type GameStatus = 'idle' | ConnectionStatus;

const NO_TRAITS: TraitScores = { warmth: 0, curiosity: 0, playfulness: 0, openness: 0 };

/** Stands in until the first snapshot lands; every field is replaced by it. */
const NO_PROGRESS: GameProgress = {
  playerId: '',
  currentChapter: 1,
  memoriesRestored: 0,
  memoriesTotal: 0,
  messagesSent: 0,
  sessionsStarted: 0,
  highestTrust: 0,
  playSeconds: 0,
  firstPlayedAt: '',
  lastPlayedAt: '',
  completedAt: null,
};

export interface GameState {
  /** True once the player has begun, so the game screen should render. */
  active: boolean;
  mode: GameMode | null;
  status: GameStatus;
  playerName: string;
  messages: Message[];
  trust: number;
  mood: Emotion;
  traits: TraitScores;
  thinking: boolean;
  chapters: MemoryChapter[];
  memories: PlayerMemory[];
  progress: GameProgress;
  milestones: PlayerMilestone[];
  /** Fragment awaiting its "memory recovered" moment, if any. */
  celebration: MemoryFragment | null;
  /** Award awaiting its moment. Shown after any memory, so they do not collide. */
  award: PlayerMilestone | null;
  error: string | null;
}

export const initialGameState: GameState = {
  active: false,
  mode: null,
  status: 'idle',
  playerName: '',
  messages: [],
  trust: 0,
  mood: 'curious',
  traits: NO_TRAITS,
  thinking: false,
  chapters: [],
  memories: [],
  progress: NO_PROGRESS,
  milestones: [],
  celebration: null,
  award: null,
  error: null,
};

export type GameAction =
  | { type: 'begin' }
  | { type: 'mode'; mode: GameMode }
  | { type: 'status'; status: ConnectionStatus; detail?: string }
  | { type: 'snapshot'; snapshot: GameSnapshot }
  | { type: 'message'; message: Message }
  | { type: 'typing'; value: boolean }
  | { type: 'echo-state'; state: EchoPersonality }
  | { type: 'memory-restored'; fragment: MemoryFragment }
  | { type: 'progress'; progress: GameProgress }
  | { type: 'milestone'; milestone: PlayerMilestone }
  | { type: 'error'; message: string }
  | { type: 'dismiss-celebration' }
  | { type: 'dismiss-award' }
  | { type: 'reset' };

/**
 * Applies events; it does not decide anything.
 *
 * Trust changes, personality drift, memory unlocks and awards are computed by
 * whoever is refereeing the game — the server over Socket.io, or the offline
 * connection in the browser — and arrive here already decided. That is what
 * makes progress impossible to fake from the console: there is no local rule to
 * tamper with.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'begin':
      return { ...initialGameState, active: true, status: 'connecting' };

    case 'mode':
      return { ...state, mode: action.mode };

    case 'status':
      return {
        ...state,
        status: action.status,
        // A failed connection leaves Echo stuck "thinking" otherwise.
        thinking: action.status === 'ready' ? state.thinking : false,
        error: action.status === 'error' ? (action.detail ?? state.error) : null,
      };

    case 'snapshot':
      return {
        ...state,
        active: true,
        playerName: action.snapshot.player.displayName,
        messages: action.snapshot.messages,
        trust: action.snapshot.echo.trustLevel,
        mood: action.snapshot.echo.mood,
        traits: action.snapshot.echo.traits,
        chapters: action.snapshot.chapters,
        memories: action.snapshot.memories,
        progress: action.snapshot.progress,
        milestones: action.snapshot.milestones,
        error: null,
      };

    case 'message':
      // The server echoes the player's own line back, so nothing is appended
      // optimistically and the transcript stays server-ordered. Guard against
      // a replay after reconnect all the same.
      return state.messages.some((existing) => existing.id === action.message.id)
        ? state
        : { ...state, messages: [...state.messages, action.message] };

    case 'typing':
      return { ...state, thinking: action.value };

    case 'echo-state':
      return {
        ...state,
        trust: action.state.trustLevel,
        mood: action.state.mood,
        traits: action.state.traits,
      };

    case 'memory-restored': {
      const alreadyKnown = state.memories.some(
        (memory) => memory.id === action.fragment.id && memory.restored
      );
      if (alreadyKnown) return state;

      // The event carries the full fragment, including the text that was
      // withheld while it was locked.
      const memories = state.memories.map((memory) =>
        memory.id === action.fragment.id
          ? {
              ...action.fragment,
              restored: true,
              restoredAt: new Date().toISOString(),
              triggeredByMessageId: null,
            }
          : memory
      );

      return { ...state, memories, celebration: action.fragment };
    }

    // Counters are the referee's, never counted locally: the restored total
    // here comes from the same query the journal and the server agree on.
    case 'progress':
      return { ...state, progress: action.progress };

    case 'milestone': {
      const known = state.milestones.some(
        (milestone) => milestone.id === action.milestone.id && milestone.achieved
      );
      if (known) return state;

      return {
        ...state,
        milestones: state.milestones.map((milestone) =>
          milestone.id === action.milestone.id ? action.milestone : milestone
        ),
        award: action.milestone,
      };
    }

    case 'error':
      return { ...state, thinking: false, error: action.message };

    case 'dismiss-celebration':
      return { ...state, celebration: null };

    case 'dismiss-award':
      return { ...state, award: null };

    case 'reset':
      return initialGameState;

    default:
      return state;
  }
}
