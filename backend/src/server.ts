import { createServer, type Server as HttpServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool, verifyConnection } from './db/pool.js';
import { echoProvider } from './services/echo/index.js';
import { maintenanceService } from './services/maintenance.service.js';
import { createSocketServer, type EchoIoServer } from './sockets/index.js';
import { logger } from './utils/logger.js';

export interface RunningServer {
  httpServer: HttpServer;
  io: EchoIoServer;
  stop: () => Promise<void>;
}

export async function startServer(): Promise<RunningServer> {
  await verifyConnection();
  logger.info('database connection established');

  // Resolved eagerly so a bad AI_PROVIDER fails at boot, not mid-conversation.
  logger.info(`ai provider: ${echoProvider().name}`);

  const httpServer = createServer(createApp());
  const io = createSocketServer(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(env.port, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  maintenanceService.start();
  logger.info(`echo backend listening on http://localhost:${env.port}`);

  let stopping = false;

  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;

    maintenanceService.stop();
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await closePool();
    logger.info('shutdown complete');
  };

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    stop()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error('shutdown failed', error);
        process.exit(1);
      });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { httpServer, io, stop };
}
