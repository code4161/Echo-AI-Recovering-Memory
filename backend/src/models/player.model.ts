import { query } from '../db/pool.js';
import type { Player, ProfileUpdate } from '../types/domain.js';
import { toPlayer, type PlayerRow } from './rows.js';

/**
 * Player profiles. Data access only — no game rules live in this file.
 *
 * Echo's feelings about a player are `personality.model.ts`; what they have
 * achieved is `progress.model.ts`. This file is only who they are.
 */
export const playerModel = {
  async create(input: { displayName: string; locale?: string; timeZone?: string | null }) {
    const { rows } = await query<PlayerRow>(
      `INSERT INTO players (display_name, locale, time_zone)
       VALUES ($1, COALESCE($2, 'en'), $3)
       RETURNING *`,
      [input.displayName, input.locale ?? null, input.timeZone ?? null]
    );
    return toPlayer(rows[0]!);
  },

  async findById(id: string): Promise<Player | null> {
    const { rows } = await query<PlayerRow>(`SELECT * FROM players WHERE id = $1`, [id]);
    return rows[0] ? toPlayer(rows[0]) : null;
  },

  async touch(id: string): Promise<void> {
    await query(`UPDATE players SET last_seen_at = now() WHERE id = $1`, [id]);
  },

  /**
   * Partial update. Every field is optional and `COALESCE` leaves the ones that
   * were not supplied alone, so a caller can change one thing without having to
   * read the row first and send it all back.
   *
   * `preferences` is merged rather than replaced (`||`), so two clients editing
   * different settings cannot clobber each other.
   */
  async updateProfile(id: string, patch: ProfileUpdate): Promise<Player | null> {
    const { rows } = await query<PlayerRow>(
      `UPDATE players
       SET display_name = COALESCE($2, display_name),
           pronouns     = CASE WHEN $3::boolean THEN $4 ELSE pronouns END,
           locale       = COALESCE($5, locale),
           time_zone    = CASE WHEN $6::boolean THEN $7 ELSE time_zone END,
           preferences  = preferences || COALESCE($8::jsonb, '{}'::jsonb)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        patch.displayName ?? null,
        // A flag is needed because null is a meaningful value here: "clear my
        // pronouns" and "leave them alone" are different requests.
        'pronouns' in patch,
        patch.pronouns ?? null,
        patch.locale ?? null,
        'timeZone' in patch,
        patch.timeZone ?? null,
        patch.preferences ? JSON.stringify(patch.preferences) : null,
      ]
    );
    return rows[0] ? toPlayer(rows[0]) : null;
  },
};
