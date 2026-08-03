import { api } from '@/lib/api';
import { friendshipFor } from '@/lib/friendship';
import { clearAllProgress, identityStore } from '@/lib/storage';
import { openGame } from '@/services/game';
import type { GameConnection, GameEvents, StartIntent } from '@/services/game/types';
import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { GameContext, type GameContextValue } from './GameContext';
import { gameReducer, initialGameState, type GameState } from './gameState';

function initialise(): GameState {
  // Rendering the game screen straight away on reload avoids a flash of the
  // title screen before the saved session is restored.
  return { ...initialGameState, active: identityStore.load() !== null };
}

/**
 * Owns the connection and turns its events into state.
 *
 * Everything below this component reads state and calls actions. Nothing else
 * knows whether the game is being refereed by the server or by the browser.
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialise);

  const connection = useRef<GameConnection | null>(null);
  const opening = useRef(false);

  const events = useMemo<GameEvents>(
    () => ({
      mode: (mode) => dispatch({ type: 'mode', mode }),
      snapshot: (snapshot) => dispatch({ type: 'snapshot', snapshot }),
      message: (message) => dispatch({ type: 'message', message }),
      typing: (value) => dispatch({ type: 'typing', value }),
      echoState: (echo) => dispatch({ type: 'echo-state', state: echo }),
      memoryRestored: (fragment) => dispatch({ type: 'memory-restored', fragment }),
      progress: (progress) => dispatch({ type: 'progress', progress }),
      milestone: (milestone) => dispatch({ type: 'milestone', milestone }),
      status: (status, detail) =>
        dispatch({ type: 'status', status, ...(detail ? { detail } : {}) }),
      error: (error) => dispatch({ type: 'error', message: error.message }),
      // The session id can change mid-game when the server renews it.
      identity: (identity) => identityStore.save(identity),
    }),
    []
  );

  const open = useCallback(
    async (intent: StartIntent): Promise<void> => {
      if (opening.current) return;
      opening.current = true;

      connection.current?.close();
      connection.current = null;

      try {
        const result = await openGame(intent, events);
        connection.current = result.connection;
        identityStore.save(result.identity);
      } catch (error) {
        dispatch({
          type: 'error',
          message: error instanceof Error ? error.message : 'Could not reach Echo',
        });
        dispatch({ type: 'status', status: 'error' });
      } finally {
        opening.current = false;
      }
    },
    [events]
  );

  // Resume a saved game on load.
  useEffect(() => {
    const saved = identityStore.load();
    if (!saved) return;

    void open({ type: 'resume', identity: saved });

    return () => {
      connection.current?.close();
      connection.current = null;
    };
  }, [open]);

  const start = useCallback(
    (displayName: string) => {
      const name = displayName.trim();
      if (!name) return;

      dispatch({ type: 'begin' });
      void open({ type: 'new', displayName: name });
    },
    [open]
  );

  const send = useCallback((content: string) => {
    if (!content.trim() || !connection.current) return;

    // The player's own line comes back from the referee rather than being
    // rendered optimistically, so mark Echo busy now: it disables the composer
    // immediately instead of leaving a window for a second, rejected send.
    dispatch({ type: 'typing', value: true });
    connection.current.send(content);
  }, []);

  const retry = useCallback(() => {
    const saved = identityStore.load();

    // Nothing to resume means the very first connection failed, so the only
    // way forward is the title screen rather than a button that does nothing.
    if (!saved) {
      dispatch({ type: 'reset' });
      return;
    }

    dispatch({ type: 'status', status: 'connecting' });
    void open({ type: 'resume', identity: saved });
  }, [open]);

  const reset = useCallback(() => {
    const saved = identityStore.load();

    connection.current?.close();
    connection.current = null;

    // Tell the server the session is finished instead of leaving it for the
    // idle sweeper. Failure is harmless, so it is not awaited.
    if (saved?.mode === 'server') {
      void api.endSession(saved.sessionId).catch(() => undefined);
    }

    clearAllProgress();
    dispatch({ type: 'reset' });
  }, []);

  const dismissCelebration = useCallback(() => dispatch({ type: 'dismiss-celebration' }), []);
  const dismissAward = useCallback(() => dispatch({ type: 'dismiss-award' }), []);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      friendship: friendshipFor(state.trust),
      started: state.active,
      busy: state.thinking || state.status !== 'ready',
      celebration: state.celebration,
      // An award earned by the same exchange that recovered a memory waits its
      // turn, so the two never fight over the screen.
      award: state.celebration ? null : state.award,
      start,
      send,
      retry,
      reset,
      dismissCelebration,
      dismissAward,
    }),
    [state, start, send, retry, reset, dismissCelebration, dismissAward]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
