# Echo

> Someone woke up in the dark with no memories left.
> Talk to them. Help them remember.

**Echo** is an AI companion game. The player holds a conversation with Echo, a
small character who has lost their memories. Talking builds Echo's *trust*, and
trust unlocks *memory fragments* — pieces of who Echo used to be.

The two halves are wired together over Socket.io: the browser sends what the
player types, and the server answers with Echo's reply, her mood, the new trust
level and any memory that just came back. Echo's dialogue still comes from a
keyword engine rather than a real model, and the content is one seeded chapter.

---

## The game loop

```
player types a message
        ↓
message is stored in the transcript
        ↓
the AI layer reads recent history + Echo's state and answers
        ↓
trust moves up or down
        ↓
if trust crosses a fragment's threshold, a memory is restored
        ↓
the client is told over Socket.io and re-renders
```

Every step above happens on the server. The browser never decides whether a
memory unlocks, so progression cannot be faked from the client.

---

## Repository layout

```
echo/
├── frontend/    React + TypeScript + Vite  — what the player sees
├── backend/     Node + Express + Socket.io — game rules and realtime
├── database/    PostgreSQL schema, migrations, seed content
├── package.json npm workspaces root: one install, one dev command
└── README.md
```

### `frontend/` — the client

React 19 with TypeScript, built by Vite. It talks to the backend over Socket.io,
and **still runs standalone**: if the server cannot be reached when a new game
starts, the same game is refereed by a rules engine in the browser and the UI
says so.

| Folder                   | What lives there                                                |
| ------------------------ | --------------------------------------------------------------- |
| `src/pages/`             | Full screens: HomePage and GamePage. Composition only.            |
| `src/features/game/`     | All game state — one reducer, one provider, `useGame()`.          |
| `src/features/echo/`     | Echo's presence: avatar, mood, friendship meter.                  |
| `src/features/chat/`     | The conversation panel.                                           |
| `src/features/memories/` | The journal and the "memory recovered" moment.                    |
| `src/components/`        | Reusable presentational pieces. No state, no fetching.            |
| `src/services/game/`     | **The connection.** Socket.io and offline, behind one interface.  |
| `src/services/echo/`     | The in-browser dialogue engine used for offline play.             |
| `src/hooks/`             | `useAutoScroll`, `useMediaQuery`.                                 |
| `src/lib/`               | REST bootstrap, friendship bands, persistence, ids, time.         |
| `src/data/`              | Chapter 1 memory content, until the API serves it.                |
| `src/styles/`            | Design tokens and global CSS.                                     |

The rule that holds it together: **`components/` render, `features/` hold state,
`services/` produce Echo's voice.**

See [`frontend/README.md`](frontend/README.md).

### `backend/` — the server

Express 5 and Socket.io in TypeScript, arranged in strict layers:

```
HTTP    →  routes  →  controllers  ┐
                                   ├→  services  →  models  →  db  →  Postgres
Socket  →  sockets/*.handler       ┘
```

| Folder                 | Responsibility                                                    |
| ---------------------- | ----------------------------------------------------------------- |
| `src/config/`          | Env vars and tunable game rules, each read in one place.           |
| `src/routes/`          | URL → controller mapping. Nothing else.                            |
| `src/controllers/`     | Thin HTTP adapters: parse, call one service, send JSON.            |
| `src/sockets/`         | Socket.io wiring, handshake guard, realtime handlers.              |
| `src/services/`        | **The game.** Sessions, game state, the chat loop, memories.       |
| `src/services/echo/`   | The AI boundary — a swappable provider that writes Echo's lines.   |
| `src/models/`          | All SQL. Maps rows to domain objects. Knows no game rules.         |
| `src/db/`              | Connection pool, query and transaction helpers.                    |
| `src/middleware/`      | Session guard, request logging, error shaping.                     |
| `src/types/`           | Domain types and the typed Socket.io event contract.               |
| `src/utils/`           | Small helpers with no domain knowledge.                            |

Three rules matter most here:

1. **Both transports stop at the service layer.** REST controllers and socket
   handlers call the same `chatService`, so the game behaves identically over
   either, and neither one hides logic the other cannot reach.
