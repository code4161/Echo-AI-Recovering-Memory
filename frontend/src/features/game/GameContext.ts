import type { FriendshipLevel } from '@/lib/friendship';
import type { MemoryFragment, PlayerMilestone } from '@/types/domain';
import { createContext } from 'react';
import type { GameState } from './gameState';

export interface GameContextValue {
  state: GameState;
  friendship: FriendshipLevel;
  /** True once a game is in progress, so the game screen should render. */
  started: boolean;
  /** True while a message cannot be sent: connecting, or Echo is answering. */
  busy: boolean;
  celebration: MemoryFragment | null;
  /** Newly earned award, held back until any memory has been celebrated. */
  award: PlayerMilestone | null;

  start: (displayName: string) => void;
  send: (content: string) => void;
  retry: () => void;
  reset: () => void;
  dismissCelebration: () => void;
  dismissAward: () => void;
}

// Separate module from the provider so Fast Refresh keeps working.
export const GameContext = createContext<GameContextValue | undefined>(undefined);
