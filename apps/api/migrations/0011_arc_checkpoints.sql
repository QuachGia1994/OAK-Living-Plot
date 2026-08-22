CREATE TABLE IF NOT EXISTS arc_checkpoints (
  plot_id TEXT NOT NULL,
  through_scene_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (plot_id, through_scene_number),
  FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE CASCADE,
  CHECK (through_scene_number >= 1),
  CHECK (length(summary) BETWEEN 1 AND 600)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_arc_checkpoints_plot_scene
  ON arc_checkpoints(plot_id, through_scene_number DESC);
