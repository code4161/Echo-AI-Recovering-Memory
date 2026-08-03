import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { playerRoutes } from './player.routes.js';
import { sessionRoutes } from './session.routes.js';

/**
 * Mounts every route group under /api.
 *
 * The session router carries a router-level guard, so it must be mounted under
 * its own path prefix — otherwise that guard would also run for unmatched
 * routes and answer 401 where the client should see 404.
 */
export const apiRouter: Router = Router();

apiRouter.use(healthRoutes);
apiRouter.use(playerRoutes);
apiRouter.use('/session', sessionRoutes);
