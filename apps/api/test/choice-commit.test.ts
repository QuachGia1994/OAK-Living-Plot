import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import { D1ChoiceCommitter } from '../src/choice/d1-choice-committer';
import type { DramaState } from '../src/domain/drama-state';
import type { AppEnv } from '../src/env';
import { D1EpisodePublisher } from '../src/publication/d1-episode-publisher';
import type { PublishedEpisode } from '../src/publication/contracts';
import { applySqlMigration, resetStoryData } from './d1-test-utils';
import { makeValidProposal } from './drama-fixtures';

const db = (env as unknown as AppEnv).DB;

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await applySqlMigration(db, migrationTwo);
  await applySqlMigration(db, migrationThree);
});

beforeEach(async () => {
  await resetStoryData(db);
});

describe('D1ChoiceCommitter', () => {
  it('atomically commits one choice, completes the episode, applies state, and advances version once', async () => {
    const episode = await seedReadyEpisode('user-1', 'plot-1', 'generation-choice-1');
    const committer = new D1ChoiceCommitter(db);

    const result = await committer.commit(commitInput(episode, episode.choices[0].id, 1));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      episodeId: episode.id,
      choiceId: episode.choices[0].id,
      choiceKey: 'A',
      sequence: 1,
      stateVersionBefore: 1,
      stateVersionAfter: 2,
      replayed: false,
    });
    expect(result.value.state.relationships).toContainEqual({
      fromKey: 'hero',
      toKey: 'linh',
      affinity: 35,
      trust: 40,
      tension: 55,
      status: 'relationship shifts',
    });
    expect(result.value.state.facts).toContainEqual({
      key: `episode:${episode.id}:fact:1`,
      text: 'Linh knows An intentionally hid the message.',
    });
    expect(result.value.state.tone).toBe('raw');

    const plot = await loadPlot('plot-1');
    expect(plot?.version).toBe(2);
    expect(JSON.parse(plot?.state_json ?? '{}')).toEqual(result.value.state);
    const storedEpisode = await db.prepare('SELECT status FROM episodes WHERE id = ?').bind(episode.id).first<{ status: string }>();
    expect(storedEpisode?.status).toBe('completed');
    const commit = await db
      .prepare('SELECT choice_key, state_version_before, state_version_after, state_json_after FROM choice_commits WHERE episode_id = ?')
      .bind(episode.id)
      .first<Record<string, unknown>>();
    expect(commit).toMatchObject({ choice_key: 'A', state_version_before: 1, state_version_after: 2 });
    expect(JSON.parse(String(commit?.state_json_after))).toEqual(result.value.state);
  });

  it('replays the same choice without applying state twice', async () => {
    const episode = await seedReadyEpisode('user-1', 'plot-1', 'generation-choice-replay');
    const committer = new D1ChoiceCommitter(db);
    const input = commitInput(episode, episode.choices[0].id, 1);

    const first = await committer.commit(input);
    const second = await committer.commit(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.commitId).toBe(first.value.commitId);
    expect(second.value.replayed).toBe(true);
    expect(await countRows('choice_commits')).toBe(1);
    expect((await loadPlot('plot-1'))?.version).toBe(2);
  });

  it('converges concurrent retries of the same choice onto one commit', async () => {
    const episode = await seedReadyEpisode('user-1', 'plot-1', 'generation-choice-race-same');
    const committer = new D1ChoiceCommitter(db);
    const input = commitInput(episode, episode.choices[1].id, 1);

    const [left, right] = await Promise.all([committer.commit(input), committer.commit(input)]);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value.commitId).toBe(right.value.commitId);
    expect([left.value.replayed, right.value.replayed].filter(Boolean)).toHaveLength(1);
    expect(await countRows('choice_commits')).toBe(1);
    expect((await loadPlot('plot-1'))?.version).toBe(2);
  });

  it('allows only one of two concurrent different choices and reports the canonical winner', async () => {
    const episode = await seedReadyEpisode('user-1', 'plot-1', 'generation-choice-race-different');
    const committer = new D1ChoiceCommitter(db);

    const [left, right] = await Promise.all([
      committer.commit(commitInput(episode, episode.choices[0].id, 1)),
      committer.commit(commitInput(episode, episode.choices[2].id, 1)),
    ]);

    const successes = [left, right].filter((result) => result.ok);
    const failures = [left, right].filter((result) => !result.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0].ok || !successes[0].ok) return;
    expect(failures[0].error.code).toBe('already_committed');
    if (failures[0].error.code !== 'already_committed') return;
    expect(failures[0].error.committedChoiceId).toBe(successes[0].value.choiceId);
    expect(await countRows('choice_commits')).toBe(1);
    expect((await loadPlot('plot-1'))?.version).toBe(2);
  });

  it('rejects stale state without partial mutation', async () => {
    const episode = await seedReadyEpisode('user-1', 'plot-1', 'generation-choice-stale');
    const committer = new D1ChoiceCommitter(db);

    const result = await committer.commit(commitInput(episode, episode.choices[0].id, 0));

    expect(result).toEqual({
      ok: false,
      error: { code: 'stale_state', message: 'Plot state version is stale.', currentStateVersion: 1 },
    });
    expect(await countRows('choice_commits')).toBe(0);
    expect((await loadPlot('plot-1'))?.version).toBe(1);
    expect((await loadEpisodeStatus(episode.id))).toBe('ready');
  });

  it('does not reveal another owner or accept a choice from another episode', async () => {
    const episode = await seedReadyEpisode('owner-user', 'plot-1', 'generation-choice-owner');
    await seedReadyEpisode('owner-user', 'plot-2', 'generation-choice-other');
    const otherChoice = await db
      .prepare(
        `SELECT c.id FROM episode_choices c JOIN episodes e ON e.id = c.episode_id
         WHERE e.plot_id = 'plot-2' ORDER BY c.position LIMIT 1`,
      )
      .first<{ id: string }>();
    const committer = new D1ChoiceCommitter(db);

    const wrongOwner = await committer.commit(commitInput(episode, episode.choices[0].id, 1, 'attacker-user'));
    const wrongChoice = await committer.commit(commitInput(episode, otherChoice?.id ?? 'missing', 1, 'owner-user'));

    expect(wrongOwner).toEqual({ ok: false, error: { code: 'not_found', message: 'Episode or choice not found.' } });
    expect(wrongChoice).toEqual({ ok: false, error: { code: 'not_found', message: 'Episode or choice not found.' } });
    expect(await countRows('choice_commits')).toBe(0);
  });

  it('rejects corrupted canonical state and leaves the episode ready', async () => {
    const episode = await seedReadyEpisode('user-1', 'plot-1', 'generation-choice-corrupt');
    await db
      .prepare(
        `UPDATE plots SET state_json = '{"schemaVersion":2,"relationships":[{"fromKey":"hero","toKey":"linh","affinity":999,"trust":0,"tension":0,"status":"bad"}],"facts":[],"openThreads":[],"tone":"tense"}' WHERE id = ?`,
      )
      .bind('plot-1')
      .run();
    const committer = new D1ChoiceCommitter(db);

    const result = await committer.commit(commitInput(episode, episode.choices[0].id, 1));

    expect(result).toEqual({ ok: false, error: { code: 'invalid_state', message: 'Stored episode, choice, or plot state is invalid.' } });
    expect(await countRows('choice_commits')).toBe(0);
    expect((await loadPlot('plot-1'))?.version).toBe(1);
    expect(await loadEpisodeStatus(episode.id)).toBe('ready');
  });
});

