/**
 * The shapes the whole application agrees on.
 *
 * These mirror the schema in `database/migrations/`, in camelCase, with dates
 * as ISO strings so a value can be sent to the client unchanged. Mapping from
 * rows happens in one place: `models/rows.ts`.
 *
 * This is a copy of `backend/src/types/domain.ts`. Change one, change both — or
 * promote it to a shared workspace package.
 */

export const EMOTIONS = ['neutral', 'happy', 'curious', 'sad', 'afraid', 'nostalgic'] as const;

export type Emotion = (typeof EMOTIONS)[number];

export type MessageSender = 'player' | 'echo';

export function isEmotion(value: unknown): value is Emotion {
  return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Player profile
// ---------------------------------------------------------------------------

export interface Player {
  id: string;
  displayName: string;
  /** How Echo should refer to the player, when they have said. */
  pronouns: string | null;
  locale: string;
  timeZone: string | null;
  /** Client-side settings. Opaque to the server, never queried on. */
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

/** Everything a player is allowed to change about themselves. */
export interface ProfileUpdate {
  displayName?: string;
  pronouns?: string | null;
  locale?: string;
  timeZone?: string | null;
  preferences?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sessions and conversations
// ---------------------------------------------------------------------------

export type SessionEndReason = 'player' | 'idle' | 'shutdown';

/** One visit. Starts when the player connects, ends when they leave or idle out. */
export interface Session {
  id: string;
  playerId: string;
  startedAt: string;
  lastActivityAt: string;
  endedAt: string | null;
  endedReason: SessionEndReason | null;
}

/**
 * The thread with Echo. Spans as many sessions as the player takes, which is
 * what lets Echo remember someone who closed the tab yesterday.
 */
export interface Conversation {
  id: string;
  playerId: string;
  title: string | null;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  endedAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  /** The visit this was said in. Null once that session has been cleaned up. */
  sessionId: string | null;
  /** Position in the thread, from 1. Authoritative for ordering. */
  seq: number;
  sender: MessageSender;
  content: string;
  emotion: Emotion;
  trustDelta: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Personality
// ---------------------------------------------------------------------------

export const PERSONALITY_TRAITS = ['warmth', 'curiosity', 'playfulness', 'openness'] as const;

export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number];

/** Each 0..100. Slow-moving, unlike mood. */
export type TraitScores = Record<PersonalityTrait, number>;

export type TraitDeltas = Partial<Record<PersonalityTrait, number>>;

/**
 * Who Echo is with this player: how far she trusts them (relationship), how
 * she feels this second (mood), and what she is like (traits).
 */
export interface EchoPersonality {
  playerId: string;
  trustLevel: number;
  mood: Emotion;
  traits: TraitScores;
  createdAt: string;
  updatedAt: string;
}

/** One recorded change to the above, and what caused it. */
export interface PersonalityEvent {
  id: string;
  playerId: string;
  conversationId: string | null;
  messageId: string | null;
  reason: string;
  trustBefore: number;
  trustAfter: number;
  /** Before clamping, so an over-eager provider stays visible. */
  trustRequested: number;
  moodBefore: Emotion;
  moodAfter: Emotion;
  traitDeltas: TraitDeltas;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------

export interface MemoryChapter {
  id: string;
  number: number;
  slug: string;
  title: string;
  summary: string;
}

/** Authored content. Identical for every player. */
export interface MemoryFragment {
  id: string;
  slug: string;
  title: string;
  content: string;
  emotion: Emotion;
  chapterId: string;
  chapterNumber: number;
  unlockOrder: number;
  requiredTrust: number;
}

/** A fragment as one player sees it. Locked ones are sent without content. */
export interface PlayerMemory extends MemoryFragment {
  restored: boolean;
  restoredAt: string | null;
  /** The line that brought it back, when it is still on record. */
  triggeredByMessageId: string | null;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface GameProgress {
  playerId: string;
  currentChapter: number;
  memoriesRestored: number;
  memoriesTotal: number;
  /** Player lines only. */
  messagesSent: number;
  sessionsStarted: number;
  highestTrust: number;
  /** Summed from sessions on read, so it can never drift. */
  playSeconds: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
  completedAt: string | null;
}

export type MilestoneKind = 'trust' | 'memories' | 'messages' | 'chapter';

export interface Milestone {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: MilestoneKind;
  threshold: number;
  sortOrder: number;
}

export interface PlayerMilestone extends Milestone {
  achieved: boolean;
  achievedAt: string | null;
}

// ---------------------------------------------------------------------------
// The whole world, as sent to the client
// ---------------------------------------------------------------------------

export interface GameSnapshot {
  player: Player;
  session: Session;
  conversation: Conversation;
  echo: EchoPersonality;
  messages: Message[];
  chapters: MemoryChapter[];
  memories: PlayerMemory[];
  progress: GameProgress;
  milestones: PlayerMilestone[];
}
