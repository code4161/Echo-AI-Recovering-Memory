import { query } from '../db/pool.js';
import type { MemoryChapter, MemoryFragment, PlayerMemory } from '../types/domain.js';
import {
  toChapter,
  toFragment,
  toPlayerMemory,
  type ChapterRow,
  type FragmentRow,
  type PlayerMemoryRow,
} from './rows.js';

/**
 * Echo's memories: the authored catalogue, and who has recovered what.
 *
 * `memory_chapters` and `memory_fragments` are content — identical for every
 * player, written in `database/seeds/`. `player_memories` is progress.
 *
 * Every fragment read joins its chapter, because the chapter number is part of
 * the fragment's identity to everyone outside this file.
 */
const FRAGMENT_COLUMNS = `
  f.id, f.slug, f.title, f.content, f.emotion,
  f.chapter_id, c.number AS chapter_number,
  f.unlock_order, f.required_trust
`;

/**
 * The chapter a player is working through: the earliest one they still owe a
 * memory to, or the last chapter once they owe none. `$1` is the player id.
 *
 * Shared with `progress.model.ts` so the rollup and the recompute cannot
 * disagree about what chapter someone is on.
 */
export const CURRENT_CHAPTER_SQL = `
  COALESCE(
    (SELECT min(c.number)
       FROM memory_fragments f
       JOIN memory_chapters c ON c.id = f.chapter_id
       LEFT JOIN player_memories pm
         ON pm.fragment_id = f.id AND pm.player_id = $1
      WHERE pm.fragment_id IS NULL),
    (SELECT max(number) FROM memory_chapters),
    1
  )
`;

export const memoryModel = {
  async listChapters(): Promise<MemoryChapter[]> {
    const { rows } = await query<ChapterRow>(`SELECT * FROM memory_chapters ORDER BY number`);
    return rows.map(toChapter);
  },

  /** Every fragment, flagged with whether this player has recovered it. */
  async listForPlayer(playerId: string): Promise<PlayerMemory[]> {
    const { rows } = await query<PlayerMemoryRow>(
      `SELECT ${FRAGMENT_COLUMNS}, pm.restored_at, pm.triggered_by_message_id
       FROM memory_fragments f
       JOIN memory_chapters c ON c.id = f.chapter_id
       LEFT JOIN player_memories pm
         ON pm.fragment_id = f.id AND pm.player_id = $1
       ORDER BY c.number, f.unlock_order`,
      [playerId]
    );
    return rows.map(toPlayerMemory);
  },

  /**
   * The next fragment this player has earned but not yet recovered.
   *
   * Ordered by chapter then unlock order, so a large jump in trust still
   * surfaces the earliest owed memory first and the story stays in sequence.
   */
  async findNextUnlockable(playerId: string, trustLevel: number): Promise<MemoryFragment | null> {
    const { rows } = await query<FragmentRow>(
      `SELECT ${FRAGMENT_COLUMNS}
       FROM memory_fragments f
       JOIN memory_chapters c ON c.id = f.chapter_id
       LEFT JOIN player_memories pm
         ON pm.fragment_id = f.id AND pm.player_id = $1
       WHERE pm.fragment_id IS NULL AND f.required_trust <= $2
       ORDER BY c.number, f.unlock_order
       LIMIT 1`,
      [playerId, trustLevel]
    );
    return rows[0] ? toFragment(rows[0]) : null;
  },

  /**
   * Records a recovery, along with the line that caused it.
   *
   * Returns false if the row already existed, so a caller cannot double-count
   * progress by retrying.
   */
  async markRestored(input: {
    playerId: string;
    fragmentId: string;
    conversationId: string | null;
    triggeredByMessageId: string | null;
  }): Promise<boolean> {
    const { rowCount } = await query(
      `INSERT INTO player_memories
         (player_id, fragment_id, conversation_id, triggered_by_message_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (player_id, fragment_id) DO NOTHING`,
      [input.playerId, input.fragmentId, input.conversationId, input.triggeredByMessageId]
    );
    return (rowCount ?? 0) > 0;
  },

  async countAll(): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM memory_fragments`
    );
    return Number(rows[0]?.count ?? 0);
  },

  async currentChapterFor(playerId: string): Promise<number> {
    const { rows } = await query<{ number: number }>(
      `SELECT ${CURRENT_CHAPTER_SQL} AS number`,
      [playerId]
    );
    return rows[0]?.number ?? 1;
  },
};
