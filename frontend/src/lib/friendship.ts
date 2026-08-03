export interface FriendshipLevel {
  name: string;
  /** Inclusive lower bound of the trust range, 0–100. */
  min: number;
  blurb: string;
}

/**
 * Trust is one 0–100 number; these bands give it a human name so the meter
 * reads as a relationship rather than a statistic.
 */
export const FRIENDSHIP_LEVELS: readonly FriendshipLevel[] = [
  { name: 'Stranger', min: 0, blurb: 'Echo is not sure who you are yet.' },
  { name: 'Familiar', min: 20, blurb: 'Echo recognises your voice now.' },
  { name: 'Friend', min: 40, blurb: 'Echo looks forward to you being here.' },
  { name: 'Confidant', min: 60, blurb: 'Echo tells you things they tell no one.' },
  { name: 'Kindred', min: 85, blurb: 'Echo would know you anywhere.' },
] as const;

export function friendshipFor(trust: number): FriendshipLevel {
  const clamped = Math.max(0, Math.min(100, trust));
  let current = FRIENDSHIP_LEVELS[0]!;

  for (const level of FRIENDSHIP_LEVELS) {
    if (clamped >= level.min) current = level;
  }

  return current;
}

/** The next band up, or null once the player has reached the top. */
export function nextFriendshipLevel(trust: number): FriendshipLevel | null {
  return FRIENDSHIP_LEVELS.find((level) => level.min > Math.max(0, trust)) ?? null;
}
