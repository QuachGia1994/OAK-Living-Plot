CREATE TABLE usage_events_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reservation_key TEXT NOT NULL,
  resource_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(utc_day) = 10),
  CHECK (resource_type IN ('text_episode', 'voice_episode')),
  CHECK (event_type IN ('reserved', 'released', 'consumed')),
  CHECK (length(trim(reservation_key)) BETWEEN 8 AND 128)
) STRICT;

INSERT INTO usage_events_v2
  (id, user_id, utc_day, resource_type, event_type, reservation_key, resource_id, created_at)
SELECT id, user_id, utc_day, resource_type, event_type, reservation_key, resource_id, created_at
FROM usage_events;

DROP TABLE usage_events;
ALTER TABLE usage_events_v2 RENAME TO usage_events;

CREATE INDEX idx_usage_events_user_day_resource
  ON usage_events(user_id, utc_day, resource_type, created_at);
CREATE INDEX idx_usage_events_reservation_lifecycle
  ON usage_events(user_id, reservation_key, event_type, created_at);
