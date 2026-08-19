CREATE TABLE referral_codes (
  user_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(trim(code)) BETWEEN 8 AND 24)
) STRICT;

CREATE TABLE referral_claims (
  referred_user_id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  claimed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  plus_activated_at INTEGER,
  reward_event_id TEXT UNIQUE,
  reward_granted_at INTEGER,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (referred_user_id != inviter_user_id),
  CHECK (length(trim(code)) BETWEEN 8 AND 24),
  CHECK ((reward_granted_at IS NULL AND reward_event_id IS NULL) OR (reward_granted_at IS NOT NULL AND reward_event_id IS NOT NULL))
) STRICT;

CREATE INDEX idx_referral_claims_inviter
  ON referral_claims(inviter_user_id, reward_granted_at);

CREATE TABLE voice_bonus_grants (
  event_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE,
  referred_user_id TEXT NOT NULL,
  inviter_user_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  plus_activated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  applied_at INTEGER,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (referred_user_id),
  CHECK (credits > 0),
  CHECK (length(trim(event_id)) BETWEEN 1 AND 256),
  CHECK (length(trim(attempt_id)) BETWEEN 8 AND 128)
) STRICT;

CREATE INDEX idx_voice_bonus_grants_inviter
  ON voice_bonus_grants(inviter_user_id, applied_at);

CREATE TABLE voice_bonus_accounts (
  user_id TEXT PRIMARY KEY,
  available_credits INTEGER NOT NULL DEFAULT 0,
  earned_credits INTEGER NOT NULL DEFAULT 0,
  spent_credits INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (available_credits >= 0),
  CHECK (earned_credits >= 0),
  CHECK (spent_credits >= 0),
  CHECK (available_credits + spent_credits <= earned_credits)
) STRICT;

CREATE TABLE voice_bonus_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reservation_key TEXT NOT NULL,
  status TEXT NOT NULL,
  resource_id TEXT,
  last_event_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, reservation_key),
  CHECK (length(trim(reservation_key)) BETWEEN 8 AND 128),
  CHECK (status IN ('reserved', 'released', 'consumed')),
  CHECK (status != 'consumed' OR resource_id IS NOT NULL)
) STRICT;

CREATE INDEX idx_voice_bonus_reservations_user_status
  ON voice_bonus_reservations(user_id, status, updated_at);

CREATE TABLE character_portraits (
  plot_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  story_fingerprint TEXT NOT NULL,
  object_key TEXT,
  status TEXT NOT NULL DEFAULT 'stale',
  generation_token TEXT,
  provider TEXT NOT NULL DEFAULT 'workers-ai',
  model TEXT NOT NULL DEFAULT '@cf/black-forest-labs/flux-2-klein-4b',
  attempts INTEGER NOT NULL DEFAULT 0,
  failure_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  ready_at INTEGER,
  FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  PRIMARY KEY (plot_id, story_fingerprint),
  CHECK (length(trim(story_fingerprint)) BETWEEN 8 AND 128),
  CHECK (status IN ('stale', 'generating', 'ready', 'failed')),
  CHECK (status != 'generating' OR generation_token IS NOT NULL),
  CHECK (attempts >= 0),
  CHECK ((status = 'ready' AND object_key IS NOT NULL AND ready_at IS NOT NULL) OR status != 'ready')
) STRICT;

CREATE INDEX idx_character_portraits_status
  ON character_portraits(status, updated_at);
