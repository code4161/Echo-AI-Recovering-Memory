-- 006_chapters_and_progress.sql
-- Where the player is in the story, and what they have to show for it.
--
-- The split that runs through this file is the one already established by
-- memory_fragments/player_memories: authored **content** is identical for every
-- player and lives in seeds; **progress** is one row per player per thing
-- achieved. Adding a chapter or an award is then a seed file, not a migration.

-- ---------------------------------------------------------------------------
-- Chapters: content
-- ---------------------------------------------------------------------------

-- `memory_fragments.chapter` was a bare integer, so a chapter could not have a
-- name, a summary, or an existence of its own.
CREATE TABLE memory_chapters (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number     INTEGER NOT NULL UNIQUE CHECK (number > 0),
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Placeholders for whatever chapter numbers the seeded fragments already use.
-- The chapter seed replaces the titles by number.
INSERT INTO memory_chapters (number, slug, title)
SELECT DISTINCT f.chapter, 'chapter-' || f.chapter, 'Chapter ' || f.chapter
FROM memory_fragments f;

ALTER TABLE memory_fragments
  ADD COLUMN chapter_id UUID REFERENCES memory_chapters(id) ON DELETE RESTRICT;

UPDATE memory_fragments f
SET chapter_id = c.id
FROM memory_chapters c
WHERE c.number = f.chapter;

ALTER TABLE memory_fragments ALTER COLUMN chapter_id SET NOT NULL;

-- The integer is now derivable through the FK, so keeping it would be two
-- sources of truth for the same fact.
DROP INDEX memory_fragments_order_idx;
ALTER TABLE memory_fragments DROP COLUMN chapter;
CREATE UNIQUE INDEX memory_fragments_order_idx
  ON memory_fragments (chapter_id, unlock_order);

-- ---------------------------------------------------------------------------
-- Memory provenance: progress
-- ---------------------------------------------------------------------------

-- Which line brought this memory back. The journal can then say "you asked
-- about the rain, and she remembered", which is the whole point of the game.
ALTER TABLE player_memories
  ADD COLUMN conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN triggered_by_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Game progress: progress
-- ---------------------------------------------------------------------------

-- A rollup, one row per player. Every column here is derivable from the tables
-- above, and `progressModel.recompute` does exactly that — this table exists so
-- the common read is one indexed lookup instead of four aggregates.
--
-- Play time is deliberately *not* stored: it is the only figure that changes
-- without anything happening, so it is summed from `sessions` on read and
-- cannot drift.
CREATE TABLE game_progress (
  player_id         UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  current_chapter   INTEGER NOT NULL DEFAULT 1 CHECK (current_chapter > 0),
  memories_restored INTEGER NOT NULL DEFAULT 0 CHECK (memories_restored >= 0),
  -- Player lines only. Echo's replies are not an achievement.
  messages_sent     INTEGER NOT NULL DEFAULT 0 CHECK (messages_sent >= 0),
  sessions_started  INTEGER NOT NULL DEFAULT 0 CHECK (sessions_started >= 0),
  highest_trust     INTEGER NOT NULL DEFAULT 0 CHECK (highest_trust BETWEEN 0 AND 100),
  first_played_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_played_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the last fragment is recovered.
  completed_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER game_progress_touch_updated_at
  BEFORE UPDATE ON game_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backfill from what already happened.
INSERT INTO game_progress (
  player_id, memories_restored, messages_sent, sessions_started,
  highest_trust, first_played_at, last_played_at
)
SELECT
  p.id,
  (SELECT count(*) FROM player_memories pm WHERE pm.player_id = p.id),
  (SELECT count(*) FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
    WHERE c.player_id = p.id AND m.sender = 'player'),
  (SELECT count(*) FROM sessions s WHERE s.player_id = p.id),
  COALESCE((SELECT ep.trust_level FROM echo_personality ep WHERE ep.player_id = p.id), 0),
  p.created_at,
  p.last_seen_at
FROM players p;

-- ---------------------------------------------------------------------------
-- Milestones: content + progress
-- ---------------------------------------------------------------------------

CREATE TYPE milestone_kind AS ENUM ('trust', 'memories', 'messages', 'chapter');

-- Awarded when the matching counter reaches `threshold`, so a new award is one
-- seed row and needs no new code.
CREATE TABLE milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind        milestone_kind NOT NULL,
  threshold   INTEGER NOT NULL CHECK (threshold > 0),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX milestones_kind_idx ON milestones (kind, threshold);

CREATE TABLE player_milestones (
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  achieved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, milestone_id)
);
