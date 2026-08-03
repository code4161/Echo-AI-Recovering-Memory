import { config } from '@/config';
import { NetworkError } from '@/lib/api';
import { openOfflineConnection } from './offlineConnection';
import { openSocketConnection } from './socketConnection';
import type { GameEvents, OpenResult, StartIntent } from './types';

/**
 * Chooses how to play and starts it.
 *
 * The backend is preferred, because it is authoritative. Two rules keep the
 * fallback honest:
 *
 * 1. Only a `NetworkError` — the server being absent — triggers it. A server
 *    that answers and *refuses* is a real error, so it propagates instead of
 *    being papered over.
 * 2. Only a brand new game falls back. Resuming a server game offline would
 *    show the player a different conversation than the one they left; their
 *    progress is on the server, so the right answer is to say it is
 *    unreachable and let them retry.
 */
export async function openGame(intent: StartIntent, events: GameEvents): Promise<OpenResult> {
  const savedOffline = intent.type === 'resume' && intent.identity.mode === 'offline';

  if (config.forceOffline || savedOffline) {
    return openOfflineConnection(intent, events);
  }

  try {
    return await openSocketConnection(intent, events);
  } catch (error) {
    if (!(error instanceof NetworkError) || intent.type !== 'new') throw error;

    console.warn('[echo] backend unreachable, falling back to offline play');
    return openOfflineConnection(intent, events);
  }
}

export type {
  ConnectionStatus,
  GameConnection,
  GameEvents,
  GameMode,
  SavedIdentity,
  StartIntent,
} from './types';
