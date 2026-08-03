import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiRouter } from './routes/index.js';

/**
 * Builds the Express app without starting it, so tests can import and drive it
 * directly. Listening and Socket.io wiring happen in server.ts.
 */
export function createApp(): express.Express {
  const app = express();

  // Behind a proxy in production, so req.ip reflects the real client.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '64kb' }));
  app.use(requestLogger);

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
