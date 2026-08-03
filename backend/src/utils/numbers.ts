export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Rounds and clamps in one step; trust is always a whole percentage. */
export function clampInt(value: number, min: number, max: number): number {
  return clamp(Math.round(value), min, max);
}