function commitInput(episode: PublishedEpisode, choiceId: string, expectedStateVersion: number, userId = 'user-1') {
  return {
    userId,
    plotId: episode.plotId,
    episodeId: episode.id,
    choiceId,
    expectedStateVersion,
  };
}

async function seedReadyEpisode(userId: string, plotId: string, generationKey: string): Promise<PublishedEpisode> {
  await db.prepare('INSERT INTO users (id) VALUES (?) ON CONFLICT(id) DO NOTHING').bind(userId).run();
  await db
    .prepare('INSERT INTO plots (id, user_id, title, premise, state_json) VALUES (?, ?, ?, ?, ?)')
    .bind(plotId, userId, 'Choice test', 'A story used to verify choice commits.', JSON.stringify(initialState()))
    .run();

  const publisher = new D1EpisodePublisher(db);
  const published = await publisher.publish({
    userId,
    plotId,
    generationKey,
    expectedStateVersion: 0,
    proposal: makeValidProposal(),
    generation: {
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      attempts: 1,
      usage: { inputTokens: 120, outputTokens: 80 },
    },
  });
  if (!published.ok) throw new Error(`Failed to seed ready episode: ${published.error.code}`);
  return published.value;
}

function initialState(): DramaState {
  return {
    schemaVersion: 2,
    relationships: [
      { fromKey: 'hero', toKey: 'linh', affinity: 40, trust: 35, tension: 45, status: 'strained' },
    ],
    facts: [{ key: 'fact-hidden-message', text: 'An hid a message from Linh.' }],
    openThreads: [{ key: 'thread-trust', title: 'Linh questions An’s honesty.', urgency: 80 }],
    tone: 'tense',
  };
}

async function countRows(table: 'choice_commits'): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return row?.count ?? 0;
}

async function loadPlot(plotId: string): Promise<{ version: number; state_json: string } | null> {
  return db.prepare('SELECT version, state_json FROM plots WHERE id = ?').bind(plotId).first<{ version: number; state_json: string }>();
}

async function loadEpisodeStatus(episodeId: string): Promise<string | null> {
  const row = await db.prepare('SELECT status FROM episodes WHERE id = ?').bind(episodeId).first<{ status: string }>();
  return row?.status ?? null;
}
