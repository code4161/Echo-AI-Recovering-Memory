type Level = 'debug' | 'info' | 'warn' | 'error';

const RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function threshold(): number {
  const configured = process.env['LOG_LEVEL'] as Level | undefined;
  if (configured && configured in RANK) return RANK[configured];
  return process.env['NODE_ENV'] === 'production' ? RANK.info : RANK.debug;
}

const MINIMUM = threshold();

function emit(level: Level, message: string, meta?: unknown) {
  if (RANK[level] < MINIMUM) return;

  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  if (meta === undefined) {
    console[level === 'debug' ? 'log' : level](line);
  } else {
    console[level === 'debug' ? 'log' : level](line, meta);
  }
}

// Deliberately tiny. Swap the body for pino/winston without touching callers.
export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
