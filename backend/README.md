# Backend

Node.js + Express 5 + Socket.io, written in TypeScript (ESM).

## The one rule

```
HTTP    →  routes  →  controllers  ┐
                                   ├→  services  →  models  →  db  →  Postgres
Socket  →  sockets/*.handler       ┘
```

**Both transports stop at the service layer.** A socket handler and a REST
controller for the same action call the same service and differ only in how
they deliver the result. Game logic never lives in a route handler or a socket
handler, so nothing is reachable over one transport and hidden from the other.

Read the layers as a chain of narrowing responsibility:

- **routes** know URLs and nothing else.
- **controllers** know HTTP — status codes, request shapes, JSON.
- **services** know the game — trust, memories, sessions, Echo's voice.
- **models** know SQL — and no game rules whatsoever.

---

## Every file

### Entry points

| File        | Purpose                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| `index.ts`  | Process entry. Starts the server; turns a boot failure into a loud exit.          |
| `server.ts` | Verifies the database, resolves the AI provider, opens the listener, attaches Socket.io, starts the sweeper, wires graceful shutdown. |
| `app.ts`    | Builds the Express app **without listening**, so tests can import and drive it.   |

### `config/` — settings, read once

| File        | Purpose                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| `env.ts`    | Reads and validates environment variables at import. The only file that touches `process.env`, so a missing variable fails at boot rather than mid-request. |
| `game.ts`   | Tunable game rules in one place: session idle timeout, cache TTL and size, message length, history window, trust clamps, Echo's thinking pace. Designer knobs, not magic numbers scattered through services. |

### `routes/` — URL to controller, nothing else

| File                 | Purpose                                                             |
| -------------------- | -------------------------------------------------------------------- |
| `index.ts`           | Mounts the groups under `/api`.                                       |
| `health.routes.ts`   | `/health` (liveness) and `/ready` (readiness).                        |
| `player.routes.ts`   | The only unauthenticated endpoints — how a client *gets* a session.   |
| `session.routes.ts`  | Everything acting on behalf of a player. Guarded as a whole router, so a new endpoint here is protected by default. |

### `controllers/` — thin HTTP adapters

Each does three things: read the request, call **one** service, shape the response.

| File                      | Purpose                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| `health.controller.ts`    | Liveness is cheap; readiness actually pings Postgres and reports the resolved AI provider and cache size. |
| `player.controller.ts`    | Registers a player and starts or resumes a session, then has Echo speak first. |
| `session.controller.ts`   | Returns the current snapshot; ends the session on request.          |
| `chat.controller.ts`      | Transcript history, plus a REST fallback for sending a message.     |
| `memory.controller.ts`    | The memory journal.                                                 |
| `profile.controller.ts`   | Reads and partially updates the player profile. Owns the allow-list of fields a player may change. |
| `progress.controller.ts`  | Counters and awards, and a window onto the personality audit log.   |

### `services/` — the game itself

| File                        | Purpose                                                         |
| --------------------------- | ---------------------------------------------------------------- |
| `session.service.ts`        | **Player session handling.** Register, start/resume, authorize, touch, end, and sweep idle sessions. Also assembles the `GameSnapshot` a client needs to render everything, and juggles the two lifetimes — a session is one visit, a conversation outlives them all. |
| `gameState.service.ts`      | **Game state management.** Owns trust, personality drift and memory unlocking, and caches each session's hot state (Echo's personality, the recent transcript) with write-through to Postgres. |
| `personality.rules.ts`      | Pure functions deciding how Echo's traits move. Derived from mood and trust rather than requested by the provider, so a model cannot choose its own character. |
| `chat.service.ts`           | The core loop: record the player's line, ask the provider, clamp the trust change, drift the traits, record Echo's reply, maybe recover a memory, update progress, award milestones. Transport-agnostic. |
| `memory.service.ts`         | The journal, with unearned fragments stripped of their text.      |
| `maintenance.service.ts`    | Background sweeper closing abandoned sessions and evicting stale cache entries. |
| `echo/`                     | The AI boundary. See [its README](src/services/echo/README.md).    |

