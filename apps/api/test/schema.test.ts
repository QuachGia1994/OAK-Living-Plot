import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationFive from '../migrations/0005_tts_audio.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
import migrationSeven from '../migrations/0007_live_story_integration.sql?raw';
import migrationEight from '../migrations/0008_user_preferences.sql?raw';
import migrationNine from '../migrations/0009_retryable_quota_reservations.sql?raw';
import migrationTen from '../migrations/0010_referrals_portraits.sql?raw';
import migrationEleven from '../migrations/0011_arc_checkpoints.sql?raw';
import migrationTwelve from '../migrations/0012_scene_artworks.sql?raw';
import migrationThirteen from '../migrations/0013_drama_suggestion_cache.sql?raw';
import type { AppEnv } from '../src/env';
import { D1DramaRepository } from '../src/drama-runtime/d1-drama-repository';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const db = (env as unknown as AppEnv).DB;
let legacyRowsPreserved = false;

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await db.prepare('INSERT INTO users (id) VALUES (?)').bind('legacy-user').run();
  await db
    .prepare('INSERT INTO plots (id, user_id, title, premise) VALUES (?, ?, ?, ?)')
    .bind('legacy-plot', 'legacy-user', 'Legacy title', 'Legacy premise')
    .run();
  await db
    .prepare('INSERT INTO daily_usage (user_id, usage_date, text_episodes, voiced_episodes) VALUES (?, ?, ?, ?)')
    .bind('legacy-user', '2026-08-22', 1, 0)
    .run();
  for (const migration of [
    migrationTwo,
    migrationThree,
    migrationFour,
    migrationFive,
    migrationSix,
    migrationSeven,
    migrationEight,
    migrationNine,
    migrationTen,
    migrationEleven,
    migrationTwelve,
    migrationThirteen,
  ]) {
    await applySqlMigration(db, migration);
  }
  const legacyUser = await db.prepare('SELECT id FROM users WHERE id = ?').bind('legacy-user').first<{ id: string }>();
  const legacyPlot = await db.prepare('SELECT id FROM plots WHERE id = ?').bind('legacy-plot').first<{ id: string }>();
  const legacyUsage = await db
    .prepare('SELECT text_episodes FROM daily_usage WHERE user_id = ?')
    .bind('legacy-user')
    .first<{ text_episodes: number }>();
  legacyRowsPreserved = legacyUser?.id === 'legacy-user'
    && legacyPlot?.id === 'legacy-plot'
    && legacyUsage?.text_episodes === 1;
  await resetStoryData(db);
});

