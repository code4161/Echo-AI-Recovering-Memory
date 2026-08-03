export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function isOlderThan(timestamp: Date | string, ageMs: number): boolean {
  const value = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return Date.now() - value.getTime() > ageMs;
}
