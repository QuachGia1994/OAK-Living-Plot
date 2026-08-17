CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  ui_locale TEXT NOT NULL DEFAULT 'en',
  story_locale TEXT NOT NULL DEFAULT 'en-US',
  narrator_variant TEXT NOT NULL DEFAULT 'en-narrator-female',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (ui_locale IN ('en', 'vi')),
  CHECK (story_locale IN ('en-US', 'vi-VN')),
  CHECK (narrator_variant IN ('en-narrator-female', 'vi-narrator-female'))
) STRICT;
