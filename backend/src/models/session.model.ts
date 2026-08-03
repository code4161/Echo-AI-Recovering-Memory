import { query } from '../db/pool.js';
import type { Session, SessionEndReason } from '../types/domain.js';
import { toSession, type SessionRow } from './rows.js';

/**
 * Session rows: one continuous play period per row.
 *
 * A partial unique index in migration 002 guarantees a player can only ever
 * have one open session, so `create` relies on the database for that rule
 * rather than a check-then-insert race in application code.
 */
export const sessionModel = {
  async create(playerId: string): Promise<Session> {
    const { rows } = await query<SessionRow>(
      `INSERT INTO sessions (player_id) VALUES ($1) RETURNING *`,
      [playerId]
    );
    return toSession(rows[0]!);
  },

  async findById(id: string): Promise<Session | null> {
    const { rows } = await query<SessionRow>(`SELECT * FROM sessions WHERE id = $1`, [id]);
    return rows[0] ? toSession(rows[0]) : null;
  },

  async findOpenByPlayer(playerId: string): Promise<Session | null> {
    const { rows } = await query<SessionRow>(
      `SELECT * FROM sessions WHERE player_id = $1 AND ended_at IS NULL`,
      [playerId]
    );
    return rows[0] ? toSession(rows[0]) : null;
  },

  /** Marks the session as alive. Called on every player action. */
  async touch(id: string): Promise<void> {
    await query(
      `UPDATE sessions SET last_activity_at = now() WHERE id = $1 AND ended_at IS NULL`,
      [id]
    );
  },

  async close(id: string, reason: SessionEndReason = 'player'): Promise<void> {
    await query(
      `UPDATE sessions SET ended_at = now(), ended_reason = $2
       WHERE id = $1 AND ended_at IS NULL`,
      [id, reason]
    );
  },

  /** Closes sessions abandoned for longer than the idle timeout. */
  async closeIdle(idleMs: number): Promise<string[]> {
    const { rows } = await query<{ id: string }>(
      `UPDATE sessions
       SET ended_at = now(), ended_reason = 'idle'
       WHERE ended_at IS NULL
         AND last_activity_at < now() - ($1::bigint * interval '1 millisecond')
       RETURNING id`,
      [Math.round(idleMs)]
    );
    return rows.map((row) => row.id);
  },
};
