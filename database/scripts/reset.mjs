import { withClient } from './_client.mjs';

// Destructive: drops the public schema and everything in it. Local use only.
await withClient(async (client) => {
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
  console.log('Schema dropped. Run `npm run db:migrate` to rebuild it.');
});
