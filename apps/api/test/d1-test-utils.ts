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
    'choice_commits',
    'episode_choices',
    'episodes',
    'characters',
    'daily_usage',
    'plots',
    'users',
  ];

  for (const table of tables) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
}
