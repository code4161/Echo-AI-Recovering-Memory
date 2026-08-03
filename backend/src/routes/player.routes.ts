import { Router } from 'express';
import { playerController } from '../controllers/player.controller.js';

/**
 * Public: these are the only endpoints reachable without a session, because
 * they are how a client obtains one.
 */
export const playerRoutes: Router = Router();

playerRoutes.post('/players', playerController.register);
playerRoutes.post('/players/:playerId/sessions', playerController.startSession);
