type EnvBag = Record<string, string | undefined>;

/**
 * Vite injects `import.meta.env` when it does the loading. Falling back to
 * `process.env` keeps this module importable from plain Node tooling, such as
 * the integration check in `scripts/`, where Vite is not involved.
 */
const source: EnvBag =
  (import.meta as unknown as { env?: EnvBag }).env ??
  (globalThis as unknown as { process?: { env: EnvBag } }).process?.env ??
  {};

/**
 * Client configuration.
 *
 * Both URLs default to empty, meaning "same origin". In development Vite
 * proxies `/api` and `/socket.io` to the backend, so the app stays same-origin
 * and never deals with CORS in the browser.
 */
export const config = {
  apiUrl: source['VITE_API_URL'] ?? '',
  socketUrl: source['VITE_SOCKET_URL'] ?? '',

  /** Set VITE_OFFLINE=true to skip the server entirely and play locally. */
  forceOffline: source['VITE_OFFLINE'] === 'true',

  /** How long to wait for the backend before falling back to offline play. */
  bootstrapTimeoutMs: 4000,
} as const;
