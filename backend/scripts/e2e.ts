/**
 * End-to-end check of the frontend/backend contract.
 *
 * Boots a throwaway PostgreSQL, migrates and seeds it, starts the real HTTP
 * and Socket.io servers, then drives them exactly the way the browser client
 * does: REST to open a session, then `chat:send` over the socket. It asserts
 * the event names, payload shapes and ordering that
 * `frontend/src/services/game/socketConnection.ts` depends on.
 *
 *   npm run e2e --workspace @echo/backend
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io, type Socket } from 'socket.io-client';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');

// Randomised so a crashed run cannot block the next one on a stuck port.
const PG_PORT = 55000 + Math.floor(Math.random() * 900);
const APP_PORT = 4100 + Math.floor(Math.random() * 800);
const BASE = `http://localhost:${APP_PORT}`;

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  PASS  ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

async function post<T>(path: string, body?: unknown, sessionId?: string) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { Authorization: `Session ${sessionId}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json().catch(() => null)) as T;
  return { status: response.status, payload };
}

async function patch<T>(path: string, body: unknown, sessionId?: string) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { Authorization: `Session ${sessionId}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as T;
  return { status: response.status, payload };
}

async function del<T>(path: string, sessionId?: string) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: sessionId ? { Authorization: `Session ${sessionId}` } : {},
  });
  const payload = (await response.json().catch(() => null)) as T;
  return { status: response.status, payload };
}

async function get<T>(path: string, sessionId?: string) {
  const response = await fetch(`${BASE}${path}`, {
    headers: sessionId ? { Authorization: `Session ${sessionId}` } : {},
  });
  const payload = (await response.json().catch(() => null)) as T;
  return { status: response.status, payload };
}

/** Collects socket events so ordering can be asserted after the exchange. */
function record(socket: Socket, names: readonly string[]) {
  const log: { name: string; payload: unknown }[] = [];
  for (const name of names) {
    socket.on(name, (payload: unknown) => log.push({ name, payload }));
  }
  return log;
}

