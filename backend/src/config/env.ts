import 'dotenv/config';

/**
 * Environment access is centralised here so the rest of the codebase never
 * touches process.env directly and the app fails fast on a bad config.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '4000')),
  databaseUrl: required('DATABASE_URL'),
  clientOrigin: optional('CLIENT_ORIGIN', 'http://localhost:5173'),
  ai: {
    provider: optional('AI_PROVIDER', 'stub'),
    apiKey: process.env['AI_API_KEY'] ?? '',
  },
} as const;

export const isProduction = env.nodeEnv === 'production';
