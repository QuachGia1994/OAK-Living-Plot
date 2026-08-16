CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK (auth_subject IS NULL OR length(trim(auth_subject)) > 0)
) STRICT;

CREATE TABLE IF NOT EXISTS plots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  premise TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  state_json TEXT NOT NULL DEFAULT '{"relationships":{},"facts":[],"openThreads":[],"tone":"neutral"}',
  summary TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  next_episode_number INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(trim(title)) BETWEEN 1 AND 120),
  CHECK (length(trim(premise)) BETWEEN 1 AND 2000),
  CHECK (status IN ('active', 'completed', 'archived')),
  CHECK (json_valid(state_json)),
  CHECK (version >= 0),
  CHECK (next_episode_number >= 1)
) STRICT;

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  traits_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE CASCADE,
  CHECK (length(trim(name)) BETWEEN 1 AND 80),
  CHECK (length(role) <= 120),
  CHECK (json_valid(traits_json))
) STRICT;

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  script_json TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ready',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  completed_at INTEGER,
  FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE CASCADE,
  UNIQUE (plot_id, episode_number),
  UNIQUE (plot_id, id),
  CHECK (episode_number >= 1),
  CHECK (length(trim(title)) BETWEEN 1 AND 120),
  CHECK (json_valid(script_json)),
  CHECK (status IN ('ready', 'completed')),
  CHECK (completed_at IS NULL OR completed_at >= created_at)
) STRICT;

CREATE TABLE IF NOT EXISTS episode_choices (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  UNIQUE (episode_id, position),
  UNIQUE (episode_id, id),
  CHECK (position BETWEEN 1 AND 3),
  CHECK (length(trim(label)) BETWEEN 1 AND 240)
) STRICT;

CREATE TABLE IF NOT EXISTS choice_commits (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  committed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (plot_id, episode_id) REFERENCES episodes(plot_id, id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id, choice_id) REFERENCES episode_choices(episode_id, id) ON DELETE CASCADE,
  UNIQUE (episode_id),
  UNIQUE (plot_id, sequence),
  CHECK (sequence >= 1)
) STRICT;

CREATE TABLE IF NOT EXISTS daily_usage (
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  text_episodes INTEGER NOT NULL DEFAULT 0,
  voiced_episodes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, usage_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(usage_date) = 10),
  CHECK (text_episodes >= 0),
  CHECK (voiced_episodes >= 0),
  CHECK (voiced_episodes <= text_episodes)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_plots_user_status_updated
  ON plots(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_characters_plot
  ON characters(plot_id);

CREATE INDEX IF NOT EXISTS idx_episodes_plot_number
  ON episodes(plot_id, episode_number);

CREATE INDEX IF NOT EXISTS idx_episode_choices_episode
  ON episode_choices(episode_id, position);

CREATE INDEX IF NOT EXISTS idx_choice_commits_plot_sequence
  ON choice_commits(plot_id, sequence);
