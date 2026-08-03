import { startServer } from './server.js';
import { logger } from './utils/logger.js';

/**
 * Process entry point. Its only job is to start the server and make sure a
 * failure is loud rather than a silent unhandled rejection.
 */
startServer().catch((error: unknown) => {
  logger.error('failed to start echo backend', error);
  process.exit(1);
});
