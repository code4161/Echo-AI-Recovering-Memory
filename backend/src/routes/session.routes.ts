import { Router } from 'express';
import { chatController } from '../controllers/chat.controller.js';
import { memoryController } from '../controllers/memory.controller.js';
import { profileController } from '../controllers/profile.controller.js';
import { progressController } from '../controllers/progress.controller.js';
import { sessionController } from '../controllers/session.controller.js';
import { requireSession } from '../middleware/requireSession.js';

/**
 * Everything that acts on behalf of a player. Mounted at /api/session.
 *
 * The guard is applied to the whole router rather than per route, so an
 * endpoint added here is protected by default instead of by remembering. That
 * is also why this router is mounted under a path prefix: a router-level
 * `use()` runs for every request that reaches it, so mounting it at the API
 * root would turn unknown routes into 401s instead of 404s.
 */
export const sessionRoutes: Router = Router();

sessionRoutes.use(requireSession);

sessionRoutes.get('/', sessionController.current);
sessionRoutes.delete('/', sessionController.end);

sessionRoutes.get('/profile', profileController.current);
sessionRoutes.patch('/profile', profileController.update);

sessionRoutes.get('/messages', chatController.history);
sessionRoutes.post('/messages', chatController.send);

sessionRoutes.get('/memories', memoryController.journal);

sessionRoutes.get('/progress', progressController.summary);
sessionRoutes.get('/personality', progressController.personality);
