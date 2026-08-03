import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error) => {
  logger.error('Unexpected error on idle database client', error);
});

/** Every repository goes through here, so query logging lives in one place. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = []
): Promise<pg.QueryResult<T>> {
  const startedAt = Date.now();
  const result = await pool.query<T>(text, params as unknown[]);
  logger.debug(`query ${Date.now() - startedAt}ms`, { rows: result.rowCount });
  return result;
}

/** Runs a set of queries in a single transaction, rolling back on throw. */
export async function transaction<T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyConnection(): Promise<void> {
  await query('SELECT 1');
}

export async function closePool(): Promise<void> {
  await pool.end();
}
