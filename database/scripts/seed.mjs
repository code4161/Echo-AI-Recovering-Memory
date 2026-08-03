import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { databaseDir, withClient } from './_client.mjs';

const seedsDir = resolve(databaseDir, 'seeds');

// Seeds are written to be idempotent, so they are always re-run in full.
await withClient(async (client) => {
  const files = readdirSync(seedsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    await client.query(readFileSync(resolve(seedsDir, file), 'utf8'));
    console.log(`Seeded ${file}`);
  }
});
