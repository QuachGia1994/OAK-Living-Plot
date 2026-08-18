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
import type { SceneGenerationInput, SceneGenerator, SceneProposal } from '../src/ai/contracts';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import type { ProductEventTelemetry, ProductTelemetrySink } from '../src/telemetry/product-events';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_PUBLISHABLE_KEY: 'unused-in-injected-tests',
  CLERK_JWT_KEY: 'unused-in-injected-tests',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused-in-drama-tests',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'unused-in-drama-tests',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'unused-in-drama-tests',
  REVENUECAT_SECRET_API_KEY: 'unused-in-drama-tests',
  REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer unused-in-drama-tests',
  REVENUECAT_WEBHOOK_SIGNING_SECRET: 'unused-in-drama-tests',
};
const nowMs = Date.parse('2026-08-16T12:00:00.000Z');

beforeAll(async () => {
  for (const migration of [migrationOne, migrationTwo, migrationThree, migrationFour, migrationFive, migrationSix, migrationSeven, migrationEight]) {
    await applySqlMigration(db, migration);
  }
});

beforeEach(async () => {
  await resetStoryData(db);
});

describe('authenticated drama HTTP loop', () => {
  it('creates one canonical drama and normalizes provider output before publication', async () => {
    const generator = new FixtureSceneGenerator();
    const first = await dramaRequest('/v1/dramas', 'POST', createBody(), 'clerk-owner', generator);

    expect(first.status).toBe(201);
    const drama = (await first.json() as DramaEnvelope).drama;
    expect(drama.leadCharacter).toMatchObject({ name: 'Mina', role: 'protagonist' });
    expect(drama.currentScene.branch).toEqual({ state: 'open' });
    expect(drama.currentScene.choices.map((choice) => choice.key)).toEqual(['A', 'B', 'C']);
    expect(generator.inputs).toHaveLength(1);

    const stored = await db.prepare('SELECT provider, model FROM episodes WHERE id = ?')
      .bind(drama.currentScene.id)
      .first<{ provider: string; model: string }>();
    expect(stored).toEqual({ provider: 'fixture-provider', model: 'fixture-model-v1' });
  });

  it('commits exactly one branch and generates the next scene from the canonical consequence', async () => {
    const generator = new FixtureSceneGenerator();
    const created = await dramaRequest('/v1/dramas', 'POST', createBody(), 'clerk-owner', generator);
    const first = (await created.json() as DramaEnvelope).drama;
    const choice = first.currentScene.choices[0];

    const committedResponse = await dramaRequest(
      `/v1/dramas/${first.id}/scenes/${first.currentScene.id}/choices/${choice.id}`,
      'POST',
      undefined,
      'clerk-owner',
      generator,
    );
    expect(committedResponse.status).toBe(200);
    const committed = (await committedResponse.json() as DramaEnvelope).drama;
    expect(committed.currentScene.branch).toEqual({ state: 'committed', choiceId: choice.id, consequence: choice.consequence });

    const nextResponse = await dramaRequest(
      `/v1/dramas/${first.id}/scenes`,
      'POST',
      { generationKey: 'generation-next-002' },
      'clerk-owner',
      generator,
    );
    expect(nextResponse.status).toBe(200);
    const next = (await nextResponse.json() as DramaEnvelope).drama;
    expect(next.currentScene.number).toBe(2);
    expect(next.currentScene.branch).toEqual({ state: 'open' });
    expect(generator.inputs[1].previous?.consequence).toBe(choice.consequence);
  });

  it('replays creation and the same committed choice idempotently', async () => {
    const generator = new FixtureSceneGenerator();
    const firstResponse = await dramaRequest('/v1/dramas', 'POST', createBody(), 'clerk-owner', generator);
    const first = (await firstResponse.json() as DramaEnvelope).drama;
    const replayResponse = await dramaRequest('/v1/dramas', 'POST', { ...createBody(), generationKey: 'ignored-replay-key' }, 'clerk-owner', generator);
    expect(replayResponse.status).toBe(200);
    expect((await replayResponse.json() as DramaEnvelope).drama.id).toBe(first.id);
    expect(generator.inputs).toHaveLength(1);

    const choice = first.currentScene.choices[1];
    const path = `/v1/dramas/${first.id}/scenes/${first.currentScene.id}/choices/${choice.id}`;
    const commitOne = await dramaRequest(path, 'POST', undefined, 'clerk-owner', generator);
    const commitTwo = await dramaRequest(path, 'POST', undefined, 'clerk-owner', generator);
    expect(commitOne.status).toBe(200);
    expect(commitTwo.status).toBe(200);
    expect((await commitTwo.json() as DramaEnvelope).drama.currentScene.branch).toEqual({ state: 'committed', choiceId: choice.id, consequence: choice.consequence });
  });

  it('rejects a conflicting second choice and keeps the first canonical branch', async () => {
    const generator = new FixtureSceneGenerator();
    const created = await dramaRequest('/v1/dramas', 'POST', createBody(), 'clerk-owner', generator);
    const drama = (await created.json() as DramaEnvelope).drama;
    const [first, second] = drama.currentScene.choices;

    await dramaRequest(`/v1/dramas/${drama.id}/scenes/${drama.currentScene.id}/choices/${first.id}`, 'POST', undefined, 'clerk-owner', generator);
    const conflict = await dramaRequest(`/v1/dramas/${drama.id}/scenes/${drama.currentScene.id}/choices/${second.id}`, 'POST', undefined, 'clerk-owner', generator);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: 'choice_conflict', committedChoiceId: first.id });
  });

  it('restores persisted drama/history and owner isolation from D1', async () => {
    const generator = new FixtureSceneGenerator();
    const created = await dramaRequest('/v1/dramas', 'POST', createBody(), 'clerk-owner', generator);
    const first = (await created.json() as DramaEnvelope).drama;
    const choice = first.currentScene.choices[2];
    await dramaRequest(`/v1/dramas/${first.id}/scenes/${first.currentScene.id}/choices/${choice.id}`, 'POST', undefined, 'clerk-owner', generator);
    await dramaRequest(`/v1/dramas/${first.id}/scenes`, 'POST', { generationKey: 'generation-history-002' }, 'clerk-owner', generator);

    const restored = await dramaRequest(`/v1/dramas/${first.id}`, 'GET', undefined, 'clerk-owner', generator);
    expect((await restored.json() as DramaEnvelope).drama.currentScene.number).toBe(2);

    const historyResponse = await dramaRequest(`/v1/dramas/${first.id}/history`, 'GET', undefined, 'clerk-owner', generator);
    const history = (await historyResponse.json() as HistoryEnvelope).history;
    expect(history.items).toHaveLength(2);
    expect(history.items[0]).toMatchObject({ branchState: 'committed', choiceKey: choice.key, consequence: choice.consequence });
    expect(history.items[1]).toMatchObject({ branchState: 'open' });

    const attacker = await dramaRequest(`/v1/dramas/${first.id}`, 'GET', undefined, 'clerk-attacker', generator);
    expect(attacker.status).toBe(404);
  });

  it('archives and restores an owned drama idempotently while archived state is mutation-locked', async () => {
    const generator = new FixtureSceneGenerator();
    const created = await dramaRequest('/v1/dramas', 'POST', createBody(), 'clerk-owner', generator);
    const drama = (await created.json() as DramaEnvelope).drama;

    const archived = await dramaRequest(`/v1/dramas/${drama.id}/archive`, 'POST', undefined, 'clerk-owner', generator);
    const archivedAgain = await dramaRequest(`/v1/dramas/${drama.id}/archive`, 'POST', undefined, 'clerk-owner', generator);
    expect(archived.status).toBe(200);
    expect(archivedAgain.status).toBe(200);

    const blocked = await dramaRequest(
      `/v1/dramas/${drama.id}/scenes/${drama.currentScene.id}/choices/${drama.currentScene.choices[0].id}`,
      'POST',
      undefined,
      'clerk-owner',
      generator,
    );
    expect(blocked.status).toBe(404);

    const library = await dramaRequest('/v1/dramas/library', 'GET', undefined, 'clerk-owner', generator);
    expect((await library.json() as LibraryEnvelope).library.archived[0]).toMatchObject({ id: drama.id });

    const restored = await dramaRequest(`/v1/dramas/${drama.id}/restore`, 'POST', undefined, 'clerk-owner', generator);
    expect(restored.status).toBe(200);
    const home = await dramaRequest('/v1/dramas/home', 'GET', undefined, 'clerk-owner', generator);
    expect((await home.json() as HomeEnvelope).home.recentDramas[0]?.id).toBe(drama.id);
  });

  it('releases generation quota when the provider fails and allows an idempotent retry', async () => {
    let calls = 0;
    const flaky: SceneGenerator = {
      async generate(input) {
        calls += 1;
        if (calls === 1) return { ok: false, error: { code: 'provider_unavailable', message: 'provider down', retryable: true } };
        return successGeneration(input, 1);
      },
    };

    const first = await dramaRequest('/v1/dramas', 'POST', createBody(), 'clerk-owner', flaky);
    expect(first.status).toBe(503);
    const second = await dramaRequest('/v1/dramas', 'POST', createBody(), 'clerk-owner', flaky);
    expect(second.status).toBe(201);
    expect(calls).toBe(2);

    const user = await db.prepare('SELECT id FROM users WHERE auth_subject = ?').bind('clerk-owner').first<{ id: string }>();
    const usage = await db.prepare('SELECT text_episodes, text_reserved FROM daily_usage WHERE user_id = ? AND usage_date = ?')
      .bind(user?.id, '2026-08-16')
      .first<{ text_episodes: number; text_reserved: number }>();
    expect(usage).toEqual({ text_episodes: 1, text_reserved: 0 });
  });

  it('records privacy-safe product mutations without changing canonical behavior when telemetry fails', async () => {
    const generator = new FixtureSceneGenerator();
    const events: ProductEventTelemetry[] = [];
    const sink: ProductTelemetrySink = { recordProductEvent(event) { events.push(structuredClone(event)); } };
    const created = await dramaRequest('/v1/dramas', 'POST', createBody(), 'clerk-owner', generator, sink);
    const drama = (await created.json() as DramaEnvelope).drama;
    await dramaRequest(`/v1/dramas/${drama.id}/scenes/${drama.currentScene.id}/choices/${drama.currentScene.choices[0].id}`, 'POST', undefined, 'clerk-owner', generator, sink);
    await dramaRequest(`/v1/dramas/${drama.id}/archive`, 'POST', undefined, 'clerk-owner', generator, sink);
    await dramaRequest(`/v1/dramas/${drama.id}/restore`, 'POST', undefined, 'clerk-owner', generator, sink);
    expect(events.map((event) => event.event)).toEqual(['drama_created', 'choice_committed', 'drama_archived', 'drama_restored']);
    expect(events.every((event) => !('userId' in event) && !('plotId' in event) && !('premise' in event))).toBe(true);

    const throwingSink: ProductTelemetrySink = { recordProductEvent() { throw new Error('analytics unavailable'); } };
    const second = await dramaRequest(
      '/v1/dramas',
      'POST',
      { ...createBody(), creationKey: 'creation-live-throw', generationKey: 'generation-live-throw' },
      'clerk-other',
      new FixtureSceneGenerator(),
      throwingSink,
    );
    expect(second.status).toBe(201);
  });

  it('requires authentication before a drama mutation', async () => {
    const response = await handleRequest(request('/v1/dramas', 'POST', createBody()), testEnv, {
      sessionVerifier: verifier(null),
      sceneGenerator: new FixtureSceneGenerator(),
      dramaClock: () => nowMs,
    });
    expect(response.status).toBe(401);
  });
});

