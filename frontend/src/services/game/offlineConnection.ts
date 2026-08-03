import { MEMORY_CHAPTERS, MEMORY_FRAGMENTS } from '@/data/memories';
import { createId } from '@/lib/id';
import { DEFAULT_TRAITS, offlineStore, type OfflineSave } from '@/lib/storage';
import { createLocalEchoClient } from '@/services/echo/localEchoClient';
import type {
  EchoPersonality,
  Emotion,
  GameProgress,
  GameSnapshot,
  MemoryFragment,
  Message,
  PlayerMemory,
} from '@/types/domain';
import {
  allMilestones,
  applyDrift,
  clampInt,
  driftFor,
  newlyEarned,
  OFFLINE_RULES,
} from './offlineRules';
import type { GameConnection, GameEvents, OpenResult, StartIntent } from './types';

// There is one player, one session and one conversation offline, so their ids
// are constants rather than anything the browser has to keep track of.
const OFFLINE_PLAYER_ID = 'offline-player';
const OFFLINE_SESSION_ID = 'offline-session';
const OFFLINE_CONVERSATION_ID = 'offline-conversation';

const orderedFragments = () =>
  [...MEMORY_FRAGMENTS].sort(
    (a, b) => a.chapterNumber - b.chapterNumber || a.unlockOrder - b.unlockOrder
  );

function emptySave(playerName: string): OfflineSave {
  return {
    playerName,
    trust: 0,
    mood: 'curious',
    traits: { ...DEFAULT_TRAITS },
    messages: [],
    restoredIds: [],
    awardedSlugs: [],
    startedAt: new Date().toISOString(),
  };
}

const playerMessagesIn = (save: OfflineSave) =>
  save.messages.filter((message) => message.sender === 'player').length;

/** The chapter the player is working through — the server's rule, in one line. */
function currentChapter(save: OfflineSave): number {
  const missing = orderedFragments().find(
    (fragment) => !save.restoredIds.includes(fragment.id)
  );
  return missing?.chapterNumber ?? Math.max(...MEMORY_CHAPTERS.map((c) => c.number), 1);
}

function toProgress(save: OfflineSave): GameProgress {
  const now = new Date().toISOString();

  return {
    playerId: OFFLINE_PLAYER_ID,
    currentChapter: currentChapter(save),
    memoriesRestored: save.restoredIds.length,
    memoriesTotal: MEMORY_FRAGMENTS.length,
    messagesSent: playerMessagesIn(save),
    sessionsStarted: 1,
    highestTrust: save.trust,
    playSeconds: Math.max(
      0,
      Math.round((Date.now() - new Date(save.startedAt).getTime()) / 1000)
    ),
    firstPlayedAt: save.startedAt,
    lastPlayedAt: now,
    completedAt: save.restoredIds.length >= MEMORY_FRAGMENTS.length ? now : null,
  };
}

function toSnapshot(save: OfflineSave, echo: EchoPersonality): GameSnapshot {
  const now = new Date().toISOString();

  const memories: PlayerMemory[] = orderedFragments().map((fragment) => {
    const restored = save.restoredIds.includes(fragment.id);
    return {
      ...fragment,
      restored,
      restoredAt: null,
      triggeredByMessageId: null,
      // Locked content is withheld here too, matching what the server sends.
      ...(restored ? {} : { title: 'Lost', content: '' }),
    };
  });

  return {
    player: {
      id: OFFLINE_PLAYER_ID,
      displayName: save.playerName,
      pronouns: null,
      locale: 'en',
      timeZone: null,
      preferences: {},
      createdAt: save.startedAt,
      updatedAt: now,
      lastSeenAt: now,
    },
    session: {
      id: OFFLINE_SESSION_ID,
      playerId: OFFLINE_PLAYER_ID,
      startedAt: now,
      lastActivityAt: now,
      endedAt: null,
      endedReason: null,
    },
    conversation: {
      id: OFFLINE_CONVERSATION_ID,
      playerId: OFFLINE_PLAYER_ID,
      title: null,
      startedAt: save.startedAt,
      lastMessageAt: save.messages.at(-1)?.createdAt ?? save.startedAt,
      messageCount: save.messages.length,
      endedAt: null,
    },
    echo,
    messages: save.messages,
    chapters: [...MEMORY_CHAPTERS],
    memories,
    progress: toProgress(save),
    milestones: allMilestones(save.awardedSlugs),
  };
}

