-- 004_conversations.sql
-- Separates the conversation from the connection.
--
-- Until now a message belonged to a `session`, and a session ends after 30
-- minutes idle. That meant Echo's readable history was wiped every time the
-- player closed the tab for half an hour, even though her trust in them
-- persisted — she could feel close to someone she had no record of meeting.
--
-- A conversation is the continuous thread with Echo and outlives any number of
-- sessions. A session is still recorded on each message as provenance ("which
-- visit produced this line"), but it no longer owns it.

CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  title           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Denormalised so appending a message can allocate its `seq` under the row
  -- lock this counter already needs. Also saves a count() on every snapshot.
  message_count   INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  ended_at        TIMESTAMPTZ
);

CREATE INDEX conversations_player_idx ON conversations (player_id, started_at DESC);

-- The game gives a player one ongoing thread. Enforced here rather than by a
-- check-then-insert race in application code.
CREATE UNIQUE INDEX conversations_one_active_per_player_idx
  ON conversations (player_id)
  WHERE ended_at IS NULL;

ALTER TABLE messages
  ADD COLUMN conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  -- Position in the thread. `created_at` is not enough: a reply can land in the
  -- same millisecond as the line it answers, and the tiebreaker was a random
  -- uuid, so the transcript could render out of order.
  ADD COLUMN seq             INTEGER,
  -- How much this exchange moved trust. Lets the transcript explain itself
  -- without replaying the whole personality event log.
  ADD COLUMN trust_delta     INTEGER NOT NULL DEFAULT 0;

-- Backfill: everything a player has ever said becomes their one thread.
INSERT INTO conversations (player_id, started_at, last_message_at, message_count)
SELECT
  s.player_id,
  min(s.started_at),
  COALESCE(max(m.created_at), min(s.started_at)),
  count(m.id)
FROM sessions s
LEFT JOIN messages m ON m.session_id = s.id
GROUP BY s.player_id;

UPDATE messages m
SET conversation_id = c.id
FROM sessions s
JOIN conversations c ON c.player_id = s.player_id
WHERE m.session_id = s.id;

WITH ordered AS (
  SELECT id, row_number() OVER (
    PARTITION BY conversation_id ORDER BY created_at, id
  ) AS position
  FROM messages
)
UPDATE messages m
SET seq = ordered.position
FROM ordered
WHERE ordered.id = m.id;

-- Orphans cannot exist after the backfill, so the thread becomes mandatory.
ALTER TABLE messages
  ALTER COLUMN conversation_id SET NOT NULL,
  ALTER COLUMN seq SET NOT NULL;

ALTER TABLE messages
  ADD CONSTRAINT messages_seq_positive CHECK (seq > 0);

CREATE UNIQUE INDEX messages_conversation_seq_idx ON messages (conversation_id, seq);

-- The session is now provenance. Deleting a stale session must not delete the
-- conversation it happened to carry, so the cascade becomes a null.
ALTER TABLE messages DROP CONSTRAINT messages_session_id_fkey;

ALTER TABLE messages
  ALTER COLUMN session_id DROP NOT NULL,
  ADD CONSTRAINT messages_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

DROP INDEX messages_session_id_idx;
CREATE INDEX messages_session_idx ON messages (session_id) WHERE session_id IS NOT NULL;

-- Why a session ended, for the maintenance log and future analytics.
ALTER TABLE sessions
  ADD COLUMN ended_reason TEXT
    CHECK (ended_reason IS NULL OR ended_reason IN ('player', 'idle', 'shutdown'));
