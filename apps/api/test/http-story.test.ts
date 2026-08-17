import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationFive from '../migrations/0005_tts_audio.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
import migrationSeven from '../migrations/0007_live_story_integration.sql?raw';
import type { EpisodeGenerationInput, EpisodeProposal, StoryGenerator } from '../src/ai/contracts';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_PUBLISHABLE_KEY: 'unused-in-injected-tests',
  CLERK_JWT_KEY: 'unused-in-injected-tests',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused-in-story-tests',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'unused-in-story-tests',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'unused-in-story-tests',
  REVENUECAT_SECRET_API_KEY: 'unused-in-story-tests',
  REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer unused-in-story-tests',
  REVENUECAT_WEBHOOK_SIGNING_SECRET: 'unused-in-story-tests',
};
const nowMs = Date.parse('2026-08-16T12:00:00.000Z');

beforeAll(async () => {
  for (const migration of [migrationOne, migrationTwo, migrationThree, migrationFour, migrationFive, migrationSix, migrationSeven]) {
    await applySqlMigration(db, migration);
  }
});

beforeEach(async () => {
  await resetStoryData(db);
});

describe('authenticated live story HTTP loop', () => {
  it('creates an owned plot, publishes episode one, consumes quota, and replays creation idempotently', async () => {
    const generator = new FakeStoryGenerator();
    const first = await storyRequest('/v1/story/plots', 'POST', createBody(), 'clerk-owner', generator);

    expect(first.status).toBe(201);
    const firstBody = await first.json() as StoryEnvelope;
    expect(firstBody.story.episode.number).toBe(1);
    expect(firstBody.story.episode.choices.map((choice) => choice.key)).toEqual(['A', 'B', 'C']);
    expect(generator.inputs).toHaveLength(1);

    const owner = await db
      .prepare('SELECT p.user_id, u.auth_subject FROM plots p JOIN users u ON u.id = p.user_id WHERE p.id = ?')
      .bind(firstBody.story.id)
      .first<{ user_id: string; auth_subject: string }>();
    expect(owner?.auth_subject).toBe('clerk-owner');
    expect(owner?.user_id).not.toBe('forged-client-user');

    const usage = await db
      .prepare('SELECT text_episodes, text_reserved FROM daily_usage WHERE user_id = ? AND usage_date = ?')
      .bind(owner?.user_id, '2026-08-16')
      .first<{ text_episodes: number; text_reserved: number }>();
    expect(usage).toEqual({ text_episodes: 1, text_reserved: 0 });

    const replay = await storyRequest(
      '/v1/story/plots',
      'POST',
      { ...createBody(), generationKey: 'generation-replay-002' },
      'clerk-owner',
      generator,
    );
    expect(replay.status).toBe(200);
    expect((await replay.json() as StoryEnvelope).story.id).toBe(firstBody.story.id);
    expect(generator.inputs).toHaveLength(1);
  });

  it('commits a server-versioned choice, generates the continuation from canonical consequence, and resumes via home', async () => {
    const generator = new FakeStoryGenerator();
    const created = await storyRequest('/v1/story/plots', 'POST', createBody(), 'clerk-owner', generator);
    const first = (await created.json() as StoryEnvelope).story;
    const choice = first.episode.choices[0];

    const committed = await storyRequest(
      `/v1/story/plots/${first.id}/episodes/${first.episode.id}/choices/${choice.id}`,
      'POST',
      undefined,
      'clerk-owner',
      generator,
    );
    expect(committed.status).toBe(200);
    const committedStory = (await committed.json() as StoryEnvelope).story;
    expect(committedStory.episode.status).toBe('choice_committed');
    expect(committedStory.episode.committedChoiceId).toBe(choice.id);

    const next = await storyRequest(
      `/v1/story/plots/${first.id}/episodes`,
      'POST',
      { generationKey: 'generation-next-002' },
      'clerk-owner',
      generator,
    );
    expect(next.status).toBe(200);
    const second = (await next.json() as StoryEnvelope).story;
    expect(second.episode.number).toBe(2);
    expect(generator.inputs).toHaveLength(2);
    expect(generator.inputs[1].previous?.consequence).toBe(choice.consequence);

    const home = await storyRequest('/v1/story/home', 'GET', undefined, 'clerk-owner', generator);
    expect(home.status).toBe(200);
    const homeBody = await home.json() as HomeEnvelope;
    expect(homeBody.home.recentPlots[0]).toMatchObject({ id: first.id, episodeNumber: 2, status: 'awaiting_choice' });
    expect(homeBody.home.recentPlots[0]?.resumeLine).toContain('advances the authenticated live story');
    expect(homeBody.home.quota).toMatchObject({ textLimit: 3, textRemaining: 1, voiceLimit: 1, voiceRemaining: 1 });
    expect(homeBody.home.retention).toMatchObject({ choicesMade: 1, activePlots: 1 });
    expect(homeBody.home.retention.dailyPrompt.premise.length).toBeGreaterThan(20);
  });

  it('hides another owner story and ignores a forged client user id', async () => {
    const generator = new FakeStoryGenerator();
    const created = await storyRequest(
      '/v1/story/plots',
      'POST',
      { ...createBody(), userId: 'forged-client-user' },
      'clerk-owner',
      generator,
    );
    const story = (await created.json() as StoryEnvelope).story;

    const attacker = await storyRequest(`/v1/story/plots/${story.id}`, 'GET', undefined, 'clerk-attacker', generator);

    expect(attacker.status).toBe(404);
    expect(await attacker.json()).toEqual({ error: 'not_found' });
  });

  it('releases text quota when the story provider fails', async () => {
    const generator: StoryGenerator = {
      async generate() {
        return { ok: false, error: { code: 'provider_unavailable', message: 'provider down', retryable: true } };
      },
    };
    const response = await storyRequest('/v1/story/plots', 'POST', createBody(), 'clerk-owner', generator);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'provider_unavailable' });
    const user = await db.prepare('SELECT id FROM users WHERE auth_subject = ?').bind('clerk-owner').first<{ id: string }>();
    const usage = await db
      .prepare('SELECT text_episodes, text_reserved FROM daily_usage WHERE user_id = ? AND usage_date = ?')
      .bind(user?.id, '2026-08-16')
      .first<{ text_episodes: number; text_reserved: number }>();
    expect(usage).toEqual({ text_episodes: 0, text_reserved: 0 });
  });

  it('requires authentication before any live story mutation', async () => {
    const response = await handleRequest(request('/v1/story/plots', 'POST', createBody()), testEnv, {
      sessionVerifier: verifier(null),
      storyGenerator: new FakeStoryGenerator(),
      storyClock: () => nowMs,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });
});