/**
 * Offline play: the same game, refereed in the browser.
 *
 * It produces the identical event stream to the socket connection, so the UI
 * cannot tell them apart. Used when the backend is unreachable, or forced on
 * with VITE_OFFLINE for UI work without running Postgres.
 */
export async function openOfflineConnection(
  intent: StartIntent,
  events: GameEvents
): Promise<OpenResult> {
  events.mode('offline');
  events.status('connecting');

  const echo = createLocalEchoClient();

  let save: OfflineSave;
  if (intent.type === 'new') {
    save = emptySave(intent.displayName);
  } else {
    const restored = offlineStore.load();
    // Refusing beats inventing a blank game and calling it the player's.
    if (!restored) throw new Error('There is no offline game saved in this browser');
    save = restored;
  }

  let closed = false;
  let busy = false;

  const persist = () => offlineStore.save(save);

  const personality = (): EchoPersonality => ({
    playerId: OFFLINE_PLAYER_ID,
    trustLevel: save.trust,
    mood: save.mood,
    traits: save.traits,
    createdAt: save.startedAt,
    updatedAt: new Date().toISOString(),
  });

  const record = (sender: Message['sender'], content: string, emotion: Emotion,
    trustDelta = 0): Message => {
    const message: Message = {
      id: createId(),
      conversationId: OFFLINE_CONVERSATION_ID,
      sessionId: OFFLINE_SESSION_ID,
      seq: save.messages.length + 1,
      sender,
      content,
      emotion,
      trustDelta,
      createdAt: new Date().toISOString(),
    };

    save = { ...save, messages: [...save.messages, message] };
    persist();
    events.message(message);
    return message;
  };

  /** One memory per exchange, in authored order — the server's rule. */
  const tryRestoreMemory = (): MemoryFragment | null => {
    const next = orderedFragments().find(
      (fragment) =>
        !save.restoredIds.includes(fragment.id) && fragment.requiredTrust <= save.trust
    );
    if (!next) return null;

    save = { ...save, restoredIds: [...save.restoredIds, next.id] };
    persist();
    return next;
  };

  /** Awards anything newly earned and announces it, once. */
  const award = (progress: GameProgress): void => {
    const earned = newlyEarned(save.awardedSlugs, {
      trust: progress.highestTrust,
      memories: progress.memoriesRestored,
      messages: progress.messagesSent,
      chapter: progress.currentChapter,
    });
    if (earned.length === 0) return;

    save = {
      ...save,
      awardedSlugs: [...save.awardedSlugs, ...earned.map((milestone) => milestone.slug)],
    };
    persist();

    for (const milestone of earned) events.milestone(milestone);
  };

  events.snapshot(toSnapshot(save, personality()));
  events.status('ready');

  // A brand new player is greeted, exactly as the server does on registration.
  if (intent.type === 'new') {
    events.typing(true);
    const greeting = await echo.greet(save.playerName);
    if (!closed) {
      events.typing(false);
      record('echo', greeting.content, greeting.emotion);
    }
  }

  const connection: GameConnection = {
    mode: 'offline',

    send(content: string) {
      const trimmed = content.trim();
      if (!trimmed || busy || closed) return;

      busy = true;

      // Captured before recording: the engine's contract is that history
      // excludes the line it is answering.
      const history = save.messages;

      record('player', trimmed, 'neutral');
      events.typing(true);

      void echo
        .respond({
          playerMessage: trimmed,
          history,
          state: personality(),
          playerName: save.playerName,
        })
        .then((reply) => {
          if (closed) return;

          const applied = clampInt(
            reply.trustDelta,
            -OFFLINE_RULES.trust.maxDeltaPerExchange,
            OFFLINE_RULES.trust.maxDeltaPerExchange
          );

          save = {
            ...save,
            trust: clampInt(
              save.trust + applied,
              OFFLINE_RULES.trust.min,
              OFFLINE_RULES.trust.max
            ),
            mood: reply.emotion,
            traits: applyDrift(save.traits, driftFor(reply.emotion, applied)),
          };
          persist();

          events.typing(false);
          record('echo', reply.content, reply.emotion, applied);
          events.echoState(personality());

          const restored = tryRestoreMemory();
          if (restored) events.memoryRestored(restored);

          const progress = toProgress(save);
          events.progress(progress);
          award(progress);
        })
        .catch(() => {
          events.typing(false);
          events.error({ code: 'offline_error', message: 'Echo lost her thread.' });
        })
        .finally(() => {
          busy = false;
        });
    },

    close() {
      closed = true;
    },
  };

  return { connection, identity: { mode: 'offline' } };
}
