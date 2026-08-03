-- 002_session_activity.sql
-- Session lifecycle support.
--
-- A session is resumable: a player who closes the tab and comes back should
-- rejoin the same conversation, but only if they were away briefly. That needs
-- a last-touched timestamp the server can compare against an idle timeout.

ALTER TABLE sessions
  ADD COLUMN last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: existing rows have never been touched since they began.
UPDATE sessions SET last_activity_at = started_at;

-- Supports both "find this player's resumable session" and the idle sweeper.
CREATE INDEX sessions_open_activity_idx
  ON sessions (last_activity_at)
  WHERE ended_at IS NULL;

-- A player should never accumulate two open sessions at once.
CREATE UNIQUE INDEX sessions_one_open_per_player_idx
  ON sessions (player_id)
  WHERE ended_at IS NULL;
