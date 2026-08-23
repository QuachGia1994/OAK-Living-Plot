CREATE TABLE scene_artworks (
  scene_id TEXT NOT NULL,
  plot_id TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  object_key TEXT,
  status TEXT NOT NULL DEFAULT 'missing',
  generation_token TEXT,
  provider TEXT NOT NULL DEFAULT 'workers-ai',
  model TEXT NOT NULL DEFAULT '@cf/black-forest-labs/flux-2-klein-4b',
  attempts INTEGER NOT NULL DEFAULT 0,
  failure_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  ready_at INTEGER,
  PRIMARY KEY (scene_id, content_fingerprint),
  FOREIGN KEY (scene_id) REFERENCES episodes(id) ON DELETE CASCADE,
  FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE CASCADE,
  CHECK (length(trim(content_fingerprint)) BETWEEN 8 AND 128),
  CHECK (status IN ('missing', 'generating', 'ready', 'failed')),
  CHECK (status != 'generating' OR generation_token IS NOT NULL),
  CHECK (attempts >= 0),
  CHECK ((status = 'ready' AND object_key IS NOT NULL AND ready_at IS NOT NULL) OR status != 'ready')
) STRICT;

CREATE INDEX idx_scene_artworks_plot_scene
  ON scene_artworks(plot_id, scene_id, ready_at DESC);

CREATE INDEX idx_scene_artworks_status
  ON scene_artworks(status, updated_at);
