import { gameConfig } from '../config/game.js';
import { memoryModel } from '../models/memory.model.js';
import { messageModel } from '../models/message.model.js';
import { personalityModel } from '../models/personality.model.js';
import type {
  EchoPersonality,
  Emotion,
  MemoryFragment,
  Message,
  TraitDeltas,
} from '../types/domain.js';
import { logger } from '../utils/logger.js';
import { clampInt } from '../utils/numbers.js';
import { applyDrift, driftFor } from './personality.rules.js';

/** The live state of one session, held in memory between messages. */
interface LiveState {
  playerId: string;
  sessionId: string;
  /** The thread being appended to. Outlives this session. */
  conversationId: string;
  echo: EchoPersonality;
  /** Recent transcript, capped at the configured history window. */
  history: Message[];
  loadedAt: number;
  lastUsedAt: number;
}

export interface TrustChange {
  before: number;
  after: number;
  /** The delta actually applied, after clamping. */
  applied: number;
  /** What the provider asked for, before clamping. */
  requested: number;
}

export interface PersonalityChange {
  trust: TrustChange;
  moodBefore: Emotion;
  moodAfter: Emotion;
  /** Trait movement that actually landed, after clamping to range. */
  traitDeltas: TraitDeltas;
  echo: EchoPersonality;
}

const cache = new Map<string, LiveState>();

function evictIfNeeded(): void {
  if (cache.size <= gameConfig.state.maxCachedSessions) return;

  // Drop the least recently used entry. State is write-through, so evicting
  // never loses anything — the next read reloads from Postgres.
  let oldestKey: string | null = null;
  let oldestUse = Infinity;

  for (const [key, value] of cache) {
    if (value.lastUsedAt < oldestUse) {
      oldestUse = value.lastUsedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) cache.delete(oldestKey);
}

/**
 * Authoritative game state.
 *
 * Two responsibilities:
 *
 * 1. **Own the rules.** Trust changes, personality drift and memory unlocks are
 *    computed here and nowhere else, so a client — or a badly behaved AI
 *    provider — cannot invent progress. Providers return a *requested* trust
 *    delta and a mood; this service decides what actually happens.
 * 2. **Keep hot state hot.** A conversation touches the same rows repeatedly,
 *    so the recent transcript and Echo's personality are cached per session and
 *    written through to Postgres on every change.
 *
 * The cache is per process. Running more than one instance behind a load
 * balancer means moving it to Redis and adding a Socket.io adapter; nothing
 * outside this file would change.
 */
export const gameStateService = {
  async load(input: {
    sessionId: string;
    playerId: string;
    conversationId: string;
  }): Promise<LiveState> {
    const cached = cache.get(input.sessionId);
    const fresh = cached && Date.now() - cached.loadedAt < gameConfig.state.cacheTtlMs;

    if (cached && fresh && cached.conversationId === input.conversationId) {
      cached.lastUsedAt = Date.now();
      return cached;
    }

    // History comes from the conversation, not the session, so Echo picks up
    // where she left off however long the player has been away.
    const [echo, history] = await Promise.all([
      personalityModel.ensure(input.playerId),
      messageModel.listRecent(input.conversationId, gameConfig.chat.historyWindow),
    ]);

    const state: LiveState = {
      playerId: input.playerId,
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      echo,
      history,
      loadedAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    cache.set(input.sessionId, state);
    evictIfNeeded();
    return state;
  },

  /** Appends a message to both Postgres and the in-memory window. */
  async recordMessage(
    state: LiveState,
    input: {
      sender: Message['sender'];
      content: string;
      emotion?: Emotion;
      trustDelta?: number;
    }
  ): Promise<Message> {
    const message = await messageModel.append({
      conversationId: state.conversationId,
      sessionId: state.sessionId,
      sender: input.sender,
      content: input.content,
      ...(input.emotion ? { emotion: input.emotion } : {}),
      ...(input.trustDelta === undefined ? {} : { trustDelta: input.trustDelta }),
    });

    state.history.push(message);
    if (state.history.length > gameConfig.chat.historyWindow) {
      state.history.splice(0, state.history.length - gameConfig.chat.historyWindow);
    }
    state.lastUsedAt = Date.now();

    return message;
  },

  /**
   * Applies one exchange's worth of change to Echo.
   *
   * Trust is clamped twice — once per exchange, then against the 0–100 range —
   * and traits drift by a derived amount rather than one the provider chose.
   * The whole change is written to `personality_events` so it can be explained
   * afterwards.
   */
  async applyExchange(
    state: LiveState,
    input: { requestedTrust: number; mood: Emotion; messageId: string | null; reason: string }
  ): Promise<PersonalityChange> {
    const { maxDeltaPerExchange, min, max } = gameConfig.trust;

    const before = state.echo.trustLevel;
    const moodBefore = state.echo.mood;

    const applied = clampInt(input.requestedTrust, -maxDeltaPerExchange, maxDeltaPerExchange);
    const after = clampInt(before + applied, min, max);

    const drift = applyDrift(state.echo.traits, driftFor(input.mood, applied));

    state.echo = await personalityModel.save(state.playerId, {
      trustLevel: after,
      mood: input.mood,
      traits: drift.traits,
    });
    state.lastUsedAt = Date.now();

    await personalityModel.recordEvent({
      playerId: state.playerId,
      conversationId: state.conversationId,
      messageId: input.messageId,
      reason: input.reason,
      trustBefore: before,
      trustAfter: after,
      trustRequested: input.requestedTrust,
      moodBefore,
      moodAfter: input.mood,
      traitDeltas: drift.applied,
    });

    return {
      trust: { before, after, applied, requested: input.requestedTrust },
      moodBefore,
      moodAfter: input.mood,
      traitDeltas: drift.applied,
      echo: state.echo,
    };
  },

  /**
   * Recovers at most one memory per exchange, in authored order, so a large
   * trust jump reveals the story a beat at a time instead of all at once.
   *
   * `triggeredByMessageId` is the player's line, which is what the journal
   * shows as the reason the memory came back.
   */
  async tryRestoreMemory(
    state: LiveState,
    triggeredByMessageId: string | null
  ): Promise<MemoryFragment | null> {
    const fragment = await memoryModel.findNextUnlockable(state.playerId, state.echo.trustLevel);
    if (!fragment) return null;

    const restored = await memoryModel.markRestored({
      playerId: state.playerId,
      fragmentId: fragment.id,
      conversationId: state.conversationId,
      triggeredByMessageId,
    });

    // Already recorded by a concurrent exchange: not this one's to announce.
    if (!restored) return null;

    logger.info(`memory restored ${fragment.slug} for player ${state.playerId}`);
    return fragment;
  },

  /** Drops a session's cached state, e.g. when the session ends. */
  invalidate(sessionId: string): void {
    cache.delete(sessionId);
  },

  /** Removes entries past their TTL. Called on the same timer as the sweeper. */
  sweep(): number {
    const cutoff = Date.now() - gameConfig.state.cacheTtlMs;
    let removed = 0;

    for (const [key, value] of cache) {
      if (value.lastUsedAt < cutoff) {
        cache.delete(key);
        removed += 1;
      }
    }

    return removed;
  },

  stats(): { cachedSessions: number } {
    return { cachedSessions: cache.size };
  },
};

export type { LiveState };
