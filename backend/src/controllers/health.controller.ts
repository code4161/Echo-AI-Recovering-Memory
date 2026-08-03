import type { Request, Response } from 'express';
import { verifyConnection } from '../db/pool.js';
import { echoProvider } from '../services/echo/index.js';
import { gameStateService } from '../services/gameState.service.js';

export const healthController = {
  /** Liveness: is the process up. Cheap enough for a load balancer to poll. */
  live(_req: Request, res: Response): void {
    res.json({ status: 'ok', uptime: process.uptime() });
  },

  /** Readiness: can this instance actually serve traffic. */
  async ready(_req: Request, res: Response): Promise<void> {
    try {
      await verifyConnection();
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'down' });
      return;
    }

    res.json({
      status: 'ok',
      database: 'up',
      aiProvider: echoProvider().name,
      ...gameStateService.stats(),
    });
  },
};
