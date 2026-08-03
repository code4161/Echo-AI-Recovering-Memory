-- 005_personality.sql
-- Echo's personality: who she is with this player, and how she got there.
--
-- `echo_states` held trust and a mood. Trust is a relationship measure and mood
-- is a momentary one; neither describes character. Traits do, they drift slowly
-- rather than swinging per message, and they are what a real dialogue model
-- would be conditioned on.

-- Renaming the table leaves its index and constraints under the old name, which
-- would be confusing the first time someone reads an error message.
ALTER TABLE echo_states RENAME TO echo_personality;
ALTER INDEX echo_states_pkey RENAME TO echo_personality_pkey;
ALTER TABLE echo_personality
  RENAME CONSTRAINT echo_states_trust_level_check TO echo_personality_trust_level_check;

ALTER TABLE echo_personality
  -- 0..100 each, starting where Echo begins the story: curious and guarded.
  ADD COLUMN warmth      INTEGER NOT NULL DEFAULT 50 CHECK (warmth BETWEEN 0 AND 100),
  ADD COLUMN curiosity   INTEGER NOT NULL DEFAULT 65 CHECK (curiosity BETWEEN 0 AND 100),
  ADD COLUMN playfulness INTEGER NOT NULL DEFAULT 35 CHECK (playfulness BETWEEN 0 AND 100),
  ADD COLUMN openness    INTEGER NOT NULL DEFAULT 25 CHECK (openness BETWEEN 0 AND 100),
  ADD COLUMN created_at  TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER echo_personality_touch_updated_at
  BEFORE UPDATE ON echo_personality
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only audit of every change to the above.
--
-- Without it, personality is a single mutable row: you can see that Echo is
-- warm but never why, and a tuning mistake is invisible after the fact. It also
-- answers "what did that message actually do", which is what the UI shows when
-- trust moves.
--
-- Identity rather than uuid: this is the one table whose natural order is
-- insertion order, and it will be the largest.
CREATE TABLE personality_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  -- The line that caused it. Kept nullable so trimming a transcript never
  -- destroys the record of what it did.
  message_id      UUID REFERENCES messages(id) ON DELETE SET NULL,
  reason          TEXT NOT NULL,
  trust_before    INTEGER NOT NULL,
  trust_after     INTEGER NOT NULL,
  -- What the provider asked for before clamping, so a model that keeps
  -- demanding +40 is visible instead of silently capped.
  trust_requested INTEGER NOT NULL,
  mood_before     emotion NOT NULL,
  mood_after      emotion NOT NULL,
  -- Only the traits that moved, e.g. {"warmth": 2}.
  trait_deltas    JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(trait_deltas) = 'object'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX personality_events_player_idx
  ON personality_events (player_id, created_at DESC);
