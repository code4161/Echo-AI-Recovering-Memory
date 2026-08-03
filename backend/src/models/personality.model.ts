import { query } from '../db/pool.js';
import type {
  EchoPersonality,
  Emotion,
  PersonalityEvent,
  TraitDeltas,
  TraitScores,
} from '../types/domain.js';
import {
  toPersonality,
  toPersonalityEvent,
  type PersonalityEventRow,
  type PersonalityRow,
} from './rows.js';

export interface PersonalitySave {
  trustLevel: number;
  mood: Emotion;
  traits: TraitScores;
}

export interface EventInput {
  playerId: string;
  conversationId: string | null;
  messageId: string | null;
  reason: string;
  trustBefore: number;
  trustAfter: number;
  trustRequested: number;
  moodBefore: Emotion;
  moodAfter: Emotion;
  traitDeltas: TraitDeltas;
}

/**
 * Echo's personality, and the log of how it got that way.
 *
 * Values written here are absolute, never deltas: the service has already
 * clamped them, which keeps every write idempotent and means a retry cannot
 * double-apply a trust change.
 */
export const personalityModel = {
  /** Creates Echo's personality on first contact, or returns the existing row. */
  async ensure(playerId: string): Promise<EchoPersonality> {
    const { rows } = await query<PersonalityRow>(
      `INSERT INTO echo_personality (player_id) VALUES ($1)
       ON CONFLICT (player_id) DO UPDATE SET player_id = EXCLUDED.player_id
       RETURNING *`,
      [playerId]
    );
    return toPersonality(rows[0]!);
  },

  async find(playerId: string): Promise<EchoPersonality | null> {
    const { rows } = await query<PersonalityRow>(
      `SELECT * FROM echo_personality WHERE player_id = $1`,
      [playerId]
    );
    return rows[0] ? toPersonality(rows[0]) : null;
  },

  async save(playerId: string, next: PersonalitySave): Promise<EchoPersonality> {
    const { rows } = await query<PersonalityRow>(
      `UPDATE echo_personality
       SET trust_level = $2, mood = $3,
           warmth = $4, curiosity = $5, playfulness = $6, openness = $7
       WHERE player_id = $1
       RETURNING *`,
      [
        playerId,
        next.trustLevel,
        next.mood,
        next.traits.warmth,
        next.traits.curiosity,
        next.traits.playfulness,
        next.traits.openness,
      ]
    );
    return toPersonality(rows[0]!);
  },

  /** Records why the personality changed. Append-only. */
  async recordEvent(input: EventInput): Promise<PersonalityEvent> {
    const { rows } = await query<PersonalityEventRow>(
      `INSERT INTO personality_events (
         player_id, conversation_id, message_id, reason,
         trust_before, trust_after, trust_requested,
         mood_before, mood_after, trait_deltas
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING *`,
      [
        input.playerId,
        input.conversationId,
        input.messageId,
        input.reason,
        input.trustBefore,
        input.trustAfter,
        input.trustRequested,
        input.moodBefore,
        input.moodAfter,
        JSON.stringify(input.traitDeltas),
      ]
    );
    return toPersonalityEvent(rows[0]!);
  },

  /** Most recent first — this is read for debugging and tuning, not gameplay. */
  async listEvents(playerId: string, limit: number): Promise<PersonalityEvent[]> {
    const { rows } = await query<PersonalityEventRow>(
      `SELECT * FROM personality_events
       WHERE player_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [playerId, limit]
    );
    return rows.map(toPersonalityEvent);
  },
};
