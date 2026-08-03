import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));

export const databaseDir = resolve(here, '..');
export const repoRoot = resolve(here, '../..');

/**
 * Reads DATABASE_URL from the environment, falling back to backend/.env so the
 * scripts and the server always point at the same database.
 */
function resolveConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  try {
    const envFile = readFileSync(resolve(repoRoot, 'backend/.env'), 'utf8');
    const match = envFile.match(/^DATABASE_URL\s*=\s*(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    // No backend/.env yet; fall through to the error below.
  }

  throw new Error(
    'DATABASE_URL is not set. Copy backend/.env.example to backend/.env or export DATABASE_URL.'
  );
}

export async function withClient(run) {
  const client = new pg.Client({ connectionString: resolveConnectionString() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}
