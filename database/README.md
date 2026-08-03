# Database

PostgreSQL 16. Plain SQL migrations, run by a small Node script — no ORM, so the
schema stays readable and portable if the data layer is swapped later.

## Layout

| Path          | Purpose                                                              |
| ------------- | -------------------------------------------------------------------- |
| `migrations/` | Numbered, forward-only schema changes. Applied once, tracked in `schema_migrations`. |
| `seeds/`      | Authored game content: chapters, memory fragments, milestones. Idempotent, safe to re-run. |
| `scripts/`    | The migrate / seed / reset / verify runners invoked by the root `npm` scripts. |
| `docker-compose.yml` | Local Postgres instance.                                       |

## Usage

```bash
npm run db:up        # start Postgres in Docker
npm run db:migrate   # apply pending migrations
npm run db:seed      # load chapters, memory fragments and milestones
npm run db:reset     # drop everything (local only), then migrate again
npm run db:verify    # prove the migrations work, on a throwaway Postgres
```

Connection string is read from `DATABASE_URL`, falling back to `backend/.env`.

`db:verify` needs no Docker and touches nothing you own: it starts its own
temporary PostgreSQL, applies every migration twice — once to an empty database
and once to one already holding players, sessions and messages — and asserts
that the backfills moved the old data correctly. Since migrations are
forward-only, that is the only chance to find out before production.

## Design

Two ideas shape the schema.

**Content is separated from progress.** `memory_chapters`, `memory_fragments`
and `milestones` are identical for every player and live in `seeds/`. Their
counterparts — `player_memories`, `player_milestones`, `game_progress` — hold
one player's version of events. Adding a chapter or an award is a seed row, not
a migration and not a code change.

**A conversation is not a session.** A session is one visit and expires after
thirty minutes of silence. A conversation is the thread with Echo and outlives
any number of visits. Messages belong to the conversation, which is what lets a
player close the tab on Tuesday and be remembered on Friday. The session is
still recorded on each message as provenance.

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

### Player profile

- **`players`** — identity and profile: display name, pronouns, locale, time
  zone, and a `preferences` JSONB blob for client-side settings that no query
  ever filters on. Anonymous by default. When authentication arrives it belongs
  in a separate `player_credentials` table, because credentials are what needs
  isolating — not a display name.

### Conversations

- **`conversations`** — one open thread per player, enforced by a partial unique
  index. `message_count` is denormalised because appending a message needs the
  row lock anyway (see below).
- **`messages`** — the append-only transcript, tagged with sender, emotion and
  the trust the exchange moved. `seq` numbers each line within its thread:
  `created_at` alone is not enough, because a reply can land in the same
  millisecond as the line it answers and the tiebreaker was a random uuid.
  `seq` is allocated from the conversation's counter inside a transaction, so
  concurrent appends cannot collide.
- **`sessions`** — one visit, with `ended_reason` recording whether the player
  left, idled out, or the server shut down.

### Memories

- **`memory_chapters`** — named acts of the story, so a chapter can have a title
  rather than being a bare integer.
- **`memory_fragments`** — the authored catalogue, ordered within a chapter and
  gated by `required_trust`.
- **`player_memories`** — which fragments this player recovered, how clearly,
  and — via `triggered_by_message_id` — the line that brought each one back.

### Personality state

- **`echo_personality`** — who Echo is with this player. Trust is the
  relationship, mood is the moment, and four traits (warmth, curiosity,
  playfulness, openness) are her character. Traits drift by at most two points
  per exchange, so they take a conversation to shift rather than one good line.
- **`personality_events`** — append-only record of every change and its cause,
  including what the AI provider *asked* for before clamping. Without it,
  personality is a single mutable row: you can see that Echo is warm but never
  why, and a tuning mistake is invisible after the fact.

### Game progress

- **`game_progress`** — a rollup: current chapter, memories recovered, messages
  sent, visits, best trust, completion. Every column is derivable from the
  tables above; it exists so the common read is one indexed lookup instead of
  four aggregates. `progressModel.recompute` rebuilds it from source, and the
  end-to-end suite asserts that a rebuild changes nothing.
  Play time is deliberately *not* stored — it is the one figure that changes
  while nothing happens, so it is summed from `sessions` on read.
- **`milestones` / `player_milestones`** — awards, granted when the matching
  counter reaches a threshold.

## Conventions

- New migrations are numbered sequentially: `002_...sql`, `003_...sql`.
- Migrations are never edited after being applied on a shared environment;
  correct them with a new migration instead.
- Each migration runs inside a transaction and rolls back entirely on failure.
- Seeds run in filename order and must be re-runnable (`ON CONFLICT … DO
  UPDATE`), since `db:seed` applies all of them every time.
- Tables carrying `updated_at` maintain it with the shared `set_updated_at()`
  trigger, so no hand-written `UPDATE` can forget it.
