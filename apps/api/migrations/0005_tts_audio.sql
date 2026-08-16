CREATE TABLE audio_assets (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  voice_variant TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_voice_id TEXT NOT NULL,
  language_code TEXT NOT NULL,
  reservation_key TEXT NOT NULL,
  object_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  input_characters INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  processing_token TEXT,
  processing_started_at INTEGER,
  failure_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  ready_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  UNIQUE (episode_id, voice_variant),
  UNIQUE (reservation_key),
  CHECK (length(trim(voice_variant)) BETWEEN 1 AND 64),
  CHECK (length(trim(provider)) BETWEEN 1 AND 32),
  CHECK (length(trim(provider_voice_id)) BETWEEN 1 AND 128),
  CHECK (length(trim(language_code)) BETWEEN 2 AND 32),
  CHECK (length(trim(reservation_key)) BETWEEN 8 AND 128),
  CHECK (status IN ('reserving', 'queued', 'processing', 'staged', 'ready', 'failed')),
  CHECK (input_characters >= 0),
  CHECK (attempts >= 0),
  CHECK ((status = 'ready' AND object_key IS NOT NULL AND ready_at IS NOT NULL) OR status != 'ready'),
  CHECK ((status = 'processing' AND processing_token IS NOT NULL AND processing_started_at IS NOT NULL) OR status != 'processing')
) STRICT;

CREATE INDEX idx_audio_assets_episode_status
  ON audio_assets(episode_id, status);

CREATE INDEX idx_audio_assets_status_updated
  ON audio_assets(status, updated_at);
