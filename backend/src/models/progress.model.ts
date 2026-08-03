import { query } from '../db/pool.js';
import type { GameProgress, PlayerMilestone } from '../types/domain.js';
import { CURRENT_CHAPTER_SQL } from './memory.model.js';
import {
  toPlayerMilestone,
  toProgress,
  type PlayerMilestoneRow,
  type ProgressRow,
} from './rows.js';

/** Counters that a progress update can move. All optional, all additive. */
export interface ProgressChanges {
  messagesSent?: number;
  memoriesRestored?: number;
  sessionsStarted?: number;
  /** Compared against the stored best, never lowering it. */
  trustLevel?: number;
  currentChapter?: number;
}

/**
 * How far a player has come.
 *
 * `game_progress` is a rollup: every column is derivable from the transcript,
 * `player_memories` and `sessions`. It exists so the common read is one indexed
 * lookup instead of four aggregates, and `recompute` below is the safety net
 * that makes that trade honest — if the counters ever drift, they can be
 * rebuilt from the source of truth.
 */
const READ_PROGRESS = `
  SELECT
    gp.*,
    (SELECT count(*) FROM memory_fragments)::int AS memories_total,
    -- Deliberately not stored: play time changes while nothing happens, so
    -- summing it on read is the only way it cannot go stale.
    COALESCE((
      SELECT sum(EXTRACT(EPOCH FROM (
        COALESCE(s.ended_at, s.last_activity_at) - s.started_at
      )))
      FROM sessions s
      WHERE s.player_id = gp.player_id
    ), 0)::int AS play_seconds
  FROM game_progress gp
  WHERE gp.player_id = $1
`;

export const progressModel = {
  async ensure(playerId: string): Promise<GameProgress> {
    await query(
      `INSERT INTO game_progress (player_id) VALUES ($1) ON CONFLICT (player_id) DO NOTHING`,
      [playerId]
    );
    const progress = await progressModel.find(playerId);
    if (!progress) throw new Error(`Could not create progress for player ${playerId}`);
    return progress;
  },

  async find(playerId: string): Promise<GameProgress | null> {
    const { rows } = await query<ProgressRow>(READ_PROGRESS, [playerId]);
    return rows[0] ? toProgress(rows[0]) : null;
  },

  /**
   * Applies increments and returns the new state.
   *
   * Completion is decided in the same statement as the counter it depends on,
   * so there is no window where every memory is recovered but the game does not
   * know it. Once set, `completed_at` is never moved.
   */
  async apply(playerId: string, changes: ProgressChanges): Promise<GameProgress> {
    await query(
      `UPDATE game_progress
       SET messages_sent     = messages_sent + $2,
           memories_restored = memories_restored + $3,
           sessions_started  = sessions_started + $4,
           highest_trust     = GREATEST(highest_trust, COALESCE($5, highest_trust)),
           current_chapter   = COALESCE($6, current_chapter),
           last_played_at    = now(),
           completed_at      = CASE
             WHEN completed_at IS NOT NULL THEN completed_at
             WHEN memories_restored + $3 >= (SELECT count(*) FROM memory_fragments) THEN now()
             ELSE NULL
           END
       WHERE player_id = $1`,
      [
        playerId,
        changes.messagesSent ?? 0,
        changes.memoriesRestored ?? 0,
        changes.sessionsStarted ?? 0,
        changes.trustLevel ?? null,
        changes.currentChapter ?? null,
      ]
    );

    const progress = await progressModel.find(playerId);
    if (!progress) throw new Error(`No progress row for player ${playerId}`);
    return progress;
  },

  /**
   * Rebuilds the rollup from the tables it summarises.
   *
   * This is the answer to "can we trust these counters": they are checked
   * against a recompute in the end-to-end suite, and if a bug ever does let
   * them drift, running this fixes it without data loss.
   */
  async recompute(playerId: string): Promise<GameProgress> {
    await query(
      `UPDATE game_progress gp
       SET memories_restored = source.memories_restored,
           messages_sent     = source.messages_sent,
           sessions_started  = source.sessions_started,
           highest_trust     = GREATEST(gp.highest_trust, source.trust_level),
           current_chapter   = source.current_chapter,
           completed_at      = CASE
             WHEN source.memories_restored >= source.memories_total
               THEN COALESCE(gp.completed_at, now())
             ELSE NULL
           END
       FROM (
         SELECT
           (SELECT count(*) FROM player_memories pm WHERE pm.player_id = $1)::int
             AS memories_restored,
           (SELECT count(*) FROM memory_fragments)::int AS memories_total,
           (SELECT count(*)
              FROM messages m
              JOIN conversations c ON c.id = m.conversation_id
             WHERE c.player_id = $1 AND m.sender = 'player')::int AS messages_sent,
           (SELECT count(*) FROM sessions s WHERE s.player_id = $1)::int AS sessions_started,
           COALESCE(
             (SELECT ep.trust_level FROM echo_personality ep WHERE ep.player_id = $1), 0
           )::int AS trust_level,
           ${CURRENT_CHAPTER_SQL}::int AS current_chapter
       ) source
       WHERE gp.player_id = $1`,
      [playerId]
    );

    const progress = await progressModel.find(playerId);
    if (!progress) throw new Error(`No progress row for player ${playerId}`);
    return progress;
  },

  /**
   * Awards every milestone the player has now earned, and returns only the ones
   * that were new.
   *
   * A single statement so the check and the insert cannot interleave: the
   * `ON CONFLICT` makes a concurrent second attempt award nothing, which is why
   * this is safe to call after every exchange.
   */
  async awardMilestones(
    playerId: string,
    metrics: { trust: number; memories: number; messages: number; chapter: number }
  ): Promise<PlayerMilestone[]> {
    const { rows } = await query<PlayerMilestoneRow>(
      `WITH earned AS (
         INSERT INTO player_milestones (player_id, milestone_id)
         SELECT $1, m.id
         FROM milestones m
         WHERE m.threshold <= CASE m.kind
           WHEN 'trust'    THEN $2::int
           WHEN 'memories' THEN $3::int
           WHEN 'messages' THEN $4::int
           WHEN 'chapter'  THEN $5::int
         END
         ON CONFLICT (player_id, milestone_id) DO NOTHING
         RETURNING milestone_id, achieved_at
       )
       SELECT m.*, earned.achieved_at
       FROM earned
       JOIN milestones m ON m.id = earned.milestone_id
       ORDER BY m.sort_order`,
      [playerId, metrics.trust, metrics.memories, metrics.messages, metrics.chapter]
    );
    return rows.map(toPlayerMilestone);
  },

  /** Every milestone, flagged with whether this player has it. */
  async listMilestones(playerId: string): Promise<PlayerMilestone[]> {
    const { rows } = await query<PlayerMilestoneRow>(
      `SELECT m.*, pm.achieved_at
       FROM milestones m
       LEFT JOIN player_milestones pm
         ON pm.milestone_id = m.id AND pm.player_id = $1
       ORDER BY m.sort_order`,
      [playerId]
    );
    return rows.map(toPlayerMilestone);
  },
};
