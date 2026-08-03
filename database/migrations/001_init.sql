-- 001_init.sql
-- Core domain for Echo: players, their sessions, the conversation log,
-- the catalog of Echo's lost memories, and per-player recovery progress.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- A person playing the game. Anonymous by default; auth can be layered on later.
CREATE TABLE players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One continuous play period. A player accumulates many sessions over time.
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

CREATE INDEX sessions_player_id_idx ON sessions (player_id, started_at DESC);

-- Echo's emotional colouring, shared by messages and memory fragments.
CREATE TYPE emotion AS ENUM (
  'neutral',
  'happy',
  'sad',
  'curious',
  'afraid',
  'nostalgic'
);

CREATE TYPE message_sender AS ENUM ('player', 'echo');

-- The full conversation transcript. This is the raw material the AI layer
-- reads back as context, so it is append-only by convention.
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender      message_sender NOT NULL,
  content     TEXT NOT NULL,
  emotion     emotion NOT NULL DEFAULT 'neutral',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_session_id_idx ON messages (session_id, created_at);

-- Authored game content: every memory Echo can possibly recover.
-- This table is the same for all players and is populated by seeds.
CREATE TABLE memory_fragments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  content        TEXT NOT NULL,
  emotion        emotion NOT NULL DEFAULT 'neutral',
  chapter        INTEGER NOT NULL DEFAULT 1,
  unlock_order   INTEGER NOT NULL,
  required_trust INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX memory_fragments_order_idx
  ON memory_fragments (chapter, unlock_order);

-- Per-player progress: which fragments this player has helped Echo restore.
-- A row exists only once the fragment has been recovered.
CREATE TABLE player_memories (
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fragment_id  UUID NOT NULL REFERENCES memory_fragments(id) ON DELETE CASCADE,
  restored_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  clarity      INTEGER NOT NULL DEFAULT 100 CHECK (clarity BETWEEN 0 AND 100),
  PRIMARY KEY (player_id, fragment_id)
);

-- Echo's living state, one row per player. Trust gates which memories unlock.
CREATE TABLE echo_states (
  player_id    UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  trust_level  INTEGER NOT NULL DEFAULT 0 CHECK (trust_level BETWEEN 0 AND 100),
  mood         emotion NOT NULL DEFAULT 'curious',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
