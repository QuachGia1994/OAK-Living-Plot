export async function applySqlMigration(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

export async function resetStoryData(db: D1Database): Promise<void> {
  const tables = [
    'usage_events',
    'quota_reservations',
    'choice_commits',
    'episode_choices',
    'episodes',
    'characters',
    'daily_usage',
    'plots',
    'users',
  ];

  for (const table of tables) {
    const exists = await db
      .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?")
      .bind(table)
      .first<{ found: number }>();
    if (exists?.found === 1) await db.prepare(`DELETE FROM ${table}`).run();
  }
}
