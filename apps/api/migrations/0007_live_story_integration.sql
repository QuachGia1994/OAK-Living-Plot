ALTER TABLE plots ADD COLUMN creation_key TEXT
  CHECK (creation_key IS NULL OR length(trim(creation_key)) BETWEEN 8 AND 128);

ALTER TABLE plots ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US'
  CHECK (length(trim(locale)) BETWEEN 2 AND 20);

ALTER TABLE plots ADD COLUMN mood TEXT NOT NULL DEFAULT 'tense'
  CHECK (mood IN ('tense', 'romantic', 'mysterious', 'hopeful'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_plots_user_creation_key
  ON plots(user_id, creation_key)
  WHERE creation_key IS NOT NULL;
