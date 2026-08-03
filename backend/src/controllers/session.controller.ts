import type { Request, Response } from 'express';
import { sessionContext } from '../middleware/requireSession.js';
import { gameStateService } from '../services/gameState.service.js';
import { sessionService } from '../services/session.service.js';

/**
 * Operations on the caller's own session. Every route here sits behind
 * `requireSession`, so the session is known to exist and be open.
 */
export const sessionController = {
  /** The full game state: player, Echo, transcript, memories, progress. */
  async current(req: Request, res: Response): Promise<void> {
    const { session } = sessionContext(req);
    res.json(await sessionService.snapshot(session.id));
  },

  /** Ends the session deliberately, e.g. the player pressed "leave". */
  async end(req: Request, res: Response): Promise<void> {
    const { session } = sessionContext(req);

    await sessionService.end(session.id);
    gameStateService.invalidate(session.id);

    res.status(204).send();
  },
};
