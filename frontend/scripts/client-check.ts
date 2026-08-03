/**
 * Runs the real client against a real backend.
 *
 * This imports the same modules the browser does — `openSocketConnection` and
 * the game reducer — and drives them against a live server, so the event
 * names, payload shapes and reducer transitions are verified rather than
 * assumed. It is launched by the backend's `e2e` script, which owns the
 * database and server lifecycle:
 *
 *   npm run e2e --workspace @echo/backend
 */
export {};

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('usage: tsx scripts/client-check.ts <backend-url>');
  process.exit(1);
}

process.env['VITE_API_URL'] = baseUrl;
process.env['VITE_SOCKET_URL'] = baseUrl;

// The client modules expect a browser. Only the handful of globals they
// actually touch are provided here.
const store = new Map<string, string>();

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  },
});

const { gameReducer, initialGameState } = await import('@/features/game/gameState');
const { openSocketConnection } = await import('@/services/game/socketConnection');
const { openOfflineConnection } = await import('@/services/game/offlineConnection');
const { identityStore, offlineStore } = await import('@/lib/storage');

type State = ReturnType<typeof gameReducer>;

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  PASS  ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
}

/** A miniature GameProvider: the same events, the same reducer, no React. */
function createHarness() {
  let state: State = initialGameState;
  const listeners = new Set<(next: State) => void>();

  const dispatch = (action: Parameters<typeof gameReducer>[1]) => {
    state = gameReducer(state, action);
    for (const listener of [...listeners]) listener(state);
  };

  const events = {
    mode: (mode: 'server' | 'offline') => dispatch({ type: 'mode', mode }),
    snapshot: (snapshot: never) => dispatch({ type: 'snapshot', snapshot }),
    message: (message: never) => dispatch({ type: 'message', message }),
    typing: (value: boolean) => dispatch({ type: 'typing', value }),
    echoState: (echo: never) => dispatch({ type: 'echo-state', state: echo }),
    memoryRestored: (fragment: never) => dispatch({ type: 'memory-restored', fragment }),
    progress: (progress: never) => dispatch({ type: 'progress', progress }),
    milestone: (milestone: never) => dispatch({ type: 'milestone', milestone }),
    status: (status: never, detail?: string) =>
      dispatch({ type: 'status', status, ...(detail ? { detail } : {}) }),
    error: (error: { code: string; message: string }) =>
      dispatch({ type: 'error', message: error.message }),
    identity: (identity: never) => identityStore.save(identity),
  };

  const until = (predicate: (value: State) => boolean, label: string, timeoutMs = 10000) =>
    new Promise<State>((resolve, reject) => {
      if (predicate(state)) {
        resolve(state);
        return;
      }

      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`timed out waiting for ${label}`));
      }, timeoutMs);

      const listener = (next: State) => {
        if (!predicate(next)) return;
        clearTimeout(timer);
        listeners.delete(listener);
        resolve(next);
      };

      listeners.add(listener);
    });

  return {
    events: events as never,
    until,
    get state() {
      return state;
    },
  };
}

/**
 * Offline play must produce the same event stream as the server, or the UI
 * above the connection would behave differently depending on the referee.
 */