### `models/` — all the SQL

| File                    | Purpose                                                             |
| ----------------------- | --------------------------------------------------------------------- |
| `rows.ts`               | Row shapes and the snake_case/Date → camelCase/ISO mapping. Every model returns domain objects, so no service ever sees a raw row. |
| `player.model.ts`       | Player profiles.                                                      |
| `session.model.ts`      | Session rows, including the idle-close query.                         |
| `conversation.model.ts` | The thread with Echo, and ensuring exactly one is open.               |
| `message.model.ts`      | The append-only transcript. `append` is the one transactional write: the conversation's counter allocates the message's position, so concurrent appends cannot collide. |
| `memory.model.ts`       | Chapters, fragments and per-player recovery.                          |
| `personality.model.ts`  | Echo's trust, mood and traits, plus the append-only event log behind them. |
| `progress.model.ts`     | The progress rollup, its recompute-from-source safety net, and milestone awarding. |

### `sockets/` — realtime transport

| File                | Purpose                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| `index.ts`          | Attaches Socket.io, installs the handshake guard, registers handlers.     |
| `authenticate.ts`   | Validates the session **during the handshake**, so a connection either belongs to a real session or never opens. Handlers can then trust `socket.data`. |
| `chat.handler.ts`   | Rooms, pacing and error reporting for the conversation. No game rules.    |

### `middleware/`

| File                 | Purpose                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| `requireSession.ts`  | The HTTP twin of the socket handshake guard. Loads and validates the session, attaches it to the request. |
| `errorHandler.ts`    | The single place an error becomes a response. Internal failures never leak their message in production. |
| `requestLogger.ts`   | Method, path, status and duration per request.                          |

### `utils/` — small helpers with no domain knowledge

| File          | Purpose                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| `errors.ts`   | `AppError` plus `badRequest` / `notFound` / `gone` / … constructors.          |
| `http.ts`     | Narrows Express 5's `string \| string[]` params; validates body strings.      |
| `ids.ts`      | `isUuid`. Turns a malformed id into a clean 404 instead of a Postgres type error. |
| `numbers.ts`  | `clamp` and `clampInt`.                                                       |
| `time.ts`     | `wait` and `isOlderThan`.                                                     |
| `logger.ts`   | Deliberately tiny, with a `LOG_LEVEL` threshold. Swap the body for pino without touching callers. |

### `types/`

| File                | Purpose                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| `domain.ts`         | Player, Session, Conversation, Message, MemoryChapter, MemoryFragment, EchoPersonality, PersonalityEvent, GameProgress, Milestone, GameSnapshot. |
| `socket-events.ts`  | Both directions of the realtime contract, typed, plus the room-name helper. |

---

## Player session handling

A session is one continuous play period, and its id is the client's credential.

1. `POST /api/players` creates the player and opens a session.
2. The client sends that id on every request as `Authorization: Session <id>`
   (or `x-session-id`), and in the socket handshake as `auth: { sessionId }`.
3. Every action touches `last_activity_at`.
4. A session idle past `gameConfig.session.idleTimeoutMs` (30 minutes) is closed.
   Returning after that starts a fresh *visit*.
5. The sweeper closes abandoned sessions on a timer so they do not accumulate.

Ending a visit costs the player nothing, because the conversation is a separate
row with a separate lifetime. A returning player gets a new session id and a
"welcome back", but lands in the same thread with the same trust, the same
personality and the whole transcript intact — Echo does not meet them again.

Partial unique indexes guarantee a player can never hold two open sessions
(migration 002) or two open conversations (migration 004), so those rules are
enforced by Postgres rather than by a check-then-insert race in application
code.

> This is **not authentication.** Anyone holding a session id can use it. It is
> a game session, not a login. Adding real auth means issuing a signed token in
> `session.service.ts` and verifying it in the two guards — no other file needs
> to change.

## Game state management

`gameState.service.ts` is the authority. Two jobs:

**It owns the rules.** A provider returns a *requested* trust delta and a mood;
this service decides what actually happens. Trust is clamped once per exchange
(`maxDeltaPerExchange`) and again against 0–100, so neither a client nor a
misbehaving language model can invent progress. Traits are not requested at all
— they are derived from the mood and the applied trust by
`personality.rules.ts`, because a provider that could set its own personality
could also decide to become whatever gets the best response. Memories unlock
here too, at most one per exchange in authored order, so a large trust jump
reveals the story a beat at a time instead of dumping three memories at once.

Every change is written to `personality_events` with the value the provider
asked for alongside the one that landed. A single mutable row can say that Echo
is warm; only the log can say why, or that something has been quietly clamping
+40 requests for a week.

**It keeps hot state hot.** A conversation hits the same rows over and over, so
Echo's personality and the recent transcript are cached per session and written
through to Postgres on every change. The transcript is loaded by *conversation*,
not session, which is what lets Echo pick up mid-thought after a week away.
Eviction is least-recently-used above `maxCachedSessions`; because writes go
straight through, evicting never loses anything.

> The cache lives in the process. Running more than one instance behind a load
> balancer means moving it to Redis and adding a Socket.io Redis adapter.
> Nothing outside `gameState.service.ts` and `sockets/index.ts` would change.

---

## API

All session routes require the session header.

| Method | Path                                | Auth | Purpose                          |
| ------ | ----------------------------------- | ---- | -------------------------------- |
| GET    | `/api/health`                       | –    | Liveness                         |
| GET    | `/api/ready`                        | –    | Readiness: database + provider   |
| POST   | `/api/players`                      | –    | Create a player, open a session  |
| POST   | `/api/players/:playerId/sessions`   | –    | Start or resume a session        |
| GET    | `/api/session`                      | yes  | Full game snapshot               |
| DELETE | `/api/session`                      | yes  | End the session                  |
| GET    | `/api/session/profile`              | yes  | The player's profile             |
| PATCH  | `/api/session/profile`              | yes  | Update name, pronouns, locale, time zone, preferences |
| GET    | `/api/session/messages`             | yes  | Transcript                       |
| POST   | `/api/session/messages`             | yes  | Send a message (REST fallback)   |
| GET    | `/api/session/memories`             | yes  | Journal, chapters and progress   |
| GET    | `/api/session/progress`             | yes  | Counters and milestones          |
| GET    | `/api/session/personality`          | yes  | Echo's traits and recent changes |

Errors are always `{ "error": { "code": string, "message": string } }`.

## Socket events

Connect with `io(url, { auth: { sessionId } })`.

| Direction       | Event              | Meaning                                |
| --------------- | ------------------ | -------------------------------------- |
| client → server | `chat:send`        | Player said something                  |
| client → server | `chat:typing`      | Relayed to other tabs on this session  |
| client → server | `session:sync`     | Re-send the snapshot                   |
| server → client | `session:ready`    | Full snapshot, sent on connect         |
| server → client | `chat:message`     | A message from either side             |
| server → client | `echo:typing`      | Echo is composing                      |
| server → client | `echo:state`       | Trust or mood changed                  |
| server → client | `memory:restored`  | A fragment was recovered               |
| server → client | `session:expired`  | Session ended; the socket then closes  |
| server → client | `error`            | `{ code, message }`                    |

The player's own message is echoed back by the server rather than assumed by
the client, so the transcript is server-ordered.

## Setup

```bash
cp .env.example .env
npm run db:up && npm run db:migrate && npm run db:seed   # from the repo root
npm run dev --workspace backend
```

## Testing

```bash
npm run e2e --workspace @echo/backend
```

`scripts/e2e.ts` starts a throwaway PostgreSQL (no Docker needed), migrates and
seeds it, boots the real HTTP and Socket.io servers, and asserts the whole
contract: the REST bootstrap, the handshake guard, event ordering, trust
clamping, memory unlock order, session renewal and validation. It then runs
`frontend/scripts/client-check.ts` against the same server, so the protocol is
verified from the consumer's side too rather than only from the side that
defines it. Nothing is left running afterwards.
