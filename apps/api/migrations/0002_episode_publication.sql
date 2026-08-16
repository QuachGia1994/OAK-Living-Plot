ALTER TABLE episodes ADD COLUMN generation_key TEXT;
ALTER TABLE episodes ADD COLUMN state_version_before INTEGER;
ALTER TABLE episodes ADD COLUMN state_version_after_publish INTEGER;
ALTER TABLE episodes ADD COLUMN provider TEXT;
ALTER TABLE episodes ADD COLUMN model TEXT;
ALTER TABLE episodes ADD COLUMN generation_attempts INTEGER NOT NULL DEFAULT 1 CHECK (generation_attempts BETWEEN 1 AND 2);
ALTER TABLE episodes ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0);
ALTER TABLE episodes ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_plot_generation_key
  ON episodes(plot_id, generation_key)
  WHERE generation_key IS NOT NULL;

ALTER TABLE episode_choices ADD COLUMN choice_key TEXT;
ALTER TABLE episode_choices ADD COLUMN intent TEXT;
ALTER TABLE episode_choices ADD COLUMN consequence TEXT;
ALTER TABLE episode_choices ADD COLUMN state_delta_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_episode_choices_episode_key
  ON episode_choices(episode_id, choice_key)
  WHERE choice_key IS NOT NULL;
