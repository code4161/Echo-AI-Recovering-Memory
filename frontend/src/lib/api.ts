import { config } from '@/config';
import type { GameSnapshot } from '@/types/domain';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when the backend cannot be reached at all, as opposed to refusing. */
export class NetworkError extends Error {
  constructor(message = 'Cannot reach the server') {
    super(message);
    this.name = 'NetworkError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  sessionId?: string;
  timeoutMs?: number;
}

/**
 * The only place the client performs HTTP.
 *
 * REST is used purely to bootstrap: create a player, open a session. Once a
 * session exists, everything else happens over the socket.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, sessionId, timeoutMs = config.bootstrapTimeoutMs } = options;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId ? { Authorization: `Session ${sessionId}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch {
    // Aborted, DNS failure, connection refused: the server is simply not there.
    throw new NetworkError();
  } finally {
    window.clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? `Request failed with ${response.status}`,
      response.status,
      payload?.error?.code ?? 'unknown'
    );
  }

  return payload as T;
}

export const api = {
  /** Creates a player and opens their first session. */
  createPlayer: (displayName: string) =>
    request<GameSnapshot>('/players', { method: 'POST', body: { displayName } }),

  /** Starts or resumes a session for a player who already exists. */
  startSession: (playerId: string) =>
    request<GameSnapshot>(`/players/${playerId}/sessions`, { method: 'POST' }),

  /** Current snapshot for an existing session. Used to validate a saved id. */
  getSession: (sessionId: string) => request<GameSnapshot>('/session', { sessionId }),

  endSession: (sessionId: string) =>
    request<void>('/session', { method: 'DELETE', sessionId }),
};
