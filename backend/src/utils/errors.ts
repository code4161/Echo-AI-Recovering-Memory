/**
 * Errors a service throws on purpose, carrying the HTTP status the API should
 * answer with. Anything else that escapes is treated as a 500.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'bad_request'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string) => new AppError(message, 400, 'bad_request');
export const unauthorized = (message: string) => new AppError(message, 401, 'unauthorized');
export const notFound = (message: string) => new AppError(message, 404, 'not_found');
export const unprocessable = (message: string) => new AppError(message, 422, 'unprocessable');
export const gone = (message: string) => new AppError(message, 410, 'gone');

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