2. **The server owns progress.** `gameState.service.ts` clamps every trust
   change and decides every memory unlock, so neither a client nor a
   misbehaving model can invent progress.
3. **The AI is behind an interface.** Everything above `services/echo/` depends
   on `EchoProvider`, never on a vendor SDK. Today it resolves to a keyword
   engine; adding a real model is one new file plus one switch case.

See [`backend/README.md`](backend/README.md), which explains every file.

### `database/` — the schema

PostgreSQL 16 with plain SQL migrations and a small Node runner. No ORM, so the
schema stays readable and nothing is locked to one data library.

```
players ─┬─ sessions ···························· (provenance)
         │      │                                       ╷
         ├─ conversations ──── messages ────────────────╯
         │                          │
         ├─ echo_personality        └─ personality_events
         ├─ game_progress
         ├─ player_memories ──── memory_fragments ──── memory_chapters
         └─ player_milestones ── milestones
```

| Folder        | What lives there                                                       |
| ------------- | ---------------------------------------------------------------------- |
| `migrations/` | Numbered, forward-only schema changes, tracked in `schema_migrations`.  |
| `seeds/`      | Authored game content — chapters, memory fragments, milestones. Idempotent. |
| `scripts/`    | The migrate / seed / reset / verify runners.                            |

Two ideas shape it.

**Content is separated from progress.** Chapters, fragments and milestones are
identical for everyone and version-controlled in `seeds/`; `player_memories`,
`player_milestones` and `game_progress` are one player's version of events.
Adding a chapter or an award means writing a seed row, not changing code.

**A conversation is not a session.** A session is one visit and expires after
thirty minutes of silence; a conversation is the thread with Echo and outlives
any number of visits. Messages belong to the conversation, which is what lets a
player close the tab on Tuesday and be remembered on Friday.

See [`database/README.md`](database/README.md).

---

## Getting started

### The full stack

Node 20+, and Docker for Postgres.

```bash
npm install

# 1. database
npm run db:up                       # start Postgres on :5432
cp backend/.env.example backend/.env
npm run db:migrate                  # create tables
npm run db:seed                     # load chapter 1 memories

# 2. app
npm run dev                         # backend :4000 + frontend :5173
```

Open http://localhost:5173, enter a name, and talk to Echo. Vite proxies `/api`
and `/socket.io` to the backend, so the browser stays on one origin and never
meets CORS.

### Just the game

The frontend needs nothing else — no server, no database, no API keys:

```bash
npm install
npm run dev:frontend
```

Starting a game with no backend running falls back to the in-browser Echo, and
the badge beside her reads **Offline** instead of **Live**. Set `VITE_OFFLINE=true`
in `frontend/.env.local` to choose that deliberately.

> **One-time note:** npm blocks package install scripts by default in this setup.
> Vite and tsx need esbuild's, so run `npm approve-scripts esbuild` once before
> `npm run dev`. Review it first if you prefer — it only downloads the platform
> binary.

### Commands

| Command                | Effect                                          |
| ---------------------- | ----------------------------------------------- |
| `npm run dev:frontend` | The game on its own. No database needed.        |
| `npm run dev`          | Backend and frontend together, both watching.   |
| `npm run e2e`        | Full integration test. Needs no Docker — see below. |
| `npm run build`      | Type-check and build both workspaces.             |
| `npm run typecheck`  | Type-check both workspaces.                       |
| `npm run db:up/down` | Start / stop the Postgres container.              |
| `npm run db:migrate` | Apply pending migrations.                         |
| `npm run db:seed`    | Load chapters, memories and milestones (safe to re-run). |
| `npm run db:reset`   | Drop the schema. Local only.                      |
| `npm run db:verify`  | Prove the migrations work on both an empty and a populated database. |

---

## How the two halves meet

REST is used once, to get a session; everything after that is Socket.io.

```
POST /api/players           → the full snapshot: player, session, conversation,
                              echo, messages, chapters, memories, progress,
                              milestones
io(url, { auth: { sessionId } })
   ← session:ready          the same snapshot, on connect
   → chat:send              the player typed something
   ← chat:message           their line, echoed back by the server
   ← echo:typing            Echo is composing
   ← chat:message           Echo's reply
   ← echo:state             new trust, mood and traits
   ← memory:restored        a fragment came back, with its text
   ← progress:updated       the counters after the exchange
   ← milestone:achieved     an award was earned, one event each
```

