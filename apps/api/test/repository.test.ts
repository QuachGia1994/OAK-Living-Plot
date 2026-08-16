import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import migrationSql from '../migrations/0001_initial.sql?raw';
import type { AppEnv } from '../src/env';
import { D1StoryRepository } from '../src/persistence/d1-story-repository';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const db = (env as unknown as AppEnv).DB;

beforeEach(async () => {
  await applySqlMigration(db, migrationSql);
  await resetStoryData(db);
});

describe('D1StoryRepository', () => {
  it('loads canonical structured memory with characters', async () => {
    await seedPlotMemory();
    const repository = new D1StoryRepository(db);

    const memory = await repository.loadOwnedPlotMemory('user-1', 'plot-1');

    expect(memory).toMatchObject({
      id: 'plot-1',
      userId: 'user-1',
      status: 'active',
      version: 2,
      nextEpisodeNumber: 3,
      state: {
        schemaVersion: 2,
        relationships: [
          { fromKey: 'legacy', toKey: 'linh', affinity: 72, trust: 0, tension: 0, status: 'legacy' },
        ],
        facts: [{ key: 'legacy-fact-1', text: 'The message was hidden.' }],
        openThreads: [{ key: 'legacy-thread-1', title: 'Linh suspects betrayal.', urgency: 50 }],
        tone: 'tense',
      },
    });
    expect(memory?.characters).toEqual([
      {
        id: 'character-linh',
        name: 'Linh',
        role: 'best friend',
        traits: { trust: 'fragile' },
      },
    ]);
  });

  it('returns null for an unknown plot', async () => {
    const repository = new D1StoryRepository(db);
    await expect(repository.loadOwnedPlotMemory('user-1', 'missing')).resolves.toBeNull();
  });

  it('does not load a plot owned by another user', async () => {
    await seedPlotMemory();
    await db.prepare('INSERT INTO users (id) VALUES (?)').bind('user-2').run();
    const repository = new D1StoryRepository(db);

    await expect(repository.loadOwnedPlotMemory('user-2', 'plot-1')).resolves.toBeNull();
  });
});

async function seedPlotMemory(): Promise<void> {
  await db.prepare('INSERT INTO users (id) VALUES (?)').bind('user-1').run();
  await db
    .prepare(
      'INSERT INTO plots (id, user_id, title, premise, state_json, summary, version, next_episode_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      'plot-1',
      'user-1',
      'The Message',
      'A friendship shifts after a secret is discovered.',
      '{"relationships":{"linh":72},"facts":["The message was hidden."],"openThreads":["Linh suspects betrayal."],"tone":"tense"}',
      'Linh found evidence of a hidden message.',
      2,
      3,
    )
    .run();
  await db
    .prepare('INSERT INTO characters (id, plot_id, name, role, traits_json) VALUES (?, ?, ?, ?, ?)')
    .bind('character-linh', 'plot-1', 'Linh', 'best friend', '{"trust":"fragile"}')
    .run();
}
