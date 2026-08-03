import { MILESTONES } from '@/data/memories';
import type {
  Emotion,
  Milestone,
  PlayerMilestone,
  TraitDeltas,
  TraitScores,
} from '@/types/domain';

/**
 * The server's rules, reimplemented for offline play.
 *
 * This mirrors `backend/src/config/game.ts` and
 * `backend/src/services/personality.rules.ts`. Keeping a copy is the price of
 * a game that works with no network: the two must agree, or a player's trust
 * and awards would change meaning the first time they connect.
 */
export const OFFLINE_RULES = {
  trust: { min: 0, max: 100, maxDeltaPerExchange: 10 },
  personality: { min: 0, max: 100, maxDriftPerExchange: 2 },
} as const;

export const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)));

const BY_EMOTION: Record<Emotion, TraitDeltas> = {
  happy: { warmth: 1, playfulness: 1 },
  curious: { curiosity: 1 },
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

  if (trustApplied > 0) add(drift, { openness: 1, warmth: 1 });
  else if (trustApplied < 0) add(drift, { openness: -1, warmth: -1 });

  const { maxDriftPerExchange } = OFFLINE_RULES.personality;

  for (const trait of Object.keys(drift) as (keyof TraitScores)[]) {
    const value = clampInt(drift[trait] ?? 0, -maxDriftPerExchange, maxDriftPerExchange);
    if (value === 0) delete drift[trait];
    else drift[trait] = value;
  }

  return drift;
}

export function applyDrift(traits: TraitScores, drift: TraitDeltas): TraitScores {
  const { min, max } = OFFLINE_RULES.personality;
  const next: TraitScores = { ...traits };

  for (const [key, delta] of Object.entries(drift) as [keyof TraitScores, number][]) {
    next[key] = clampInt(next[key] + delta, min, max);
  }

  return next;
}

const metricFor = (
  milestone: Milestone,
  metrics: { trust: number; memories: number; messages: number; chapter: number }
): number => metrics[milestone.kind];

/** Milestones now earned that were not already awarded. */
export function newlyEarned(
  awardedSlugs: readonly string[],
  metrics: { trust: number; memories: number; messages: number; chapter: number }
): PlayerMilestone[] {
  const achievedAt = new Date().toISOString();

  return MILESTONES.filter(
    (milestone) =>
      !awardedSlugs.includes(milestone.slug) && milestone.threshold <= metricFor(milestone, metrics)
  ).map((milestone) => ({ ...milestone, achieved: true, achievedAt }));
}

/** Every milestone, flagged — the offline equivalent of the progress query. */
export function allMilestones(awardedSlugs: readonly string[]): PlayerMilestone[] {
  return MILESTONES.map((milestone) => ({
    ...milestone,
    achieved: awardedSlugs.includes(milestone.slug),
    achievedAt: null,
  }));
}
