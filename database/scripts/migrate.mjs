import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { databaseDir, withClient } from './_client.mjs';

const migrationsDir = resolve(databaseDir, 'migrations');

await withClient(async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  const pending = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log('No pending migrations.');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');

    // Each migration is one transaction: it either fully applies or not at all.
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
    }
  }
});
