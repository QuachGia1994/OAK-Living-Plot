CREATE TABLE IF NOT EXISTS drama_suggestion_cache (
  user_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at INTEGER,
  suggestions_json TEXT,
  ready_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, request_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(request_key) BETWEEN 8 AND 128),
  CHECK (length(input_fingerprint) = 64),
  CHECK (status IN ('pending', 'ready')),
  CHECK (
    (status = 'pending' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND suggestions_json IS NULL AND ready_at IS NULL)
    OR
    (status = 'ready' AND lease_token IS NULL AND lease_expires_at IS NULL AND suggestions_json IS NOT NULL AND json_valid(suggestions_json) AND ready_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_drama_suggestion_cache_owner_ready
  ON drama_suggestion_cache(user_id, status, ready_at);

CREATE INDEX IF NOT EXISTS idx_drama_suggestion_cache_updated
  ON drama_suggestion_cache(updated_at);
