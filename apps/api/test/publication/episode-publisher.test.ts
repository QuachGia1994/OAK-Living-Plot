import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../../migrations/0001_initial.sql?raw';
import migrationTwo from '../../migrations/0002_episode_publication.sql?raw';
import type { AppEnv } from '../../src/env';
import { D1EpisodePublisher } from '../../src/publication/d1-episode-publisher';
import type { EpisodePublicationInput } from '../../src/publication/contracts';
import { applySqlMigration, resetStoryData } from '../d1-test-utils';
import { makeValidProposal } from '../drama-fixtures';

const db = (env as unknown as AppEnv).DB;

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await applySqlMigration(db, migrationTwo);
});

beforeEach(async () => {
  await resetStoryData(db);
});

describe('D1EpisodePublisher', () => {
  it('publishes one episode, three immutable choices, and advances plot version atomically', async () => {
    await seedPlot('user-1', 'plot-1', 4, 3);
    const publisher = new D1EpisodePublisher(db);

    const result = await publisher.publish(makePublicationInput('generation-0001', 4));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      episodeNumber: 3,
      generationKey: 'generation-0001',
      stateVersionBefore: 4,
      stateVersionAfterPublish: 5,
      replayed: false,
    });
    expect(result.value.choices.map((choice) => choice.key)).toEqual(['A', 'B', 'C']);

    const episode = await db
      .prepare(
        'SELECT generation_key, state_version_before, state_version_after_publish, provider, model, generation_attempts, input_tokens, output_tokens FROM episodes WHERE id = ?',
      )
      .bind(result.value.id)
      .first<Record<string, unknown>>();
    expect(episode).toMatchObject({
      generation_key: 'generation-0001',
      state_version_before: 4,
      state_version_after_publish: 5,
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      generation_attempts: 1,
      input_tokens: 120,
      output_tokens: 80,
    });

    const choices = await db
      .prepare('SELECT choice_key, intent, consequence, state_delta_json FROM episode_choices WHERE episode_id = ? ORDER BY position')
      .bind(result.value.id)
      .all<{ choice_key: string; intent: string; consequence: string; state_delta_json: string }>();
    expect(choices.results).toHaveLength(3);
    expect(choices.results.map((choice) => choice.choice_key)).toEqual(['A', 'B', 'C']);
    expect(choices.results.every((choice) => JSON.parse(choice.state_delta_json))).toBe(true);

    const plot = await loadPlotState();
    expect(plot).toEqual({ version: 5, next_episode_number: 4, summary: makeValidProposal().summary });
  });

  it('returns the original episode for a repeated generation key without advancing state again', async () => {
    await seedPlot('user-1', 'plot-1', 0, 1);
    const publisher = new D1EpisodePublisher(db);
    const input = makePublicationInput('generation-repeat', 0);

    const first = await publisher.publish(input);
    const second = await publisher.publish({ ...input, proposal: { ...input.proposal, title: 'Different retry payload' } });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.id).toBe(first.value.id);
    expect(second.value.title).toBe(first.value.title);
    expect(second.value.replayed).toBe(true);
    expect(await countRows('episodes')).toBe(1);
    expect(await countRows('episode_choices')).toBe(3);
    expect(await loadPlotState()).toMatchObject({ version: 1, next_episode_number: 2 });
  });

  it('converges concurrent same-key requests onto one episode', async () => {
    await seedPlot('user-1', 'plot-1', 0, 1);
    const publisher = new D1EpisodePublisher(db);
    const input = makePublicationInput('generation-race-same', 0);

    const [left, right] = await Promise.all([publisher.publish(input), publisher.publish(input)]);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value.id).toBe(right.value.id);
    expect([left.value.replayed, right.value.replayed].filter(Boolean)).toHaveLength(1);
    expect(await countRows('episodes')).toBe(1);
    expect(await countRows('episode_choices')).toBe(3);
    expect(await loadPlotState()).toMatchObject({ version: 1, next_episode_number: 2 });
  });

  it('allows only one of two concurrent different-key publications at the same state version', async () => {
    await seedPlot('user-1', 'plot-1', 0, 1);
    const publisher = new D1EpisodePublisher(db);

    const [left, right] = await Promise.all([
      publisher.publish(makePublicationInput('generation-race-left', 0)),
      publisher.publish(makePublicationInput('generation-race-right', 0)),
    ]);

    const successes = [left, right].filter((result) => result.ok);
    const failures = [left, right].filter((result) => !result.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0].ok || !successes[0].ok) return;
    expect(failures[0].error).toMatchObject({ code: 'pending_episode', episodeId: successes[0].value.id });
    expect(await countRows('episodes')).toBe(1);
    expect(await countRows('episode_choices')).toBe(3);
    expect(await loadPlotState()).toMatchObject({ version: 1, next_episode_number: 2 });
  });

  it('blocks a second episode until the ready episode receives a choice', async () => {
    await seedPlot('user-1', 'plot-1', 0, 1);
    const publisher = new D1EpisodePublisher(db);
    const first = await publisher.publish(makePublicationInput('generation-pending-first', 0));
    if (!first.ok) throw new Error('Failed to seed pending episode.');

    const second = await publisher.publish(makePublicationInput('generation-pending-second', 1));

    expect(second).toEqual({
      ok: false,
      error: {
        code: 'pending_episode',
        message: 'A published episode still awaits a choice.',
        episodeId: first.value.id,
      },
    });
    expect(await countRows('episodes')).toBe(1);
    expect(await loadPlotState()).toMatchObject({ version: 1, next_episode_number: 2 });
  });

  it('rejects a stale publication before writing', async () => {
    await seedPlot('user-1', 'plot-1', 2, 3);
    const publisher = new D1EpisodePublisher(db);

    const result = await publisher.publish(makePublicationInput('generation-stale', 1));

    expect(result).toEqual({
      ok: false,
      error: { code: 'stale_state', message: 'Plot state version is stale.', currentStateVersion: 2 },
    });
    expect(await countRows('episodes')).toBe(0);
    expect(await countRows('episode_choices')).toBe(0);
    expect(await loadPlotState()).toMatchObject({ version: 2, next_episode_number: 3 });
  });

  it('does not reveal or publish another user plot', async () => {
    await seedPlot('owner-user', 'plot-1', 0, 1);
    const publisher = new D1EpisodePublisher(db);

    const result = await publisher.publish({ ...makePublicationInput('generation-owner', 0), userId: 'attacker-user' });

    expect(result).toEqual({ ok: false, error: { code: 'not_found', message: 'Plot not found.' } });
    expect(await countRows('episodes')).toBe(0);
  });
});

function makePublicationInput(generationKey: string, expectedStateVersion: number): EpisodePublicationInput {
  return {
    userId: 'user-1',
    plotId: 'plot-1',
    generationKey,
    expectedStateVersion,
    proposal: makeValidProposal(),
    generation: {
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      attempts: 1,
      usage: { inputTokens: 120, outputTokens: 80 },
    },
  };
}

async function seedPlot(userId: string, plotId: string, version: number, nextEpisodeNumber: number): Promise<void> {
  await db.prepare('INSERT INTO users (id) VALUES (?)').bind(userId).run();
  await db
    .prepare(
      'INSERT INTO plots (id, user_id, title, premise, version, next_episode_number) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(plotId, userId, 'Publication test', 'A story used to verify atomic episode publication.', version, nextEpisodeNumber)
    .run();
}

async function countRows(table: 'episodes' | 'episode_choices'): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return row?.count ?? 0;
}

async function loadPlotState(): Promise<{ version: number; next_episode_number: number; summary: string } | null> {
  return db
    .prepare('SELECT version, next_episode_number, summary FROM plots WHERE id = ?')
    .bind('plot-1')
    .first<{ version: number; next_episode_number: number; summary: string }>();
}
