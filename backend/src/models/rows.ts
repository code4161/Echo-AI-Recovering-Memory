import type {
  Conversation,
  EchoPersonality,
  Emotion,
  GameProgress,
  MemoryChapter,
  MemoryFragment,
  Message,
  MessageSender,
  Milestone,
  MilestoneKind,
  PersonalityEvent,
  Player,
  PlayerMemory,
  PlayerMilestone,
  Session,
  SessionEndReason,
  TraitDeltas,
} from '../types/domain.js';

/**
 * Row shapes and the mapping into domain objects.
 *
 * Postgres speaks snake_case, `Date` and `numeric`; the rest of the application
 * speaks camelCase, ISO strings and `number`. That translation happens here and
 * nowhere else, so no service ever sees a raw row.
 */

export interface PlayerRow {
  id: string;
  display_name: string;
  pronouns: string | null;
  locale: string;
  time_zone: string | null;
  preferences: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  last_seen_at: Date;
}

export interface SessionRow {
  id: string;
  player_id: string;
  started_at: Date;
  last_activity_at: Date;
  ended_at: Date | null;
  ended_reason: SessionEndReason | null;
}

export interface ConversationRow {
  id: string;
  player_id: string;
  title: string | null;
  started_at: Date;
  last_message_at: Date;
  message_count: number;
  ended_at: Date | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  session_id: string | null;
  seq: number;
  sender: MessageSender;
  content: string;
  emotion: Emotion;
  trust_delta: number;
  created_at: Date;
}

export interface ChapterRow {
  id: string;
  number: number;
  slug: string;
  title: string;
  summary: string;
}

/** Fragments are always read joined to their chapter, for the number. */
export interface FragmentRow {
  id: string;
  slug: string;
  title: string;
  content: string;
  emotion: Emotion;
  chapter_id: string;
  chapter_number: number;
  unlock_order: number;
  required_trust: number;
}

export interface PlayerMemoryRow extends FragmentRow {
  restored_at: Date | null;
  triggered_by_message_id: string | null;
}

export interface PersonalityRow {
  player_id: string;
  trust_level: number;
  mood: Emotion;
  warmth: number;
  curiosity: number;
  playfulness: number;
  openness: number;
  created_at: Date;
  updated_at: Date;
}

export interface PersonalityEventRow {
  id: string;
  player_id: string;
  conversation_id: string | null;
  message_id: string | null;
  reason: string;
  trust_before: number;
  trust_after: number;
  trust_requested: number;
  mood_before: Emotion;
  mood_after: Emotion;
  trait_deltas: TraitDeltas;
  created_at: Date;
}

/** `game_progress` joined with the two figures that are computed on read. */
export interface ProgressRow {
  player_id: string;
  current_chapter: number;
  memories_restored: number;
  memories_total: number;
  messages_sent: number;
  sessions_started: number;
  highest_trust: number;
  play_seconds: number;
  first_played_at: Date;
  last_played_at: Date;
  completed_at: Date | null;
}

export interface MilestoneRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: MilestoneKind;
  threshold: number;
  sort_order: number;
}

export interface PlayerMilestoneRow extends MilestoneRow {
  achieved_at: Date | null;
}

export const toPlayer = (row: PlayerRow): Player => ({
  id: row.id,
  displayName: row.display_name,
  pronouns: row.pronouns,
  locale: row.locale,
  timeZone: row.time_zone,
  preferences: row.preferences,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  lastSeenAt: row.last_seen_at.toISOString(),
});

export const toSession = (row: SessionRow): Session => ({
  id: row.id,
  playerId: row.player_id,
  startedAt: row.started_at.toISOString(),
  lastActivityAt: row.last_activity_at.toISOString(),
  endedAt: row.ended_at?.toISOString() ?? null,
  endedReason: row.ended_reason,
});

export const toConversation = (row: ConversationRow): Conversation => ({
  id: row.id,
  playerId: row.player_id,
  title: row.title,
  startedAt: row.started_at.toISOString(),
  lastMessageAt: row.last_message_at.toISOString(),
  messageCount: row.message_count,
  endedAt: row.ended_at?.toISOString() ?? null,
});

export const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  conversationId: row.conversation_id,
  sessionId: row.session_id,
  seq: row.seq,
  sender: row.sender,
  content: row.content,
  emotion: row.emotion,
  trustDelta: row.trust_delta,
  createdAt: row.created_at.toISOString(),
});

export const toChapter = (row: ChapterRow): MemoryChapter => ({
  id: row.id,
  number: row.number,
  slug: row.slug,
  title: row.title,
  summary: row.summary,
});

export const toFragment = (row: FragmentRow): MemoryFragment => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  content: row.content,
  emotion: row.emotion,
  chapterId: row.chapter_id,
  chapterNumber: row.chapter_number,
  unlockOrder: row.unlock_order,
  requiredTrust: row.required_trust,
});

export const toPlayerMemory = (row: PlayerMemoryRow): PlayerMemory => ({
  ...toFragment(row),
  restored: row.restored_at !== null,
  restoredAt: row.restored_at?.toISOString() ?? null,
  triggeredByMessageId: row.triggered_by_message_id,
});

export const toPersonality = (row: PersonalityRow): EchoPersonality => ({
  playerId: row.player_id,
  trustLevel: row.trust_level,
  mood: row.mood,
  traits: {
    warmth: row.warmth,
    curiosity: row.curiosity,
    playfulness: row.playfulness,
    openness: row.openness,
  },
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export const toPersonalityEvent = (row: PersonalityEventRow): PersonalityEvent => ({
  id: row.id,
  playerId: row.player_id,
  conversationId: row.conversation_id,
  messageId: row.message_id,
  reason: row.reason,
  trustBefore: row.trust_before,
  trustAfter: row.trust_after,
  trustRequested: row.trust_requested,
  moodBefore: row.mood_before,
  moodAfter: row.mood_after,
  traitDeltas: row.trait_deltas,
  createdAt: row.created_at.toISOString(),
});

export const toProgress = (row: ProgressRow): GameProgress => ({
  playerId: row.player_id,
  currentChapter: row.current_chapter,
  memoriesRestored: row.memories_restored,
  memoriesTotal: row.memories_total,
  messagesSent: row.messages_sent,
  sessionsStarted: row.sessions_started,
  highestTrust: row.highest_trust,
  playSeconds: row.play_seconds,
  firstPlayedAt: row.first_played_at.toISOString(),
  lastPlayedAt: row.last_played_at.toISOString(),
  completedAt: row.completed_at?.toISOString() ?? null,
});

export const toMilestone = (row: MilestoneRow): Milestone => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  kind: row.kind,
  threshold: row.threshold,
  sortOrder: row.sort_order,
});

export const toPlayerMilestone = (row: PlayerMilestoneRow): PlayerMilestone => ({
  ...toMilestone(row),
  achieved: row.achieved_at !== null,
  achievedAt: row.achieved_at?.toISOString() ?? null,
});
