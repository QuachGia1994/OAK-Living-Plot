export async function applySqlMigration(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  if (statements.length === 0) return;
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

export async function resetStoryData(db: D1Database): Promise<void> {
  const tables = [
    'scene_artworks',
    'character_portraits',
    'voice_bonus_reservations',
    'voice_bonus_grants',
    'voice_bonus_accounts',
    'referral_claims',
    'referral_codes',
    'user_preferences',
    'user_entitlements',
    'revenuecat_events',
    'usage_events',
    'quota_reservations',
    'audio_assets',
    'arc_checkpoints',
    'choice_commits',
    'episode_choices',
    'episodes',
    'characters',
    'daily_usage',
    'plots',
    'users',
  ];

  const placeholders = tables.map(() => '?').join(', ');
  const existing = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
    .bind(...tables)
    .all<{ name: string }>();
  const existingNames = new Set(existing.results.map((row) => row.name));
  const deletes = tables.filter((table) => existingNames.has(table)).map((table) => db.prepare(`DELETE FROM ${table}`));

  if (deletes.length > 0) await db.batch(deletes);
}