beforeEach(async () => {
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
        'arc_checkpoints',
        'scene_artworks',
        'drama_suggestion_cache',
      ]),
    );

    const index = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_choice_commits_plot_sequence'")
      .first<{ name: string }>();
    expect(index?.name).toBe('idx_choice_commits_plot_sequence');
    const checkpointIndex = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_arc_checkpoints_plot_scene'")
      .first<{ name: string }>();
    expect(checkpointIndex?.name).toBe('idx_arc_checkpoints_plot_scene');
  });

  it('applies migrations 0001 through 0013 without losing legacy rows', () => {
    expect(legacyRowsPreserved).toBe(true);
  });

  it('writes and reads compact derived arc checkpoints', async () => {
    await seedUser();
    await db
      .prepare('INSERT INTO plots (id, user_id, title, premise) VALUES (?, ?, ?, ?)')
      .bind('plot-checkpoint', 'user-1', 'Checkpoint story', 'A long-running checkpoint story.')
      .run();
    await db
      .prepare('INSERT INTO arc_checkpoints (plot_id, through_scene_number, summary) VALUES (?, ?, ?)')
      .bind('plot-checkpoint', 5, 'S1–S5: Mina follows the signal and commits to the eastern route.')
      .run();

    const checkpoint = await db
      .prepare('SELECT through_scene_number, summary FROM arc_checkpoints WHERE plot_id = ?')
      .bind('plot-checkpoint')
      .first<{ through_scene_number: number; summary: string }>();

    expect(checkpoint).toEqual({
      through_scene_number: 5,
      summary: 'S1–S5: Mina follows the signal and commits to the eastern route.',
    });
  });

  it('loads generation context without arc memory before migration 0011 exists', async () => {
    await seedUser();
    await db
      .prepare('INSERT INTO plots (id, user_id, title, premise, next_episode_number) VALUES (?, ?, ?, ?, ?)')
      .bind('plot-pre-0011', 'user-1', 'Pre-migration story', 'A story created before arc checkpoints.', 10)
      .run();
    await db
      .prepare('INSERT INTO characters (id, plot_id, name, role) VALUES (?, ?, ?, ?)')
      .bind('character-pre-0011', 'plot-pre-0011', 'Mina', 'protagonist')
      .run();
    await db.prepare('DROP TABLE arc_checkpoints').run();

    try {
      const repository = new D1DramaRepository(db);
      const context = await repository.loadGenerationContext('user-1', 'plot-pre-0011');
      expect(context?.input.arcMemory).toEqual([]);
    } finally {
      await applySqlMigration(db, migrationEleven);
    }
  });

  it('enforces the noncanonical suggestion-cache lifecycle and owner cascade', async () => {
    await seedUser();
    await db.prepare(
      `INSERT INTO drama_suggestion_cache
         (user_id, request_key, input_fingerprint, status, lease_token, lease_expires_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
    ).bind('user-1', 'suggestion-schema-001', 'a'.repeat(64), 'lease-token', 1234).run();
    expect(await db.prepare("SELECT status FROM drama_suggestion_cache WHERE request_key = 'suggestion-schema-001'").first()).toEqual({ status: 'pending' });

    await expect(db.prepare(
      `INSERT INTO drama_suggestion_cache
         (user_id, request_key, input_fingerprint, status, suggestions_json, ready_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
    ).bind('user-1', 'suggestion-schema-bad', 'b'.repeat(64), 'not-json', 1234).run()).rejects.toThrow();

    await db.prepare("DELETE FROM users WHERE id = 'user-1'").run();
    expect(await db.prepare('SELECT COUNT(*) AS count FROM drama_suggestion_cache').first()).toEqual({ count: 0 });
  });

  it('writes derived Scene artwork metadata and cascades it with the canonical Scene', async () => {
    await seedEpisode('episode-artwork');
    await db
      .prepare(
        `INSERT INTO scene_artworks
           (scene_id, plot_id, content_fingerprint, status, generation_token, attempts)
         VALUES (?, ?, ?, 'generating', ?, 1)`,
      )
      .bind('episode-artwork', 'plot-1', 'fingerprint-001', 'generation-token')
      .run();
    await db
      .prepare(
        `UPDATE scene_artworks
         SET status = 'ready', generation_token = NULL, object_key = ?, ready_at = ?
         WHERE scene_id = ? AND content_fingerprint = ?`,
      )
      .bind('scene-artworks/plot-1/episode-artwork/private.jpg', 1234, 'episode-artwork', 'fingerprint-001')
      .run();

    expect(await db.prepare("SELECT status, attempts, ready_at FROM scene_artworks WHERE scene_id = 'episode-artwork'").first()).toEqual({
      status: 'ready',
      attempts: 1,
      ready_at: 1234,
    });
    await db.prepare("DELETE FROM episodes WHERE id = 'episode-artwork'").run();
    expect(await db.prepare("SELECT COUNT(*) AS count FROM scene_artworks WHERE scene_id = 'episode-artwork'").first()).toEqual({ count: 0 });
  });

  it('rejects impossible Scene artwork lifecycle rows', async () => {
    await seedEpisode('episode-artwork-invalid');
    await expect(
      db.prepare(
        `INSERT INTO scene_artworks
           (scene_id, plot_id, content_fingerprint, status, attempts)
         VALUES (?, ?, ?, 'generating', 1)`,
      ).bind('episode-artwork-invalid', 'plot-1', 'fingerprint-invalid').run(),
    ).rejects.toThrow();
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

  it('prevents negative usage counters in the current quota schema', async () => {
    await seedUser();

    await expect(
      db
        .prepare('INSERT INTO daily_usage (user_id, usage_date, text_episodes, voiced_episodes) VALUES (?, ?, ?, ?)')
        .bind('user-1', '2026-08-16', -1, 0)
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
