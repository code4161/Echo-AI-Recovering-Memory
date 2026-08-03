import type { Request } from 'express';
import { unprocessable } from './errors.js';

/**
 * Express 5 types a route param as `string | string[]` because of wildcard
 * routes. Controllers need a plain string, so narrowing happens once here.
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];

  if (typeof value !== 'string' || value.length === 0) {
    throw unprocessable(`${name} is required`);
  }

  return value;
}

/** Reads a required string from a JSON body, with length limits applied. */
export function requireBodyString(
  req: Request,
  name: string,
  options: { max: number; min?: number }
): string {
  const body = req.body as Record<string, unknown> | undefined;
  const value = body?.[name];

  if (typeof value !== 'string') {
    throw unprocessable(`${name} must be a string`);
  }

  const trimmed = value.trim();
  const min = options.min ?? 1;

  if (trimmed.length < min) {
    throw unprocessable(`${name} must be at least ${min} character(s)`);
  }

  if (trimmed.length > options.max) {
    throw unprocessable(`${name} must be at most ${options.max} characters`);
  }

  return trimmed;
}
