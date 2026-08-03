import { query, transaction } from '../db/pool.js';
import type { Emotion, Message, MessageSender } from '../types/domain.js';
import { toMessage, type ConversationRow, type MessageRow } from './rows.js';

export interface AppendInput {
  conversationId: string;
  /** The visit this was said in, for provenance. */
  sessionId: string | null;
  sender: MessageSender;
  content: string;
  emotion?: Emotion;
  trustDelta?: number;
}

/**
 * The transcript. Append-only by design: it is the record of what happened, and
 * the material the AI layer reads back as context.
 */
export const messageModel = {
  /**
   * Appends a line and gives it the next position in the thread.
   *
   * The two writes are one transaction because `seq` comes from the
   * conversation's counter: the `UPDATE` takes a row lock, so two appends to
   * the same thread are serialised and can never be handed the same position.
   * Doing it with `max(seq) + 1` instead would race.
   */
  async append(input: AppendInput): Promise<Message> {
    return transaction(async (client) => {
      const counter = await client.query<Pick<ConversationRow, 'message_count'>>(
        `UPDATE conversations
         SET message_count = message_count + 1, last_message_at = now()
         WHERE id = $1
         RETURNING message_count`,
        [input.conversationId]
      );

      const seq = counter.rows[0]?.message_count;
      if (seq === undefined) {
        throw new Error(`Cannot append to unknown conversation ${input.conversationId}`);
      }

      const { rows } = await client.query<MessageRow>(
        `INSERT INTO messages
           (conversation_id, session_id, seq, sender, content, emotion, trust_delta)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.conversationId,
          input.sessionId,
          seq,
          input.sender,
          input.content,
          input.emotion ?? 'neutral',
          input.trustDelta ?? 0,
        ]
      );

      return toMessage(rows[0]!);
    });
  },

  /**
   * The tail of the thread, oldest first.
   *
   * Ordering is by `seq`, not `created_at`: a reply can share a timestamp with
   * the line it answers, and the old tiebreaker was a random uuid.
   */
  async listRecent(conversationId: string, limit: number): Promise<Message[]> {
    const { rows } = await query<MessageRow>(
      `SELECT * FROM (
         SELECT * FROM messages
         WHERE conversation_id = $1
         ORDER BY seq DESC
         LIMIT $2
       ) recent
       ORDER BY seq ASC`,
      [conversationId, limit]
    );
    return rows.map(toMessage);
  },

  async countByConversation(conversationId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM messages WHERE conversation_id = $1`,
      [conversationId]
    );
    return Number(rows[0]?.count ?? 0);
  },
};
