import type { Request, Response } from 'express';
import { sessionContext } from '../middleware/requireSession.js';
import { personalityModel } from '../models/personality.model.js';
import { progressModel } from '../models/progress.model.js';

/** How many personality events a debugging view gets by default. */
const EVENT_LIMIT = 50;

export const progressController = {
  /** Counters and awards. */
  async summary(req: Request, res: Response): Promise<void> {
    const { player } = sessionContext(req);

    const [progress, milestones] = await Promise.all([
      progressModel.ensure(player.id),
      progressModel.listMilestones(player.id),
    ]);

    res.json({ progress, milestones });
  },

  /**
   * Echo's current personality and the recent history of how it changed.
   *
   * This is a window onto the audit log rather than something the game reads:
   * it answers "why is she like this", which is otherwise unanswerable once the
   * personality row has been overwritten.
   */
  async personality(req: Request, res: Response): Promise<void> {
    const { player } = sessionContext(req);

    const [echo, events] = await Promise.all([
      personalityModel.ensure(player.id),
      personalityModel.listEvents(player.id, EVENT_LIMIT),
    ]);

    res.json({ echo, events });
  },
};
