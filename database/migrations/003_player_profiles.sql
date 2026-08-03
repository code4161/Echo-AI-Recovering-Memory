-- 003_player_profiles.sql
-- Turns `players` from a name into a profile.
--
-- Identity and profile are kept in one table on purpose. The split that will
-- matter later is credentials, not presentation: when authentication arrives it
-- belongs in a separate `player_credentials` table so password hashes and
-- tokens can be granted narrower access than the rest of the row.

-- Every table with an `updated_at` uses this, so the column can never be
-- forgotten by a hand-written UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER TABLE players
  -- Echo addresses the player directly, so this is dialogue input, not decoration.
  ADD COLUMN pronouns    TEXT,
  ADD COLUMN locale      TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN time_zone   TEXT,
  -- Client-side settings (reduced motion, text speed, …). Deliberately schemaless:
  -- these change with the UI and no query ever filters on them.
  ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE players
  ADD CONSTRAINT players_display_name_present CHECK (btrim(display_name) <> ''),
  ADD CONSTRAINT players_preferences_object CHECK (jsonb_typeof(preferences) = 'object');

CREATE TRIGGER players_touch_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- "Who has played recently", for maintenance and future retention work.
CREATE INDEX players_last_seen_idx ON players (last_seen_at DESC);