The client renders nothing optimistically: even the player's own line is drawn
only when the server sends it back. That is what keeps the transcript in the
order the server recorded it, and it is why the reducer in
`features/game/gameState.ts` only *applies* events — it computes no trust and
unlocks no memories.

### One interface, two referees

`src/services/game/types.ts` defines a `GameConnection` that emits the event
stream above. There are two implementations:

| Implementation         | Referee                | Progress lives in |
| ---------------------- | ---------------------- | ----------------- |
| `socketConnection.ts`  | The server, over Socket.io | Postgres      |
| `offlineConnection.ts` | The browser, using the local rules engine | `localStorage` |

Because both produce the identical sequence, no component knows which one is
running. Two rules keep the fallback honest: only an unreachable server triggers
it (a server that answers and refuses is a real error), and only a *new* game
falls back — resuming a server game offline would show the player a different
conversation than the one they left.

### Sessions and conversations

A session id is the client's only credential, saved in `localStorage` and sent
as `Authorization: Session <id>` and in the socket handshake. If it expires
while the player is away, the client asks for a new one and reconnects instead
of dropping them at the title screen.

The new session drops the player back into the same conversation, so ending a
visit costs them nothing: Echo's trust, her personality and the whole transcript
are still there when they return.

Both sides define domain types in `types/domain.ts`, mirrored by hand. That file
should become a shared workspace package before it drifts.

### Realtime events

Connect with `io(url, { auth: { sessionId } })` — the session is validated
during the handshake, so a socket either belongs to a real session or never
opens.

| Direction       | Event              | Meaning                              |
| --------------- | ------------------ | ------------------------------------ |
| client → server | `chat:send`        | Player said something                |
| client → server | `chat:typing`      | Relayed to other tabs on this session |
| client → server | `session:sync`     | Re-send the snapshot                 |
| server → client | `session:ready`    | Full game snapshot, sent on connect  |
| server → client | `chat:message`     | A new message from either side       |
| server → client | `echo:typing`      | Echo is composing a reply            |
| server → client | `echo:state`       | Trust, mood or traits changed        |
| server → client | `memory:restored`  | A memory fragment was recovered      |
| server → client | `progress:updated` | Counters after an exchange           |
| server → client | `session:expired`  | Session ended; the socket then closes |
| server → client | `milestone:achieved` | An award was earned                |
| server → client | `error`            | `{ code, message }`                  |

---

## Testing

`npm run e2e` starts a throwaway PostgreSQL, migrates and seeds it, boots the
real HTTP and Socket.io servers, and then drives them twice: once with a raw
socket client that asserts the wire protocol, and once through the frontend's
own `openSocketConnection` and reducer, so the client code is verified rather
than assumed. It needs no Docker and leaves nothing behind.

Two checks in there are worth calling out, because they cover things that are
otherwise easy to get wrong and hard to notice: the denormalised counters in
`game_progress` are rebuilt from source and compared against the stored ones, so
drift fails the build; and a visit is ended and restarted to prove the
conversation survives it.

`npm run db:verify` covers the other blind spot. Migrations are forward-only, so
their backfills run exactly once, in production, unobserved — this replays them
against a database already holding players, sessions and messages and asserts
the old data landed correctly.

```
npm run e2e
npm run db:verify
```

---

## What is deliberately not built yet

- **Real AI dialogue.** Both halves currently use keyword rules and canned
  lines. Each hides that behind one interface.
- **Authentication.** Players are anonymous. Credentials belong in a separate
  `player_credentials` table when they arrive, so `players` can stay readable.
- **Content.** One chapter of five memory fragments and eight milestones,
  written twice for now: `database/seeds/` for the server,
  `frontend/src/data/` for the offline game.
- **Richer progression.** Echo's traits are recorded and drift with the
  conversation, but nothing reads them back yet — a model provider would
  condition its prompt on them, and the rules engine does not.
- **Unit tests and CI.** There is an end-to-end check but no unit suite and no
  pipeline running it.
