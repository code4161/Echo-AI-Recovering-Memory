import { gameConfig } from '../config/game.js';
import { conversationModel } from '../models/conversation.model.js';
import { memoryModel } from '../models/memory.model.js';
import { messageModel } from '../models/message.model.js';
import { personalityModel } from '../models/personality.model.js';
import { playerModel } from '../models/player.model.js';
import { progressModel } from '../models/progress.model.js';
import { sessionModel } from '../models/session.model.js';
import type { Conversation, GameSnapshot, Player, Session } from '../types/domain.js';
import { gone, notFound, unprocessable } from '../utils/errors.js';
import { isUuid } from '../utils/ids.js';
import { logger } from '../utils/logger.js';
import { isOlderThan } from '../utils/time.js';

const MAX_NAME_LENGTH = 40;

export interface StartResult {
  player: Player;
  session: Session;
  conversation: Conversation;
  resumed: boolean;
}

/**
 * Player session lifecycle: start, resume, validate, end, expire.
 *
 * A session id is the client's only credential. It is *not* authentication —
 * anyone holding the id can use the session — but it does mean every request
 * and socket connection is checked against a real, open, non-expired row
 * before any game logic runs.
 *
 * Note the two lifetimes this file juggles. A **session** is one visit and
 * expires after half an hour of silence. A **conversation** is the thread with
 * Echo and survives any number of visits, which is why a returning player is
 * remembered rather than met again.
 */
export const sessionService = {
  /** Creates a player and everything a new game needs, in one place. */
  async register(displayName: string): Promise<StartResult> {
    const name = displayName.trim();
    if (!name) throw unprocessable('displayName is required');
    if (name.length > MAX_NAME_LENGTH) {
      throw unprocessable(`displayName must be at most ${MAX_NAME_LENGTH} characters`);
    }

    const player = await playerModel.create({ displayName: name });

    await personalityModel.ensure(player.id);
    await progressModel.ensure(player.id);

    const conversation = await conversationModel.ensureActive(player.id);
    const session = await sessionModel.create(player.id);

    await progressModel.apply(player.id, { sessionsStarted: 1 });

    logger.info(`player registered ${player.id} (${name})`);
    return { player, session, conversation, resumed: false };
  },

  /**
   * Resumes the player's open session, or opens a new one.
   *
   * A session idle past the timeout is closed rather than handed back, so a
   * player returning the next day gets a fresh visit — but the same
   * conversation, so Echo still knows them.
   */
  async start(playerId: string): Promise<StartResult> {
    if (!isUuid(playerId)) throw notFound('Player not found');

    const player = await playerModel.findById(playerId);
    if (!player) throw notFound('Player not found');

    await personalityModel.ensure(playerId);
    await progressModel.ensure(playerId);
    await playerModel.touch(playerId);

    const conversation = await conversationModel.ensureActive(playerId);
    const existing = await sessionModel.findOpenByPlayer(playerId);

    if (existing) {
      if (!isOlderThan(existing.lastActivityAt, gameConfig.session.idleTimeoutMs)) {
        await sessionModel.touch(existing.id);
        return { player, session: existing, conversation, resumed: true };
      }
      await sessionModel.close(existing.id, 'idle');
    }

    const session = await sessionModel.create(playerId);
    await progressModel.apply(playerId, { sessionsStarted: 1 });

    return { player, session, conversation, resumed: false };
  },

  /**
   * Loads a session and asserts it is usable. Every entry point — HTTP route
   * and socket handshake alike — goes through this before touching the game.
   */
  async authorize(
    sessionId: string
  ): Promise<{ session: Session; player: Player; conversation: Conversation }> {
    // A stale or hand-edited id must come back as "no such session", not as a
    // database type error the client cannot act on.
    if (!isUuid(sessionId)) throw notFound('Session not found');

    const session = await sessionModel.findById(sessionId);
    if (!session) throw notFound('Session not found');
    if (session.endedAt) throw gone('This session has ended');

    if (isOlderThan(session.lastActivityAt, gameConfig.session.idleTimeoutMs)) {
      await sessionModel.close(session.id, 'idle');
      throw gone('This session expired. Start a new one.');
    }

    const player = await playerModel.findById(session.playerId);
    if (!player) throw notFound('Player not found');

    const conversation = await conversationModel.ensureActive(player.id);

    return { session, player, conversation };
  },

  async touch(sessionId: string): Promise<void> {
    await sessionModel.touch(sessionId);
  },

  async end(sessionId: string): Promise<void> {
    await sessionModel.close(sessionId, 'player');
  },

  /** Closes sessions nobody has touched in a while. Returns the closed ids. */
  async sweepIdle(): Promise<string[]> {
    const closed = await sessionModel.closeIdle(gameConfig.session.idleTimeoutMs);
    if (closed.length > 0) {
      logger.info(`swept ${closed.length} idle session(s)`);
    }
    return closed;
  },

  /** Assembles everything the client needs to render the game. */
  async snapshot(sessionId: string): Promise<GameSnapshot> {
    const { session, player, conversation } = await sessionService.authorize(sessionId);

    const [echo, messages, chapters, memories, progress, milestones] = await Promise.all([
      personalityModel.ensure(player.id),
      messageModel.listRecent(conversation.id, gameConfig.chat.historyWindow),
      memoryModel.listChapters(),
      memoryModel.listForPlayer(player.id),
      progressModel.ensure(player.id),
      progressModel.listMilestones(player.id),
    ]);

    return {
      player,
      session,
      conversation,
      echo,
      messages,
      chapters,
      // Locked fragments are stripped so the client cannot spoil unearned content.
      memories: memories.map((memory) =>
        memory.restored ? memory : { ...memory, title: 'Lost', content: '' }
      ),
      progress,
      milestones,
    };
  },
};
