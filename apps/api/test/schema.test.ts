import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import migrationSql from '../migrations/0001_initial.sql?raw';
import type { AppEnv } from '../src/env';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const db = (env as unknown as AppEnv).DB;

beforeEach(async () => {
  await applySqlMigration(db, migrationSql);
  await resetStoryData(db);
});

describe('D1 schema', () => {
  it('creates the core tables and supporting indexes', async () => {
    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all<{ name: string }>();
    const names = tables.results.map((row) => row.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'plots',
        'characters',
        'episodes',
        'episode_choices',
        'choice_commits',
        'daily_usage',
      ]),
    );

    const index = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_choice_commits_plot_sequence'")
      .first<{ name: string }>();
    expect(index?.name).toBe('idx_choice_commits_plot_sequence');
  });

  it('rejects a fourth choice position', async () => {
    await seedEpisode('episode-1');

    await expect(
      db
        .prepare('INSERT INTO episode_choices (id, episode_id, position, label) VALUES (?, ?, ?, ?)')
        .bind('choice-4', 'episode-1', 4, 'Impossible fourth choice')
        .run(),
    ).rejects.toThrow();
  });

  it('allows only one committed choice per episode', async () => {
    await seedEpisode('episode-1');
    await seedChoice('choice-1', 'episode-1', 1);
    await seedChoice('choice-2', 'episode-1', 2);
    await commitChoice('commit-1', 'episode-1', 'choice-1', 1);

    await expect(commitChoice('commit-2', 'episode-1', 'choice-2', 2)).rejects.toThrow();
  });

  it('rejects a choice that belongs to another episode', async () => {
    await seedEpisode('episode-1', 1);
    await seedEpisode('episode-2', 2);
    await seedChoice('choice-other', 'episode-2', 1);

    await expect(commitChoice('commit-invalid', 'episode-1', 'choice-other', 1)).rejects.toThrow();
  });

  it('prevents voiced usage from exceeding text usage', async () => {
    await seedUser();

    await expect(
      db
        .prepare('INSERT INTO daily_usage (user_id, usage_date, text_episodes, voiced_episodes) VALUES (?, ?, ?, ?)')
        .bind('user-1', '2026-08-16', 1, 2)
        .run(),
    ).rejects.toThrow();
  });
});

async function seedUser(): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').bind('user-1').run();
}

async function seedEpisode(episodeId: string, episodeNumber = 1): Promise<void> {
  await seedUser();
  await db
    .prepare('INSERT OR IGNORE INTO plots (id, user_id, title, premise) VALUES (?, ?, ?, ?)')
    .bind('plot-1', 'user-1', 'A difficult message', 'A friendship changes after a hidden message is discovered.')
    .run();
  await db
    .prepare('INSERT INTO episodes (id, plot_id, episode_number, title, script_json) VALUES (?, ?, ?, ?, ?)')
    .bind(episodeId, 'plot-1', episodeNumber, 'The Message', '{"scenes":[]}')
    .run();
}

async function seedChoice(id: string, episodeId: string, position: number): Promise<void> {
  await db
    .prepare('INSERT INTO episode_choices (id, episode_id, position, label) VALUES (?, ?, ?, ?)')
    .bind(id, episodeId, position, `Choice ${position}`)
    .run();
}

async function commitChoice(id: string, episodeId: string, choiceId: string, sequence: number): Promise<void> {
  await db
    .prepare('INSERT INTO choice_commits (id, plot_id, episode_id, choice_id, sequence) VALUES (?, ?, ?, ?, ?)')
    .bind(id, 'plot-1', episodeId, choiceId, sequence)
    .run();
}
