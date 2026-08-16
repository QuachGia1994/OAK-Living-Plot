CREATE TABLE daily_usage_v2 (
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  text_episodes INTEGER NOT NULL DEFAULT 0,
  voiced_episodes INTEGER NOT NULL DEFAULT 0,
  text_reserved INTEGER NOT NULL DEFAULT 0,
  voice_reserved INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, usage_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(usage_date) = 10),
  CHECK (text_episodes >= 0),
  CHECK (voiced_episodes >= 0),
  CHECK (text_reserved >= 0),
  CHECK (voice_reserved >= 0)
) STRICT;

INSERT INTO daily_usage_v2 (user_id, usage_date, text_episodes, voiced_episodes, updated_at)
SELECT user_id, usage_date, text_episodes, voiced_episodes, updated_at FROM daily_usage;

DROP TABLE daily_usage;
ALTER TABLE daily_usage_v2 RENAME TO daily_usage;

CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reservation_key TEXT NOT NULL,
  resource_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, reservation_key, event_type),
  CHECK (length(utc_day) = 10),
  CHECK (resource_type IN ('text_episode', 'voice_episode')),
  CHECK (event_type IN ('reserved', 'released', 'consumed')),
  CHECK (length(trim(reservation_key)) BETWEEN 8 AND 128)
) STRICT;

CREATE INDEX idx_usage_events_user_day_resource
  ON usage_events(user_id, utc_day, resource_type, created_at);

CREATE TABLE quota_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reservation_key TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  status TEXT NOT NULL,
  resource_id TEXT,
  last_event_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, reservation_key),
  CHECK (length(trim(reservation_key)) BETWEEN 8 AND 128),
  CHECK (length(utc_day) = 10),
  CHECK (resource_type IN ('text_episode', 'voice_episode')),
  CHECK (status IN ('reserved', 'released', 'consumed')),
  CHECK (status != 'consumed' OR resource_id IS NOT NULL)
) STRICT;

CREATE INDEX idx_quota_reservations_user_day_status
  ON quota_reservations(user_id, utc_day, resource_type, status);
