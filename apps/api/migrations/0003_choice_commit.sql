ALTER TABLE choice_commits ADD COLUMN choice_key TEXT;
ALTER TABLE choice_commits ADD COLUMN intent TEXT;
ALTER TABLE choice_commits ADD COLUMN consequence TEXT;
ALTER TABLE choice_commits ADD COLUMN state_version_before INTEGER;
ALTER TABLE choice_commits ADD COLUMN state_version_after INTEGER;
ALTER TABLE choice_commits ADD COLUMN state_json_after TEXT CHECK (state_json_after IS NULL OR json_valid(state_json_after));

CREATE INDEX IF NOT EXISTS idx_choice_commits_episode_choice
  ON choice_commits(episode_id, choice_id);
