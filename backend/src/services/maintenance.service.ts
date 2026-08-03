import { gameConfig } from '../config/game.js';
import { logger } from '../utils/logger.js';
import { gameStateService } from './gameState.service.js';
import { sessionService } from './session.service.js';

let timer: NodeJS.Timeout | null = null;

/**
 * Background housekeeping: closes abandoned sessions and drops their cached
 * state. Without this, a player who closes the tab mid-conversation would keep
 * an open session row and a cache entry forever.
 */
export const maintenanceService = {
  start(): void {
    if (timer) return;

    timer = setInterval(() => {
      void maintenanceService.runOnce();
    }, gameConfig.session.sweepIntervalMs);

    // Housekeeping must never hold the process open on shutdown.
    timer.unref();
    logger.info('maintenance sweeper started');
  },

  async runOnce(): Promise<void> {
    try {
      const closed = await sessionService.sweepIdle();
      for (const sessionId of closed) {
        gameStateService.invalidate(sessionId);
      }
      gameStateService.sweep();
    } catch (error) {
      logger.error('maintenance sweep failed', error);
    }
  },

  stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  },
};
