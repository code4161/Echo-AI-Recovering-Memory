import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config/env.js';
import { isAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No route for ${req.method} ${req.originalUrl}` },
  });
}

/**
 * The single place an error becomes a response.
 * Must keep four parameters — that is how Express recognises an error handler.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = isAppError(error) ? error.status : 500;
  const code = isAppError(error) ? error.code : 'internal_error';
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (status >= 500) {
    logger.error('Unhandled request error', error);
  }

  res.status(status).json({
    error: {
      code,
      // Internal failures never leak their message in production.
      message: status >= 500 && isProduction ? 'Internal server error' : message,
    },
  });
}
