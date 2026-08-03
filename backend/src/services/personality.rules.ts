import { gameConfig } from '../config/game.js';
import type { Emotion, TraitDeltas, TraitScores } from '../types/domain.js';
import { clampInt } from '../utils/numbers.js';

/**
 * How Echo's character moves.
 *
 * Mood is what the AI provider returns and changes every message. Traits are
 * what she is like, and they are derived here rather than asked for, because a
 * provider that could set its own personality could also decide to become
 * whatever gets the best response.
 *
 * Everything in this file is pure, so the rules can be reasoned about and
 * tested without a database.
 */

/**
 * Mood says what just happened to her; the trust delta says whether it went
 * well. Together they nudge who she is becoming.
 */
const BY_EMOTION: Record<Emotion, TraitDeltas> = {
  happy: { warmth: 1, playfulness: 1 },
  curious: { curiosity: 1 },
  // Sadness she is willing to show is a form of opening up.
  sad: { openness: 1, playfulness: -1 },
  afraid: { openness: -1, warmth: -1 },
  nostalgic: { curiosity: 1, openness: 1 },
  neutral: {},
};

function add(into: TraitDeltas, deltas: TraitDeltas): void {
  for (const [trait, value] of Object.entries(deltas) as [keyof TraitScores, number][]) {
    into[trait] = (into[trait] ?? 0) + value;
  }
}

/** The trait movement implied by one exchange. */
export function driftFor(mood: Emotion, trustApplied: number): TraitDeltas {
  const drift: TraitDeltas = {};
  add(drift, BY_EMOTION[mood]);

  // Trust is the relationship; openness is her side of it.
  if (trustApplied > 0) add(drift, { openness: 1, warmth: 1 });
  else if (trustApplied < 0) add(drift, { openness: -1, warmth: -1 });

  const { maxDriftPerExchange } = gameConfig.personality;

  for (const trait of Object.keys(drift) as (keyof TraitScores)[]) {
    const value = clampInt(drift[trait] ?? 0, -maxDriftPerExchange, maxDriftPerExchange);
    if (value === 0) delete drift[trait];
    else drift[trait] = value;
  }

  return drift;
}

/**
 * Applies drift to current traits, clamped to range.
 *
 * Returns the traits *and* the deltas that actually landed, which differ from
 * the requested ones at the boundaries — a trait already at 100 cannot rise,
 * and the audit log should say so.
 */
export function applyDrift(
  traits: TraitScores,
  drift: TraitDeltas
): { traits: TraitScores; applied: TraitDeltas } {
  const { min, max } = gameConfig.personality;

  const next: TraitScores = { ...traits };
  const applied: TraitDeltas = {};

  for (const [key, delta] of Object.entries(drift) as [keyof TraitScores, number][]) {
    const before = next[key];
    const after = clampInt(before + delta, min, max);
    if (after === before) continue;

    next[key] = after;
    applied[key] = after - before;
  }

  return { traits: next, applied };
}
