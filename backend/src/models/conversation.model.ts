import { query } from '../db/pool.js';
import type { Conversation } from '../types/domain.js';
import { toConversation, type ConversationRow } from './rows.js';

/**
 * The thread with Echo.
 *
 * A conversation outlives sessions: the player can leave and come back a week
 * later and still be in the same one. Ending it is what starts Echo over.
 */
export const conversationModel = {
  /**
   * The player's open thread, creating it on first contact.
   *
   * `ON CONFLICT` targets the partial unique index from migration 004, so two
   * simultaneous connections cannot open two threads — the loser of the race
   * gets the winner's row instead of an error.
   */
  async ensureActive(playerId: string): Promise<Conversation> {
    const { rows } = await query<ConversationRow>(
      `INSERT INTO conversations (player_id) VALUES ($1)
       ON CONFLICT (player_id) WHERE ended_at IS NULL
       DO UPDATE SET player_id = EXCLUDED.player_id
       RETURNING *`,
      [playerId]
    );
    return toConversation(rows[0]!);
  },

  async findById(id: string): Promise<Conversation | null> {
    const { rows } = await query<ConversationRow>(`SELECT * FROM conversations WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? toConversation(rows[0]) : null;
  },

  async findActiveByPlayer(playerId: string): Promise<Conversation | null> {
    const { rows } = await query<ConversationRow>(
      `SELECT * FROM conversations WHERE player_id = $1 AND ended_at IS NULL`,
      [playerId]
    );
    return rows[0] ? toConversation(rows[0]) : null;
  },

  /** Closes the thread. The next `ensureActive` starts a fresh one. */
  async end(id: string): Promise<void> {
    await query(`UPDATE conversations SET ended_at = now() WHERE id = $1 AND ended_at IS NULL`, [
      id,
    ]);
  },
};
