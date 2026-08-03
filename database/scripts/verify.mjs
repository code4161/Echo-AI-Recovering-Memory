/**
 * Proves the migrations work — both on an empty database and on one that
 * already has data.
 *
 * Migrations are forward-only, so a backfill only ever runs once, in
 * production, unobserved. This applies each migration in order against a
 * throwaway PostgreSQL, twice: once clean, and once with rows inserted after
 * the pre-existing migrations so every backfill has something to move.
 *
 *   npm run db:verify
 */
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATABASE_DIR = join(HERE, '..');
const PORT = 56000 + Math.floor(Math.random() * 900);

let failures = 0;

function check(label, ok, detail) {
  if (ok) {
    console.log(`  PASS  ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
}

async function readSql(directory) {
  const dir = join(DATABASE_DIR, directory);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (file) => ({ file, sql: await readFile(join(dir, file), 'utf8') }))
  );
}

/** Applies migrations one at a time, exactly as `migrate.mjs` does. */
async function applyMigrations(client, migrations) {
  for (const { file, sql } of migrations) {
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`${file}: ${error.message}`);
    }
  }
}

async function withDatabase(pgServer, name, run) {
  await pgServer.createDatabase(name);
  const client = new pg.Client({
    connectionString: `postgresql://echo:echo@localhost:${PORT}/${name}`,
  });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

const scalar = async (client, sql, params = []) => (await client.query(sql, params)).rows[0];

async function main() {
  const dataDir = await mkdtemp(join(tmpdir(), 'echo-schema-'));
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'echo',
    password: 'echo',
    port: PORT,
    persistent: true,
  });

  console.log('starting throwaway postgres...');
  await server.initialise();
  await server.start();

  const migrations = await readSql('migrations');
  const seeds = await readSql('seeds');

  try {
    console.log('\nMigrating an empty database');

    await withDatabase(server, 'clean', async (client) => {
      await applyMigrations(client, migrations);
      for (const { sql } of seeds) await client.query(sql);

      check('every migration applies in order', true);

      const tables = (
        await client.query(
          `SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' ORDER BY table_name`
        )
      ).rows.map((row) => row.table_name);

      const expected = [
        'conversations',
        'echo_personality',
        'game_progress',
        'memory_chapters',
        'memory_fragments',
        'messages',
        'milestones',
        'personality_events',
        'player_memories',
        'player_milestones',
        'players',
        'sessions',
      ];
      check('every table exists', expected.every((name) => tables.includes(name)), tables);

      const fragments = await scalar(client, 'SELECT count(*)::int AS n FROM memory_fragments');
      check('fragments seeded', fragments.n === 5, fragments.n);

      const orphans = await scalar(
        client,
        'SELECT count(*)::int AS n FROM memory_fragments WHERE chapter_id IS NULL'
      );
      check('every fragment has a chapter', orphans.n === 0, orphans.n);

      const chapters = await scalar(
        client,
        `SELECT title FROM memory_chapters WHERE number = 1`
      );
      check('the chapter seed replaced the placeholder title', chapters.title === 'Waking', chapters);

      const awards = await scalar(client, 'SELECT count(*)::int AS n FROM milestones');
      check('milestones seeded', awards.n === 8, awards.n);

      // Seeds claim to be idempotent; that is only true if re-running them works.
      for (const { sql } of seeds) await client.query(sql);
      const afterRerun = await scalar(client, 'SELECT count(*)::int AS n FROM memory_fragments');
      check('seeds are re-runnable', afterRerun.n === 5, afterRerun.n);
    });

    console.log('\nMigrating a database that already has players');

    await withDatabase(server, 'legacy', async (client) => {
      // Everything that existed before conversations, personality and progress.
      const preConversation = migrations.filter((m) => m.file < '004');
      await applyMigrations(client, preConversation);

      // High unlock orders so this fixture cannot collide with the real seed,
      // which claims (chapter 1, order 1..5).
      const { rows: seeded } = await client.query(
        `INSERT INTO memory_fragments (slug, title, content, chapter, unlock_order, required_trust)
         VALUES ('legacy-one', 'One', 'First.', 1, 91, 10),
                ('legacy-two', 'Two', 'Second.', 1, 92, 50)
         RETURNING id`
      );

      const player = await scalar(
        client,
        `INSERT INTO players (display_name) VALUES ('Legacy') RETURNING id`
      );
      await client.query(`INSERT INTO echo_states (player_id, trust_level) VALUES ($1, 30)`, [
        player.id,
      ]);
      await client.query(`INSERT INTO player_memories (player_id, fragment_id) VALUES ($1, $2)`, [
        player.id,
        seeded[0].id,
      ]);

      // Two visits, so the backfill has to merge them into one thread.
      const first = await scalar(
        client,
        `INSERT INTO sessions (player_id, started_at, ended_at)
         VALUES ($1, now() - interval '2 days', now() - interval '2 days' + interval '10 min')
         RETURNING id`,
        [player.id]
      );
      const second = await scalar(
        client,
        `INSERT INTO sessions (player_id) VALUES ($1) RETURNING id`,
        [player.id]
      );

      // Same timestamp on purpose: ordering must survive a tie.
      await client.query(
        `INSERT INTO messages (session_id, sender, content, created_at) VALUES
           ($1, 'echo',   'Hello?',        now() - interval '2 days'),
           ($1, 'player', 'I am here.',    now() - interval '2 days'),
           ($2, 'echo',   'You came back', now()),
           ($2, 'player', 'I did.',        now())`,
        [first.id, second.id]
      );

      await applyMigrations(
        client,
        migrations.filter((m) => m.file >= '004')
      );
      for (const { sql } of seeds) await client.query(sql);

      check('later migrations apply over existing data', true);

      const conversations = await scalar(
        client,
        'SELECT count(*)::int AS n FROM conversations WHERE player_id = $1',
        [player.id]
      );
      check('both visits merged into one thread', conversations.n === 1, conversations.n);

      const messages = await scalar(
        client,
        `SELECT count(*)::int AS n, count(conversation_id)::int AS linked,
                count(DISTINCT seq)::int AS positions
           FROM messages`
      );
      check('every message kept its place in the thread', messages.n === 4, messages);
      check('every message was attached to the conversation', messages.linked === 4, messages);
      check('positions are unique despite tied timestamps', messages.positions === 4, messages);

      const counted = await scalar(
        client,
        'SELECT message_count FROM conversations WHERE player_id = $1',
        [player.id]
      );
      check('the denormalised count matches', counted.message_count === 4, counted);

      const provenance = await scalar(
        client,
        'SELECT count(*)::int AS n FROM messages WHERE session_id IS NOT NULL'
      );
      check('the originating session is kept as provenance', provenance.n === 4, provenance.n);

      const personality = await scalar(
        client,
        'SELECT trust_level, warmth FROM echo_personality WHERE player_id = $1',
        [player.id]
      );
      check('trust survived the rename', personality.trust_level === 30, personality);
      check('traits arrived with defaults', personality.warmth === 50, personality);

      const progress = await scalar(
        client,
        'SELECT * FROM game_progress WHERE player_id = $1',
        [player.id]
      );
      check('progress was backfilled from history', progress.messages_sent === 2, progress);
      check('restored memories were counted', progress.memories_restored === 1, progress);
      check('sessions were counted', progress.sessions_started === 2, progress);
      check('highest trust seeded from personality', progress.highest_trust === 30, progress);

      const legacyChapter = await scalar(
        client,
        `SELECT c.number FROM memory_fragments f
           JOIN memory_chapters c ON c.id = f.chapter_id
          WHERE f.slug = 'legacy-one'`
      );
      check('existing fragments were moved onto chapter rows', legacyChapter.number === 1, legacyChapter);
    });
  } finally {
    await server.stop().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(
      () => undefined
    );
  }

  console.log(`\n${failures === 0 ? 'schema verified' : `${failures} schema check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