class FixtureSceneGenerator implements SceneGenerator {
  readonly inputs: SceneGenerationInput[] = [];

  async generate(input: SceneGenerationInput) {
    this.inputs.push(structuredClone(input));
    return successGeneration(input, this.inputs.length);
  }
}

function successGeneration(_input: SceneGenerationInput, number: number) {
  return {
    ok: true as const,
    value: {
      proposal: proposalFor(number),
      usage: { inputTokens: 100, outputTokens: 80 },
      attempts: 1,
      provider: 'fixture-provider',
      model: 'fixture-model-v1',
    },
  };
}

function proposalFor(number: number): SceneProposal {
  return {
    title: `Scene ${number}`,
    script: Array.from({ length: 130 }, (_, index) => `scene${number}-${index}`).join(' '),
    summary: `Scene ${number} advances the authenticated drama.`,
    establishedFacts: [`Scene ${number} happened.`],
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
    stateDelta: { relationships: [], factsToAdd: [], factKeysToResolve: [], threadsToOpen: [], threadKeysToResolve: [], nextTone },
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

async function dramaRequest(
  path: string,
  method: string,
  body: unknown,
  subject: string | null,
  generator: SceneGenerator,
  productTelemetry?: ProductTelemetrySink,
): Promise<Response> {
  return handleRequest(request(path, method, body), testEnv, {
    sessionVerifier: verifier(subject),
    sceneGenerator: generator,
    dramaClock: () => nowMs,
    productTelemetry,
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

interface DramaEnvelope {
  drama: {
    id: string;
    leadCharacter: { id: string; name: string; role: string };
    currentScene: {
      id: string;
      number: number;
      branch: { state: 'open' } | { state: 'committed'; choiceId: string; consequence: string };
      choices: Array<{ id: string; key: 'A' | 'B' | 'C'; label: string; consequence: string }>;
    };
  };
}

interface HomeEnvelope {
  home: { recentDramas: Array<{ id: string }> };
}

interface LibraryEnvelope {
  library: { archived: Array<{ id: string }> };
}

interface HistoryEnvelope {
  history: {
    items: Array<{ branchState: 'open' | 'committed'; choiceKey?: string; consequence?: string }>;
  };
}
