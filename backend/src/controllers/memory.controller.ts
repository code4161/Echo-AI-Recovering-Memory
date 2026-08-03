import type { Request, Response } from 'express';
import { sessionContext } from '../middleware/requireSession.js';
import { memoryService } from '../services/memory.service.js';

export const memoryController = {
  async journal(req: Request, res: Response): Promise<void> {
    const { player } = sessionContext(req);
    res.json(await memoryService.journal(player.id));
  },
};