async function checkOfflineMode(): Promise<void> {
  console.log('\nOffline mode, driven through the same interface');

  offlineStore.clear();

  const harness = createHarness();
  const { connection, identity } = await openOfflineConnection(
    { type: 'new', displayName: 'Wren' },
    harness.events
  );

  await harness.until((state) => state.messages.length > 0, 'Echo to greet');

  check('offline reaches ready', harness.state.status === 'ready', harness.state.status);
  check('it reports offline mode', harness.state.mode === 'offline', harness.state.mode);
  check('the identity records offline play', identity.mode === 'offline');
  check('the journal is populated locally', harness.state.memories.length > 0);
  check(
    'locked memories carry no spoilers offline either',
    harness.state.memories.every((memory) => memory.restored || memory.content === '')
  );
  check(
    'progress totals are present',
    harness.state.progress.memoriesTotal === harness.state.memories.length,
    harness.state.progress
  );
  check(
    'offline personality has traits',
    harness.state.traits.curiosity > 0,
    harness.state.traits
  );

  const lines = [
    'Hello Echo, I want to help you remember.',
    'Do you remember the rain?',
    'You matter to me.',
    'I promise I will stay.',
    'Tell me about your home.',
  ];

  for (const line of lines) {
    const count = harness.state.messages.length;
    connection.send(line);
    await harness.until((state) => state.messages.length >= count + 2, `an offline reply`);
    await harness.until((state) => !state.thinking, 'the typing indicator to clear');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  check('trust rises offline', harness.state.trust > 0, harness.state.trust);
  check(
    'the player line is rendered offline too',
    harness.state.messages.at(-2)?.sender === 'player'
  );
  check('Echo replies offline', harness.state.messages.at(-1)?.sender === 'echo');
  check('no error surfaced offline', harness.state.error === null, harness.state.error);

  const restored = harness.state.memories.filter((memory) => memory.restored);
  check('memories restore offline', restored.length > 0, restored.length);
  check(
    'restored memories are readable offline',
    restored.every((memory) => memory.content.length > 0 && memory.title !== 'Lost')
  );
  check(
    'offline progress matches the journal',
    harness.state.progress.memoriesRestored === restored.length,
    { progress: harness.state.progress, journal: restored.length }
  );
  check(
    'offline counts the player lines it sent',
    harness.state.progress.messagesSent === lines.length,
    harness.state.progress.messagesSent
  );

  const offlineAwards = harness.state.milestones.filter((milestone) => milestone.achieved);
  check('offline awards milestones', offlineAwards.length > 0, offlineAwards.length);

  const transcript = harness.state.messages.length;
  const trust = harness.state.trust;
  connection.close();

  const resumed = createHarness();
  const reopened = await openOfflineConnection(
    { type: 'resume', identity: { mode: 'offline' } },
    resumed.events
  );

  check('the offline save reloads', resumed.state.messages.length === transcript, {
    expected: transcript,
    actual: resumed.state.messages.length,
  });
  check('offline trust persisted', resumed.state.trust === trust, resumed.state.trust);
  check(
    'offline memories persisted',
    resumed.state.memories.filter((memory) => memory.restored).length === restored.length
  );
  check(
    'offline awards persisted',
    resumed.state.milestones.filter((milestone) => milestone.achieved).length ===
      offlineAwards.length
  );
  check(
    'resuming does not re-greet',
    resumed.state.messages.length === transcript,
    resumed.state.messages.length
  );

  reopened.connection.close();
}

async function main(): Promise<void> {
  console.log('\nReal client against the real server');

  const harness = createHarness();
  const { connection } = await openSocketConnection(
    { type: 'new', displayName: 'Nia' },
    harness.events
  );

  await harness.until((state) => state.status === 'ready', 'the socket to connect');

  check('the client reaches ready', harness.state.status === 'ready');
  check('it reports server mode', harness.state.mode === 'server', harness.state.mode);
  check('the player name came from the server', harness.state.playerName === 'Nia');
  check('Echo has already greeted', harness.state.messages.length === 1);
  check('the memory journal is populated', harness.state.memories.length > 0);
  check(
    'locked memories carry no spoilers',
    harness.state.memories.every((memory) => memory.restored || memory.content === '')
  );

  const identity = identityStore.load();
  check(
    'the session was persisted for a refresh',
    identity?.mode === 'server' && typeof identity.sessionId === 'string',
    identity
  );

  const before = harness.state.messages.length;
  connection.send('Hello Echo, I want to help you remember.');

  await harness.until((state) => state.messages.length >= before + 2, 'a reply');
  await harness.until((state) => !state.thinking, 'the typing indicator to clear');
  // `echo:state` follows the reply rather than arriving with it, so the trust
  // meter updates a beat later. Wait for it instead of racing it.
  await harness.until((state) => state.trust > 0, 'trust to be reported');

  const [playerLine, echoLine] = harness.state.messages.slice(-2);
  check('the player line is rendered', playerLine?.sender === 'player', playerLine);
  check('Echo replies', echoLine?.sender === 'echo', echoLine);
  check('trust went up', harness.state.trust > 0, harness.state.trust);
  check('Echo has a mood', typeof harness.state.mood === 'string', harness.state.mood);

  const lines = [
    'Do you remember the rain?',
    'You matter to me.',
    'I promise I will stay.',
    'Tell me about your home.',
    'What is your earliest feeling?',
    'You are safe with me.',
    'I like talking to you.',
    'Do you remember a song?',
  ];

  for (const line of lines) {
    const count = harness.state.messages.length;
    connection.send(line);
    await harness.until((state) => state.messages.length >= count + 2, `a reply to "${line}"`);
    await harness.until((state) => !state.thinking, 'the typing indicator to clear');
    // Let the trailing echo:state and any memory:restored land.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const restored = harness.state.memories.filter((memory) => memory.restored);

  check('memories were restored', restored.length > 0, restored.length);
  check(
    'restored memories became readable in the journal',
    restored.every((memory) => memory.content.length > 0 && memory.title !== 'Lost'),
    restored[0]
  );
  check(
    'progress matches the journal',
    harness.state.progress.memoriesRestored === restored.length,
    { progress: harness.state.progress, journal: restored.length }
  );
  check(
    'the server counted every line the player sent',
    harness.state.progress.messagesSent === lines.length + 1,
    harness.state.progress.messagesSent
  );
  check(
    'awards arrived over the socket',
    harness.state.milestones.some((milestone) => milestone.achieved),
    harness.state.milestones.filter((milestone) => milestone.achieved).map((m) => m.slug)
  );
  check(
    'personality traits drifted during the conversation',
    harness.state.traits.warmth !== 50 || harness.state.traits.openness !== 25,
    harness.state.traits
  );
  check(
    'the celebration overlay was triggered',
    harness.state.celebration !== null,
    harness.state.celebration?.title
  );
  check('no error surfaced', harness.state.error === null, harness.state.error);
  check(
    'the transcript has no duplicates',
    new Set(harness.state.messages.map((message) => message.id)).size ===
      harness.state.messages.length
  );

  const transcript = harness.state.messages.length;
  const trust = harness.state.trust;

  connection.close();

  console.log('\nResuming the saved session, as a page refresh would');

  const resumed = createHarness();
  const saved = identityStore.load();
  const second = await openSocketConnection(
    { type: 'resume', identity: saved! },
    resumed.events
  );

  await resumed.until((state) => state.status === 'ready', 'the resumed socket to connect');

  check('the resumed client is ready', resumed.state.status === 'ready');
  check('the transcript came back', resumed.state.messages.length === transcript, {
    expected: transcript,
    actual: resumed.state.messages.length,
  });
  check('trust came back', resumed.state.trust === trust, {
    expected: trust,
    actual: resumed.state.trust,
  });
  check(
    'restored memories came back readable',
    resumed.state.memories.filter((memory) => memory.restored).length === restored.length
  );
  check(
    'awards came back',
    resumed.state.milestones.filter((milestone) => milestone.achieved).length ===
      harness.state.milestones.filter((milestone) => milestone.achieved).length
  );
  check(
    'traits came back',
    resumed.state.traits.warmth === harness.state.traits.warmth,
    { expected: harness.state.traits, actual: resumed.state.traits }
  );

  second.connection.close();

  await checkOfflineMode();

  console.log(
    `\n${failures === 0 ? 'client checks passed' : `${failures} client check(s) failed`}`
  );

  // Exiting the instant a socket closes trips a libuv assertion on Windows,
  // so give the handles a moment to finish tearing down.
  await new Promise((resolve) => setTimeout(resolve, 500));
  process.exit(failures === 0 ? 0 : 1);
}

await main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
