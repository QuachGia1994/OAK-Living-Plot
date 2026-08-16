CREATE TABLE revenuecat_events (
  id TEXT PRIMARY KEY,
  ingest_token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  environment TEXT,
  event_timestamp_ms INTEGER NOT NULL,
  entitlement_ids_json TEXT NOT NULL DEFAULT '[]',
  product_id TEXT,
  transaction_id TEXT,
  provider_request_date_ms INTEGER NOT NULL,
  tier_after TEXT NOT NULL,
  plus_expires_at INTEGER,
  received_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(trim(id)) BETWEEN 1 AND 255),
  CHECK (length(trim(ingest_token)) BETWEEN 1 AND 255),
  CHECK (length(trim(event_type)) BETWEEN 1 AND 80),
  CHECK (environment IS NULL OR environment IN ('PRODUCTION', 'SANDBOX')),
  CHECK (event_timestamp_ms >= 0),
  CHECK (json_valid(entitlement_ids_json)),
  CHECK (provider_request_date_ms >= 0),
  CHECK (tier_after IN ('free', 'plus')),
  CHECK (plus_expires_at IS NULL OR plus_expires_at >= 0)
) STRICT;

CREATE INDEX idx_revenuecat_events_user_received
  ON revenuecat_events(user_id, received_at DESC);

CREATE TABLE user_entitlements (
  user_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'free',
  plus_expires_at INTEGER,
  provider_request_date_ms INTEGER NOT NULL DEFAULT 0,
  source_event_id TEXT,
  synced_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (source_event_id) REFERENCES revenuecat_events(id) ON DELETE SET NULL,
  CHECK (tier IN ('free', 'plus')),
  CHECK (plus_expires_at IS NULL OR plus_expires_at >= 0),
  CHECK (provider_request_date_ms >= 0),
  CHECK (tier != 'free' OR plus_expires_at IS NULL)
) STRICT;

CREATE INDEX idx_user_entitlements_tier
  ON user_entitlements(tier, synced_at DESC);
