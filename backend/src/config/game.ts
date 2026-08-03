/**
 * Tunable game rules.
 *
 * Anything a designer might want to change without reading TypeScript lives
 * here rather than being scattered through the services as magic numbers.
 */
export const gameConfig = {
  session: {
    /** A session left untouched this long is no longer resumable. */
    idleTimeoutMs: 30 * 60 * 1000,
    /** How often the sweeper closes abandoned sessions. */
    sweepIntervalMs: 5 * 60 * 1000,
  },

  state: {
    /** How long a loaded snapshot stays in the in-process cache. */
    cacheTtlMs: 10 * 60 * 1000,
    /** Hard ceiling on cached sessions, so memory cannot grow unbounded. */
    maxCachedSessions: 500,
  },

  chat: {
    maxMessageLength: 300,
    /** Messages kept in a snapshot and handed to the AI layer as context. */
    historyWindow: 40,
  },

  trust: {
    min: 0,
    max: 100,
    /** Clamp on a single exchange, so no one line can swing the relationship. */
    maxDeltaPerExchange: 10,
  },

  personality: {
    min: 0,
    max: 100,
    /**
     * Traits are character, not mood: they should take a whole conversation to
     * shift, not one good line. Kept well below the trust clamp on purpose.
     */
    maxDriftPerExchange: 2,
  },

  pacing: {
    /** Echo "thinks" for a moment before answering; feels alive, not instant. */
    minThinkingMs: 550,
    maxThinkingMs: 2200,
    msPerCharacter: 11,
  },
} as const;