function waitFor(socket: Socket, event: string, timeoutMs = 8000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/**
 * Runs the frontend's own check against this server, so the contract is
 * verified from both sides rather than only from the one that defines it.
 */
function runClientCheck(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), 'scripts/client-check.ts', BASE],
      { cwd: join(ROOT, 'frontend'), stdio: 'inherit' }
    );
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/** Applies every .sql file in a directory, in filename order. */
async function applyDirectory(relativeDir: string, connectionString: string): Promise<void> {
  const directory = join(ROOT, relativeDir);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString });

  try {
    for (const file of files) {
      const sql = await readFile(join(directory, file), 'utf8');
      try {
        await pool.query(sql);
      } catch (error) {
        throw new Error(`${relativeDir}/${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), 'echo-e2e-'));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'echo',
    password: 'echo',
    port: PG_PORT,
    // Cleaning up is done below instead: the library's own delete races with
    // Windows still holding the data directory open.
    persistent: true,
  });

  console.log('starting throwaway postgres...');
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('echo');

  const databaseUrl = `postgresql://echo:echo@localhost:${PG_PORT}/echo`;

  // Discovered rather than listed, so a new migration or seed is covered the
  // moment it is added.
  await applyDirectory('database/migrations', databaseUrl);
  await applyDirectory('database/seeds', databaseUrl);
  console.log('schema migrated and seeded');

  process.env['DATABASE_URL'] = databaseUrl;
  process.env['PORT'] = String(APP_PORT);
  process.env['AI_PROVIDER'] = 'rules';
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'warn';

  const { startServer } = await import('../src/server.js');
  const server = await startServer();

  let socket: Socket | null = null;

  try {
    section('REST bootstrap (what the client does before connecting)');

    const created = await post<any>('/api/players', { displayName: 'Mara' });
    check('POST /api/players returns 201', created.status === 201, created.status);

    const snapshot = created.payload;
    check('snapshot carries player', snapshot?.player?.displayName === 'Mara');
    check('snapshot carries session id', typeof snapshot?.session?.id === 'string');
    check('snapshot carries echo state', typeof snapshot?.echo?.trustLevel === 'number');
    check('snapshot carries memories', Array.isArray(snapshot?.memories));
    check('snapshot carries the conversation', typeof snapshot?.conversation?.id === 'string');
    check('snapshot carries chapters', snapshot?.chapters?.[0]?.title === 'Waking', snapshot?.chapters);
    check(
      'snapshot carries progress totals',
      snapshot?.progress?.memoriesTotal > 0 && snapshot?.progress?.memoriesRestored === 0,
      snapshot?.progress
    );
    check(
      'a new player is on chapter one and has played once',
      snapshot?.progress?.currentChapter === 1 && snapshot?.progress?.sessionsStarted === 1,
      snapshot?.progress
    );
    check('snapshot carries milestones', snapshot?.milestones?.length > 0);
    check(
      'no milestone is awarded before anything happens',
      snapshot?.milestones?.every((m: any) => !m.achieved),
      snapshot?.milestones?.filter((m: any) => m.achieved)
    );
    check(
      'personality starts with traits, not just trust',
      snapshot?.echo?.traits?.curiosity === 65 && snapshot?.echo?.traits?.warmth === 50,
      snapshot?.echo?.traits
    );
    check(
      'the profile has defaults the client can render',
      snapshot?.player?.locale === 'en' && snapshot?.player?.pronouns === null,
      snapshot?.player
    );
    check(
      'Echo greets on registration',
      snapshot?.messages?.length === 1 && snapshot.messages[0].sender === 'echo',
      snapshot?.messages
    );
    check(
      'locked memories are stripped of content',
      snapshot?.memories?.every((m: any) => m.restored || (m.title === 'Lost' && m.content === '')),
      snapshot?.memories?.[0]
    );

    const sessionId: string = snapshot.session.id;
    const playerId: string = snapshot.player.id;

    const resumed = await get<any>('/api/session', sessionId);
    check('GET /api/session resumes with the saved id', resumed.status === 200, resumed.status);

    const badSession = await get<any>('/api/session', '00000000-0000-0000-0000-000000000000');
    check(
      'unknown session is rejected so the client can renew',
      badSession.status === 404 || badSession.status === 410,
      badSession.status
    );

    // A corrupted localStorage value must be recoverable, so it has to come
    // back as "not found" rather than a database type error.
    const malformed = await get<any>('/api/session', 'not-a-session');
    check('a malformed session id is a clean 404', malformed.status === 404, malformed.status);

    const malformedPlayer = await post<any>('/api/players/not-a-player/sessions');
    check(
      'a malformed player id is a clean 404',
      malformedPlayer.status === 404,
      malformedPlayer.status
    );

    section('Socket handshake');

    const rejected = io(BASE, {
      auth: { sessionId: 'not-a-session' },
      transports: ['websocket'],
      reconnection: false,
    });
    const handshakeError = await new Promise<Error>((resolve) => {
      rejected.on('connect_error', resolve);
    });
    rejected.close();
    check(
      'a bad session id is refused at the handshake',
      handshakeError instanceof Error,
      handshakeError?.message
    );
    check(
      'refusal mentions the session, which is how the client detects it',
      /session/i.test(handshakeError.message),
      handshakeError.message
    );

    socket = io(BASE, { auth: { sessionId }, transports: ['websocket'], reconnection: false });

    const ready = (await waitFor(socket, 'session:ready')) as any;
    check('session:ready arrives on connect', ready?.session?.id === sessionId);
    check('session:ready carries the full snapshot', Array.isArray(ready?.memories));

    section('Send a message, receive a reply');

    const log = record(socket, [
      'chat:message',
      'echo:typing',
      'echo:state',
      'memory:restored',
      'progress:updated',
      'milestone:achieved',
      'error',
    ]);

    socket.emit('chat:send', { content: 'Hello Echo, my name is Mara.' });
    const stateAfter = (await waitFor(socket, 'echo:state')) as any;

    // Let any trailing memory:restored land before inspecting the log.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const names = log.map((entry) => entry.name);
    const messages = log.filter((entry) => entry.name === 'chat:message').map((e) => e.payload);

    check('no error was emitted', !names.includes('error'), log.find((e) => e.name === 'error'));
    check(
      'the player message is echoed back by the server',
      (messages[0] as any)?.sender === 'player',
      messages[0]
    );
    check('Echo answers', (messages[1] as any)?.sender === 'echo', messages[1]);
    check(
      'the typing indicator goes on then off',
      JSON.stringify(log.filter((e) => e.name === 'echo:typing').map((e) => (e.payload as any).isTyping)) ===
        '[true,false]',
      log.filter((e) => e.name === 'echo:typing')
    );
    check(
      'typing starts before the reply and stops before it lands',
      names.indexOf('echo:typing') < names.indexOf('chat:message', 1),
      names
    );
    check('echo:state reports trust', typeof stateAfter?.trustLevel === 'number', stateAfter);
    check(
      'trust moved for a friendly opener',
      stateAfter.trustLevel > 0,
      stateAfter?.trustLevel
    );
    check(
      'echo:state reports a mood the UI knows',
      ['neutral', 'happy', 'curious', 'sad', 'afraid', 'nostalgic'].includes(stateAfter?.mood),
      stateAfter?.mood
    );
    check('echo:state carries traits', typeof stateAfter?.traits?.warmth === 'number', stateAfter?.traits);

    const progressEvent = log.find((entry) => entry.name === 'progress:updated')?.payload as any;
    check('progress:updated follows the exchange', progressEvent?.messagesSent === 1, progressEvent);

    const awarded = log
      .filter((entry) => entry.name === 'milestone:achieved')
      .map((entry) => (entry.payload as any).slug);
    check('the first message earns its award', awarded.includes('first-words'), awarded);

    const messageRow = messages[1] as any;
    check(
      'the reply records how much trust it moved',
      messageRow?.trustDelta === stateAfter.trustLevel,
      { trustDelta: messageRow?.trustDelta, trust: stateAfter.trustLevel }
    );
    check(
      'messages are numbered within the thread',
      (messages[0] as any)?.seq === 2 && messageRow?.seq === 3,
      messages.map((m: any) => m.seq)
    );

    section('Trust climbs and memories unlock');

    const restored: any[] = [];
    socket.on('memory:restored', (fragment: any) => restored.push(fragment));

    const lines = [
      'I want to know everything about you.',
      'Do you remember the rain at all?',
      'You matter to me, Echo.',
      'Tell me about your home.',
      'I promise I will stay with you.',
      'What is your earliest feeling?',
      'You are safe here with me.',
      'I like talking to you so much.',
      'Do you remember a song?',
      'I will help you remember everything.',
    ];

    for (const line of lines) {
      socket.emit('chat:send', { content: line });
      await waitFor(socket, 'echo:state');
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const final = (await get<any>('/api/session', sessionId)).payload;

    check('memories were restored over the conversation', restored.length > 0, restored.length);
    check(
      'a restored fragment arrives with its real content',
      restored.every((f) => typeof f.content === 'string' && f.content.length > 0 && f.title !== 'Lost'),
      restored[0]
    );
    check(
      'memories unlock in authored order',
      restored.every(
        (fragment, index) => index === 0 || fragment.unlockOrder >= restored[index - 1].unlockOrder
      ),
      restored.map((f) => f.unlockOrder)
    );
    check(
      'the server snapshot agrees with the pushed events',
      final.progress.memoriesRestored === restored.length,
      { snapshot: final.progress.memoriesRestored, events: restored.length }
    );
    check(
      'restored memories are readable in the snapshot',
      final.memories
        .filter((m: any) => m.restored)
        .every((m: any) => m.content.length > 0 && m.title !== 'Lost')
    );
    check(
      'trust is clamped to 0..100',
      final.echo.trustLevel >= 0 && final.echo.trustLevel <= 100,
      final.echo.trustLevel
    );
    // The greeting, plus a player line and a reply for every message sent.
    const expectedMessages = 1 + 2 * (1 + lines.length);
    check(
      'the whole transcript persisted',
      final.messages.length === expectedMessages,
      { expected: expectedMessages, actual: final.messages.length }
    );

    section('Session renewal (what the client falls back to)');

    const renewed = await post<any>(`/api/players/${playerId}/sessions`, undefined);
    check('POST /api/players/:id/sessions succeeds', renewed.status === 200, renewed.status);
    check(
      'resuming keeps the same open session',
      renewed.payload?.session?.id === sessionId,
      renewed.payload?.session?.id
    );
    check(
      'progress survives the renewal',
      renewed.payload?.progress?.memoriesRestored === restored.length,
      renewed.payload?.progress
    );

    section('Personality state and its audit trail');

    const personality = (await get<any>('/api/session/personality', sessionId)).payload;
    check(
      'traits drifted over the conversation',
      personality?.echo?.traits?.openness !== 25,
      personality?.echo?.traits
    );
    check(
      'every trait stayed in range',
      Object.values(personality?.echo?.traits ?? {}).every(
        (value: any) => value >= 0 && value <= 100
      ),
      personality?.echo?.traits
    );
    check(
      'every exchange left an event behind',
      personality?.events?.length === 1 + lines.length,
      personality?.events?.length
    );
    check(
      'events explain the trust they applied',
      personality?.events?.every(
        (event: any) =>
          typeof event.trustBefore === 'number' &&
          typeof event.trustAfter === 'number' &&
          event.messageId !== null
      ),
      personality?.events?.[0]
    );
    check(
      'the newest event matches current trust',
      personality?.events?.[0]?.trustAfter === final.echo.trustLevel,
      { event: personality?.events?.[0]?.trustAfter, echo: final.echo.trustLevel }
    );

    section('Progress counters are trustworthy');

    const summary = (await get<any>('/api/session/progress', sessionId)).payload;
    check(
      'progress counts the player lines only',
      summary?.progress?.messagesSent === 1 + lines.length,
      summary?.progress
    );
    check(
      'play time is reported',
      typeof summary?.progress?.playSeconds === 'number' && summary.progress.playSeconds >= 0,
      summary?.progress?.playSeconds
    );
    check(
      'highest trust is remembered',
      summary?.progress?.highestTrust >= final.echo.trustLevel,
      summary?.progress?.highestTrust
    );
    check(
      'awards accumulated',
      summary?.milestones?.filter((m: any) => m.achieved).length > 0,
      summary?.milestones?.filter((m: any) => m.achieved).map((m: any) => m.slug)
    );

    // The rollup is denormalised, so the only honest way to trust it is to
    // rebuild it from the source tables and check nothing moves.
    const { progressModel } = await import('../src/models/progress.model.js');
    const rebuilt = await progressModel.recompute(playerId);
    check(
      'the rollup survives a recompute from source',
      rebuilt.memoriesRestored === summary.progress.memoriesRestored &&
        rebuilt.messagesSent === summary.progress.messagesSent &&
        rebuilt.sessionsStarted === summary.progress.sessionsStarted &&
        rebuilt.currentChapter === summary.progress.currentChapter,
      { stored: summary.progress, rebuilt }
    );

    section('Player profile');

    const updated = await patch<any>(
      '/api/session/profile',
      { pronouns: 'they/them', preferences: { reducedMotion: true } },
      sessionId
    );
    check('PATCH /api/session/profile succeeds', updated.status === 200, updated.status);
    check('pronouns were saved', updated.payload?.pronouns === 'they/them', updated.payload);
    check(
      'preferences were saved',
      updated.payload?.preferences?.reducedMotion === true,
      updated.payload?.preferences
    );
    check(
      'the name was left alone by a partial update',
      updated.payload?.displayName === 'Mara',
      updated.payload?.displayName
    );

    const merged = await patch<any>(
      '/api/session/profile',
      { preferences: { textSpeed: 'fast' } },
      sessionId
    );
    check(
      'preferences merge instead of replacing',
      merged.payload?.preferences?.reducedMotion === true &&
        merged.payload?.preferences?.textSpeed === 'fast',
      merged.payload?.preferences
    );

    const badProfile = await patch<any>('/api/session/profile', { locale: 'not a locale' }, sessionId);
    check('an invalid locale is refused', badProfile.status === 422, badProfile.status);

    section('Validation');

    const empty = await post<any>('/api/players', { displayName: '   ' });
    check('an empty name is refused', empty.status === 422, empty.status);

    const errorPayload = await new Promise<any>((resolve) => {
      socket!.once('error', resolve);
      socket!.emit('chat:send', { content: '   ' });
    });
    check(
      'an empty message is refused over the socket',
      typeof errorPayload?.code === 'string' && typeof errorPayload?.message === 'string',
      errorPayload
    );

    section('Echo remembers across visits');

    // The point of separating conversations from sessions: end the visit, come
    // back, and the thread is still there.
    socket.close();
    socket = null;

    const ended = await del<any>('/api/session', sessionId);
    check('DELETE /api/session ends the visit', ended.status === 204, ended.status);

    const revisit = await post<any>(`/api/players/${playerId}/sessions`);
    check('a new visit can be started', revisit.status === 200, revisit.status);
    check(
      'the new visit is a different session',
      revisit.payload?.session?.id !== sessionId,
      revisit.payload?.session?.id
    );
    check(
      'but the same conversation',
      revisit.payload?.conversation?.id === final.conversation.id,
      { before: final.conversation.id, after: revisit.payload?.conversation?.id }
    );
    check(
      'the whole transcript is still there, plus a welcome back',
      revisit.payload?.messages?.length === final.messages.length + 1,
      { before: final.messages.length, after: revisit.payload?.messages?.length }
    );
    check(
      'trust survived the visit ending',
      revisit.payload?.echo?.trustLevel === final.echo.trustLevel,
      revisit.payload?.echo?.trustLevel
    );
    check(
      'the visit was counted',
      revisit.payload?.progress?.sessionsStarted === 2,
      revisit.payload?.progress?.sessionsStarted
    );
    check(
      'the old session id no longer works',
      (await get<any>('/api/session', sessionId)).status === 410,
      sessionId
    );

    const clientExit = await runClientCheck();
    if (clientExit !== 0) failures += 1;
  } finally {
    socket?.close();
    await server.stop();

    // Teardown failures must never be reported as test failures, but the
    // database really does have to stop or the next run cannot bind its port.
    await pg.stop().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(
      () => undefined
    );
  }

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