class FakeStoryGenerator implements StoryGenerator {
  readonly inputs: EpisodeGenerationInput[] = [];

  async generate(input: EpisodeGenerationInput) {
    this.inputs.push(structuredClone(input));
    return {
      ok: true as const,
      value: {
        proposal: proposalFor(this.inputs.length),
        usage: { inputTokens: 100, outputTokens: 80 },
        attempts: 1,
        provider: 'gemini' as const,
        model: 'gemini-3.5-flash-lite',
      },
    };
  }
}

function proposalFor(number: number): EpisodeProposal {
  return {
    title: `Live episode ${number}`,
    script: Array.from({ length: 130 }, (_, index) => `scene${number}-${index}`).join(' '),
    summary: `Episode ${number} advances the authenticated live story.`,
    establishedFacts: [`Episode ${number} happened.`],
    threadChanges: { open: [], resolve: [] },
    choices: [
      choice('A', 'Tell the truth immediately', 'confess now', 'The truth changes who holds leverage.', 'raw'),
      choice('B', 'Search for another clue first', 'investigate first', 'A hidden detail changes the next conversation.', 'uncertain'),
      choice('C', 'Ask a trusted ally for help', 'seek an ally', 'The ally joins the conflict and accepts part of the risk.', 'hopeful'),
    ],
  };
}

function choice(key: 'A' | 'B' | 'C', label: string, intent: string, consequence: string, nextTone: string) {
  return {
    key,
    label,
    intent,
    consequence,
    stateDelta: {
      relationships: [],
      factsToAdd: [],
      factKeysToResolve: [],
      threadsToOpen: [],
      threadKeysToResolve: [],
      nextTone,
    },
  };
}

function createBody() {
  return {
    creationKey: 'creation-live-001',
    generationKey: 'generation-live-001',
    premise: 'Mina receives a message that should not exist and must decide whom to trust.',
    mood: 'mysterious',
    characterName: 'Mina',
    locale: 'en-US',
    userId: 'forged-client-user',
  };
}

async function storyRequest(
  path: string,
  method: string,
  body: unknown,
  subject: string | null,
  generator: StoryGenerator,
): Promise<Response> {
  return handleRequest(request(path, method, body), testEnv, {
    sessionVerifier: verifier(subject),
    storyGenerator: generator,
    storyClock: () => nowMs,
  });
}

function verifier(subject: string | null): SessionVerifier {
  return { async authenticate() { return subject ? { subject } : null; } };
}

function request(path: string, method: string, body?: unknown): Request {
  return new Request(`https://living-plot.test${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

interface StoryEnvelope {
  story: {
    id: string;
    version: number;
    episode: {
      id: string;
      number: number;
      status: 'awaiting_choice' | 'choice_committed';
      committedChoiceId?: string;
      choices: Array<{ id: string; key: string; consequence: string }>;
    };
  };
}

interface HomeEnvelope {
  home: {
    recentPlots: Array<{ id: string; episodeNumber: number; status: string; resumeLine: string }>;
    quota: { textRemaining: number; textLimit: number; voiceRemaining: number; voiceLimit: number };
    retention: {
      currentStreakDays: number;
      choicesMade: number;
      activePlots: number;
      dailyPrompt: { label: string; premise: string; mood: string; characterName: string };
    };
  };
}
