import type { SavedIdentity } from '@/services/game/types';
import type { Emotion, Message, TraitScores } from '@/types/domain';

const IDENTITY_KEY = 'echo:identity:v1';
const OFFLINE_KEY = 'echo:offline:v1';

/**
 * The whole game, when there is no server to hold it.
 *
 * This is the browser's version of the `players`, `conversations`, `messages`,
 * `echo_personality`, `player_memories`, `game_progress` and
 * `player_milestones` tables, flattened into one object because there is
 * nothing here to join.
 */
export interface OfflineSave {
  playerName: string;
  trust: number;
  mood: Emotion;
  traits: TraitScores;
  messages: Message[];
  restoredIds: string[];
  /** Slugs of milestones already awarded, so each is celebrated once. */
  awardedSlugs: string[];
  startedAt: string;
}

/** Defaults for a save written before a field existed. */
export const DEFAULT_TRAITS: TraitScores = {
  warmth: 50,
  curiosity: 65,
  playfulness: 35,
  openness: 25,
};

function read<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota: the session just will not persist.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

const isIdentity = (value: unknown): value is SavedIdentity => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { mode?: unknown; playerId?: unknown; sessionId?: unknown };

  if (candidate.mode === 'offline') return true;
  return (
    candidate.mode === 'server' &&
    typeof candidate.playerId === 'string' &&
    typeof candidate.sessionId === 'string'
  );
};

const isOfflineSave = (value: unknown): value is Partial<OfflineSave> => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { playerName?: unknown; messages?: unknown };
  return typeof candidate.playerName === 'string' && Array.isArray(candidate.messages);
};

/**
 * Fills in fields added after a save was written.
 *
 * Offline saves have no migrations, so the only alternative to defaulting here
 * is discarding somebody's game because the schema grew.
 */
function normalise(save: Partial<OfflineSave>): OfflineSave {
  return {
    playerName: save.playerName ?? 'Friend',
    trust: save.trust ?? 0,
    mood: save.mood ?? 'curious',
    traits: { ...DEFAULT_TRAITS, ...save.traits },
    messages: save.messages ?? [],
    restoredIds: save.restoredIds ?? [],
    awardedSlugs: save.awardedSlugs ?? [],
    startedAt: save.startedAt ?? new Date().toISOString(),
  };
}

/**
 * Which game this browser is in the middle of.
 *
 * In server mode this holds only ids — the conversation itself lives in
 * Postgres. In offline mode it just records the mode, and the save below holds
 * the state.
 */
export const identityStore = {
  load: () => read(IDENTITY_KEY, isIdentity),
  save: (identity: SavedIdentity) => write(IDENTITY_KEY, identity),
  clear: () => remove(IDENTITY_KEY),
};

export const offlineStore = {
  load: (): OfflineSave | null => {
    const stored = read(OFFLINE_KEY, isOfflineSave);
    return stored ? normalise(stored) : null;
  },
  save: (save: OfflineSave) => write(OFFLINE_KEY, save),
  clear: () => remove(OFFLINE_KEY),
};

export function clearAllProgress(): void {
  identityStore.clear();
  offlineStore.clear();
}
