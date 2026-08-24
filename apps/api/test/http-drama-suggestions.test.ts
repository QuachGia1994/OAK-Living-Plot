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
import type { SceneGenerator, SceneProposal } from '../src/ai/contracts';
import { ACCOUNT_DELETE_CONFIRMATION } from '../src/account/contracts';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import type {
  DramaSeedSuggester,
  DramaSeedSuggestion,
  DramaSeedSuggestionProviderInput,
  DramaSeedSuggestionProviderSuccess,
  DramaSuggestionTelemetryEvent,
  DramaSuggestionTelemetrySink,
} from '../src/drama-runtime/suggestion-contracts';
import { handleRequest, type RequestDependencies } from '../src/http/app';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const nowMs = Date.parse('2026-08-23T05:00:00.000Z');
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_JWT_KEY: 'unused-in-injected-tests',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused-in-suggestion-tests',
  REVENUECAT_SECRET_API_KEY: 'unused-in-suggestion-tests',
  REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer unused-in-suggestion-tests',
  REVENUECAT_WEBHOOK_SIGNING_SECRET: 'unused-in-suggestion-tests',
};

beforeAll(async () => {
  for (const migration of [
    migrationOne,
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
  ]) await applySqlMigration(db, migration);
});

beforeEach(async () => {
  await resetStoryData(db);
});

describe('drama seed suggestion HTTP boundary', () => {
  it('requires authentication for the static suggestion route', async () => {
    const response = await suggestionRequest(suggestionBody(), null, new FixtureSuggester());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns exactly three public suggestions with one provider call and no Scene payload fields', async () => {
    const suggester = new FixtureSuggester();
    const response = await suggestionRequest(suggestionBody(), 'clerk-owner', suggester);
    expect(response.status).toBe(200);
    const body = await response.json() as SuggestionEnvelope;
    expect(body.suggestions).toHaveLength(3);
    expect(suggester.inputs).toHaveLength(1);
    for (const suggestion of body.suggestions) {
      expect(Object.keys(suggestion).sort()).toEqual(['characterName', 'label', 'mood', 'premise']);
    }
    const raw = JSON.stringify(body);
    for (const forbidden of ['script', 'choices', 'stateDelta', 'plotId', 'sceneId', 'provider', 'model']) expect(raw).not.toContain(forbidden);
  });

  it('uses saved dramaLocale instead of uiLocale and ignores a forged userId', async () => {
    await authenticatedRequest('/v1/preferences', 'POST', {
      uiLocale: 'en',
      dramaLocale: 'vi-VN',
      narratorVariant: 'vi-narrator-female',
    }, 'clerk-owner');
    const suggester = new LocaleFixtureSuggester();
    const response = await suggestionRequest({ ...suggestionBody(), userId: 'forged-user-id' }, 'clerk-owner', suggester);
    expect(response.status).toBe(200);
    expect(suggester.inputs[0]?.locale).toBe('vi-VN');
    expect((await response.json() as SuggestionEnvelope).suggestions[0].premise).toContain('Mina nhận');
    const forged = await db.prepare('SELECT id FROM users WHERE id = ?').bind('forged-user-id').first();
    expect(forged).toBeNull();
  });

  it('replays the exact ready batch for the same owner, key, and fingerprint without another provider call', async () => {
    const suggester = new FixtureSuggester();
    const first = await suggestionRequest(suggestionBody(), 'clerk-owner', suggester);
    const second = await suggestionRequest(suggestionBody(), 'clerk-owner', suggester);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(suggester.inputs).toHaveLength(1);
    expect(await readyCount('clerk-owner')).toBe(1);
  });

  it('returns suggestion_conflict when the same key is reused with a different normalized fingerprint', async () => {
    const suggester = new FixtureSuggester();
    expect((await suggestionRequest(suggestionBody(), 'clerk-owner', suggester)).status).toBe(200);
    const conflict = await suggestionRequest({ ...suggestionBody(), inspiration: 'A different mystery puts another relationship at risk.' }, 'clerk-owner', suggester);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'suggestion_conflict' });
    expect(suggester.inputs).toHaveLength(1);
  });

  it('isolates replay cache by authenticated owner', async () => {
    const suggester = new FixtureSuggester();
    expect((await suggestionRequest(suggestionBody(), 'clerk-owner', suggester)).status).toBe(200);
    expect((await suggestionRequest(suggestionBody(), 'clerk-other', suggester)).status).toBe(200);
    expect(suggester.inputs).toHaveLength(2);
    expect(await readyCount('clerk-owner')).toBe(1);
    expect(await readyCount('clerk-other')).toBe(1);
  });

  it('keeps concurrent same-key requests single-flight while the lease is live', async () => {
    const blocking = new BlockingSuggester(validSuggestions('First'));
    const firstPromise = suggestionRequest(suggestionBody(), 'clerk-owner', blocking);
    await blocking.started;
    const second = await suggestionRequest(suggestionBody(), 'clerk-owner', blocking);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'suggestion_in_progress' });
    expect(second.headers.get('Retry-After')).toBe('1');
    expect(blocking.calls).toBe(1);
    blocking.release();
    expect((await firstPromise).status).toBe(200);
  });

  it('recovers a stale lease and prevents the old worker from overwriting the newer ready batch', async () => {
    let clock = nowMs;
    const oldWorker = new BlockingSuggester(validSuggestions('Old'));
    const newWorker = new FixtureSuggester(validSuggestions('Recovered'));
    const firstPromise = suggestionRequest(suggestionBody(), 'clerk-owner', oldWorker, { dramaClock: () => clock });
    await oldWorker.started;
    clock += 36_000;
    const recovered = await suggestionRequest(suggestionBody(), 'clerk-owner', newWorker, { dramaClock: () => clock });
    expect(recovered.status).toBe(200);
    const recoveredBody = await recovered.json();
    oldWorker.release();
    expect((await firstPromise).status).toBe(200);
    const replay = await suggestionRequest(suggestionBody(), 'clerk-owner', new FixtureSuggester(validSuggestions('Should not run')), { dramaClock: () => clock });
    expect(await replay.json()).toEqual(recoveredBody);
    expect(newWorker.inputs).toHaveLength(1);
  });

  it('releases a provider failure so the same request key can retry safely', async () => {
    const flaky = new FlakySuggester('provider_unavailable');
    const first = await suggestionRequest(suggestionBody(), 'clerk-owner', flaky);
    expect(first.status).toBe(503);
    expect(await first.json()).toEqual({ error: 'provider_unavailable' });
    expect(await readyCount('clerk-owner')).toBe(0);
    const second = await suggestionRequest(suggestionBody(), 'clerk-owner', flaky);
    expect(second.status).toBe(200);
    expect(flaky.calls).toBe(2);
  });

  it('does not cache an invalid provider batch and lets the same key retry', async () => {
    const invalid = new InvalidThenValidSuggester();
    const first = await suggestionRequest(suggestionBody(), 'clerk-owner', invalid);
    expect(first.status).toBe(502);
    expect(await first.json()).toEqual({ error: 'invalid_suggestion_response' });
    expect(await readyCount('clerk-owner')).toBe(0);
    const second = await suggestionRequest(suggestionBody(), 'clerk-owner', invalid);
    expect(second.status).toBe(200);
    expect(invalid.calls).toBe(2);
  });

  it('counts only successful batches toward the 12-per-UTC-day cap and does not count replay twice', async () => {
    const suggester = new FixtureSuggester();
    for (let index = 1; index <= 12; index += 1) {
      const response = await suggestionRequest({ ...suggestionBody(), requestKey: `suggestion-rate-${String(index).padStart(3, '0')}` }, 'clerk-owner', suggester);
      expect(response.status).toBe(200);
    }
    const replay = await suggestionRequest({ ...suggestionBody(), requestKey: 'suggestion-rate-001' }, 'clerk-owner', suggester);
    expect(replay.status).toBe(200);
    const limited = await suggestionRequest({ ...suggestionBody(), requestKey: 'suggestion-rate-013' }, 'clerk-owner', suggester);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'suggestion_rate_limited' });
    expect(suggester.inputs).toHaveLength(12);
    expect(await readyCount('clerk-owner')).toBe(12);
  });

  it('atomically caps 13 concurrent distinct request keys at 12 ready batches', async () => {
    const suggester = new FixtureSuggester();
    const responses = await Promise.all(Array.from({ length: 13 }, (_, index) =>
      suggestionRequest({ ...suggestionBody(), requestKey: `suggestion-concurrent-${String(index + 1).padStart(3, '0')}` }, 'clerk-owner', suggester),
    ));
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 200)).toHaveLength(12);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
    expect(await readyCount('clerk-owner')).toBe(12);
  });

  it('recomputes the UTC day at finalization so a request crossing midnight cannot become batch 13', async () => {
    let clock = Date.parse('2026-08-23T23:59:50.000Z');
    const crossing = new BlockingSuggester(validSuggestions('Crossing'));
    const crossingPromise = suggestionRequest(
      { ...suggestionBody(), requestKey: 'suggestion-crossing-midnight' },
      'clerk-owner',
      crossing,
      { dramaClock: () => clock },
    );
    await crossing.started;
    clock = Date.parse('2026-08-24T00:00:01.000Z');
    const newDay = new FixtureSuggester();
    for (let index = 1; index <= 12; index += 1) {
      expect((await suggestionRequest(
        { ...suggestionBody(), requestKey: `suggestion-new-day-${String(index).padStart(3, '0')}` },
        'clerk-owner',
        newDay,
        { dramaClock: () => clock },
      )).status).toBe(200);
    }
    crossing.release();
    const crossingResponse = await crossingPromise;
    expect(crossingResponse.status).toBe(429);
    expect(await crossingResponse.json()).toEqual({ error: 'suggestion_rate_limited' });
    const user = await userForSubject('clerk-owner');
    const dayStart = Date.parse('2026-08-24T00:00:00.000Z');
    const row = await db.prepare(
      "SELECT COUNT(*) AS count FROM drama_suggestion_cache WHERE user_id = ? AND status = 'ready' AND ready_at >= ? AND ready_at < ?",
    ).bind(user.id, dayStart, dayStart + 86_400_000).first<{ count: number }>();
    expect(row?.count).toBe(12);
  });

  it('omits a one-character optional draft name and rejects one-character provider output before cache', async () => {
    const inputObserver = new FixtureSuggester();
    const valid = await suggestionRequest({ ...suggestionBody(), requestKey: 'suggestion-short-input', characterName: 'M' }, 'clerk-owner', inputObserver);
    expect(valid.status).toBe(200);
    expect(inputObserver.inputs[0]).not.toHaveProperty('characterName');

    const invalidBatch = validSuggestions('Short output');
    invalidBatch[0] = { ...invalidBatch[0], characterName: 'M' };
    const rejected = await suggestionRequest(
      { ...suggestionBody(), requestKey: 'suggestion-short-output' },
      'clerk-owner',
      new FixtureSuggester(invalidBatch),
    );
    expect(rejected.status).toBe(502);
    expect(await rejected.json()).toEqual({ error: 'invalid_suggestion_response' });
    const user = await userForSubject('clerk-owner');
    const cached = await db.prepare(
      "SELECT COUNT(*) AS count FROM drama_suggestion_cache WHERE user_id = ? AND request_key = ? AND status = 'ready'",
    ).bind(user.id, 'suggestion-short-output').first<{ count: number }>();
    expect(cached?.count).toBe(0);
  });

  it('leaves canonical story and Scene quota tables untouched', async () => {
    const before = await canonicalCounts();
    const response = await suggestionRequest(suggestionBody(), 'clerk-owner', new FixtureSuggester());
    expect(response.status).toBe(200);
    expect(await canonicalCounts()).toEqual(before);
  });

  it('does not block manual Scene creation after suggestion rate limiting', async () => {
    const suggester = new FixtureSuggester();
    for (let index = 1; index <= 12; index += 1) {
      expect((await suggestionRequest({ ...suggestionBody(), requestKey: `suggestion-manual-${String(index).padStart(3, '0')}` }, 'clerk-owner', suggester)).status).toBe(200);
    }
    expect((await suggestionRequest({ ...suggestionBody(), requestKey: 'suggestion-manual-013' }, 'clerk-owner', suggester)).status).toBe(429);

    const created = await authenticatedRequest('/v1/dramas', 'POST', {
      creationKey: 'creation-after-suggestion-limit',
      generationKey: 'generation-after-suggestion-limit',
      premise: 'Mina must decide whether a trusted friend has been hiding a dangerous message from her.',
      mood: 'mysterious',
      characterName: 'Mina',
      locale: 'en-US',
    }, 'clerk-owner', { sceneGenerator: new FixtureSceneGenerator() });
    expect(created.status).toBe(201);
  });

  it('keeps telemetry privacy-safe and fail-open', async () => {
    const events: DramaSuggestionTelemetryEvent[] = [];
    const sink: DramaSuggestionTelemetrySink = { recordDramaSuggestion(event) { events.push(structuredClone(event)); } };
    expect((await suggestionRequest(suggestionBody(), 'clerk-owner', new FixtureSuggester(), { dramaSuggestionTelemetry: sink })).status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'accepted', providerCalls: 1, repairs: 0 });
    const serialized = JSON.stringify(events[0]);
    for (const forbidden of ['Mina', 'requestKey', 'userId', 'inspiration', 'premise', 'suggestions']) expect(serialized).not.toContain(forbidden);

    const throwingSink: DramaSuggestionTelemetrySink = { recordDramaSuggestion() { throw new Error('analytics unavailable'); } };
    const second = await suggestionRequest({ ...suggestionBody(), requestKey: 'suggestion-telemetry-002' }, 'clerk-other', new FixtureSuggester(), { dramaSuggestionTelemetry: throwingSink });
    expect(second.status).toBe(200);
  });

  it('cascades derived suggestion cache on account erasure and excludes it from export', async () => {
    expect((await suggestionRequest(suggestionBody(), 'clerk-owner', new FixtureSuggester())).status).toBe(200);
    expect(await readyCount('clerk-owner')).toBe(1);
    const exported = await authenticatedRequest('/v1/account/export?schema=3', 'GET', undefined, 'clerk-owner');
    expect(exported.status).toBe(200);
    expect(JSON.stringify(await exported.json())).not.toContain('suggestion');

    const deleted = await authenticatedRequest('/v1/account/delete', 'POST', { confirmation: ACCOUNT_DELETE_CONFIRMATION }, 'clerk-owner');
    expect(deleted.status).toBe(200);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM drama_suggestion_cache').first()).toEqual({ count: 0 });
  });

  it('resetStoryData removes the derived suggestion cache', async () => {
    expect((await suggestionRequest(suggestionBody(), 'clerk-owner', new FixtureSuggester())).status).toBe(200);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM drama_suggestion_cache').first()).toEqual({ count: 1 });
    await resetStoryData(db);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM drama_suggestion_cache').first()).toEqual({ count: 0 });
  });

  it('fails closed on an invalid ready-cache DTO for the exact replay fingerprint without invoking the provider', async () => {
    const requestBody = { ...suggestionBody(), requestKey: 'suggestion-invalid-cache' };
    const initial = new FixtureSuggester();
    expect((await suggestionRequest(requestBody, 'clerk-owner', initial)).status).toBe(200);
    const user = await userForSubject('clerk-owner');
    await db.prepare(
      `UPDATE drama_suggestion_cache SET suggestions_json = ?, updated_at = ?
       WHERE user_id = ? AND request_key = ?`,
    ).bind(
      JSON.stringify([
        { label: 'Bad cache', premise: 'This cached premise is long enough but has no unanswered dramatic question.', mood: 'mysterious', characterName: 'Mina' },
        { label: 'Bad cache two', premise: 'Another cached premise is long enough but also lacks a dramatic question.', mood: 'tense', characterName: 'Mina' },
        { label: 'Bad cache three', premise: 'A third cached premise is long enough but still lacks a dramatic question.', mood: 'hopeful', characterName: 'Mina' },
      ]),
      nowMs,
      user.id,
      requestBody.requestKey,
    ).run();
    const shouldNotRun = new FixtureSuggester(validSuggestions('Should not run'));
    const response = await suggestionRequest(requestBody, 'clerk-owner', shouldNotRun);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal_error' });
    expect(shouldNotRun.inputs).toHaveLength(0);
  });
});

class FixtureSuggester implements DramaSeedSuggester {
  readonly inputs: DramaSeedSuggestionProviderInput[] = [];

  constructor(private readonly batch = validSuggestions('Default')) {}

  async suggest(input: DramaSeedSuggestionProviderInput) {
    this.inputs.push(structuredClone(input));
    return success(this.batch);
  }
}

class LocaleFixtureSuggester implements DramaSeedSuggester {
  readonly inputs: DramaSeedSuggestionProviderInput[] = [];

  async suggest(input: DramaSeedSuggestionProviderInput) {
    this.inputs.push(structuredClone(input));
    return success(input.locale === 'vi-VN' ? vietnameseSuggestions() : validSuggestions('English'));
  }
}

class FlakySuggester implements DramaSeedSuggester {
  calls = 0;
  constructor(private readonly firstError: 'provider_unavailable' | 'invalid_suggestion_response') {}
  async suggest() {
    this.calls += 1;
    if (this.calls === 1) return {
      ok: false as const,
      error: { code: this.firstError, metrics: metrics(1) },
    };
    return success(validSuggestions('Retry'));
  }
}

class InvalidThenValidSuggester implements DramaSeedSuggester {
  calls = 0;
  async suggest() {
    this.calls += 1;
    if (this.calls === 1) {
      const invalid = [
        { label: 'A', premise: 'Short duplicate?', mood: 'mysterious' as const, characterName: 'Mina' },
        { label: 'A', premise: 'Short duplicate?', mood: 'mysterious' as const, characterName: 'Mina' },
        { label: 'A', premise: 'Short duplicate?', mood: 'mysterious' as const, characterName: 'Mina' },
      ] as [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion];
      return { ok: true as const, value: { suggestions: invalid, ...metrics(1) } };
    }
    return success(validSuggestions('Valid'));
  }
}

class BlockingSuggester implements DramaSeedSuggester {
  calls = 0;
  readonly started: Promise<void>;
  private start!: () => void;
  private unblock!: () => void;
  private readonly blocked: Promise<void>;

  constructor(private readonly batch: [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion]) {
    this.started = new Promise((resolve) => { this.start = resolve; });
    this.blocked = new Promise((resolve) => { this.unblock = resolve; });
  }

  async suggest() {
    this.calls += 1;
    this.start();
    await this.blocked;
    return success(this.batch);
  }

  release() { this.unblock(); }
}

class FixtureSceneGenerator implements SceneGenerator {
  async generate() {
    return {
      ok: true as const,
      value: {
        proposal: sceneProposal(),
        usage: { inputTokens: 10, outputTokens: 10 },
        attempts: 1 as const,
        provider: 'fixture-provider',
        model: 'fixture-model',
      },
    };
  }
}

function sceneProposal(): SceneProposal {
  const script = Array.from({ length: 130 }, (_, index) => `word${index}`).join(' ');
  return {
    title: 'The Message',
    script,
    summary: 'Mina discovers that the message points to a trusted friend.',
    establishedFacts: ['Mina received the message.'],
    threadChanges: { open: [], resolve: [] },
    choices: [
      sceneChoice('A', 'Confront the friend', 'confront', 'The friend admits hiding part of the truth.'),
      sceneChoice('B', 'Trace the sender', 'investigate', 'Mina finds a second phone connected to the sender.'),
      sceneChoice('C', 'Tell her family', 'confide', 'Her family reveals that they recognize the sender.'),
    ],
  };
}

function sceneChoice(key: 'A' | 'B' | 'C', label: string, intent: string, consequence: string) {
  return {
    key,
    label,
    intent,
    consequence,
    stateDelta: { relationships: [], factsToAdd: [], factKeysToResolve: [], threadsToOpen: [], threadKeysToResolve: [], nextTone: 'mysterious' },
  };
}

function validSuggestions(prefix: string): [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion] {
  return [
    {
      label: `${prefix} Lost Call`,
      premise: 'Mina receives a live phone call from her sister who vanished three years ago. Answering could expose the family lie that kept Mina safe. Police will seize the phone in ten minutes unless Mina acts first. Who is really speaking from the missing sister’s number?',
      mood: 'mysterious',
      characterName: 'Mina',
    },
    {
      label: `${prefix} False Engagement`,
      premise: 'Mina learns that her closest friend secretly announced an engagement using Mina’s identity. Her reputation and the friendship both collapse if the lie spreads. The ceremony begins tonight and Mina must choose whether to expose the fraud publicly. Why did her friend need Mina’s name badly enough to risk everything?',
      mood: 'tense',
      characterName: 'Mina',
    },
    {
      label: `${prefix} Borrowed Memory`,
      premise: 'Mina finds a childhood photograph showing her beside a stranger everyone insists never existed. Proving the stranger was real could destroy the only family relationship she still trusts. A demolition crew will erase the pictured house by dawn unless Mina enters it now. What happened there that made everyone agree to forget the stranger?',
      mood: 'hopeful',
      characterName: 'Mina',
    },
  ];
}

function vietnameseSuggestions(): [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion] {
  return [
    { label: 'Cuộc gọi thất lạc', premise: 'Mina nhận một cuộc gọi trực tiếp từ người chị đã mất tích ba năm. Nếu trả lời công khai, bí mật gia đình từng bảo vệ cô sẽ bị phơi bày. Cảnh sát sẽ thu chiếc điện thoại trong mười phút nữa nên Mina phải quyết định ngay. Ai thực sự đang gọi từ số của người chị mất tích?', mood: 'mysterious', characterName: 'Mina' },
    { label: 'Lời hứa giả', premise: 'Mina phát hiện người bạn thân đã dùng danh tính của cô để công bố một hôn ước bí mật. Danh dự của Mina và tình bạn lâu năm đều có thể tan vỡ nếu lời nói dối lan rộng. Buổi lễ bắt đầu tối nay và cô phải chọn đối chất hay im lặng. Vì sao người bạn cần tên của Mina đến mức chấp nhận mất tất cả?', mood: 'tense', characterName: 'Mina' },
    { label: 'Ký ức mượn', premise: 'Mina tìm thấy tấm ảnh tuổi thơ chụp cô cạnh một người lạ mà cả nhà khẳng định chưa từng tồn tại. Chứng minh người đó có thật có thể phá hỏng mối quan hệ gia đình cuối cùng cô còn tin tưởng. Căn nhà trong ảnh sẽ bị phá lúc bình minh nên Mina phải vào đó ngay. Điều gì đã xảy ra khiến mọi người cùng đồng ý quên người lạ?', mood: 'hopeful', characterName: 'Mina' },
  ];
}

function success(suggestions: [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion]): { ok: true; value: DramaSeedSuggestionProviderSuccess } {
  return { ok: true, value: { suggestions, ...metrics(1) } };
}

function metrics(providerCalls: number) {
  return { providerMs: 12, parseMs: 2, validateMs: 3, providerCalls, repairs: 0 };
}

function suggestionBody() {
  return {
    requestKey: 'suggestion-request-001',
    mood: 'mysterious' as const,
    characterName: 'Mina',
    inspiration: 'A message arrives from someone who vanished years ago.',
    userId: 'forged-client-user',
  };
}

async function suggestionRequest(
  body: ReturnType<typeof suggestionBody> | Record<string, unknown>,
  subject: string | null,
  suggester: DramaSeedSuggester,
  extra: Partial<RequestDependencies> = {},
): Promise<Response> {
  return authenticatedRequest('/v1/dramas/suggestions', 'POST', body, subject, {
    dramaSeedSuggester: suggester,
    dramaClock: () => nowMs,
    ...extra,
  });
}

async function authenticatedRequest(
  path: string,
  method: string,
  body: unknown,
  subject: string | null,
  extra: Partial<RequestDependencies> = {},
): Promise<Response> {
  return handleRequest(request(path, method, body), testEnv, {
    sessionVerifier: verifier(subject),
    dramaClock: () => nowMs,
    ...extra,
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

async function userForSubject(subject: string): Promise<{ id: string }> {
  const row = await db.prepare('SELECT id FROM users WHERE auth_subject = ?').bind(subject).first<{ id: string }>();
  if (!row) throw new Error(`Missing test user for ${subject}`);
  return row;
}

async function readyCount(subject: string): Promise<number> {
  const user = await userForSubject(subject);
  const row = await db.prepare("SELECT COUNT(*) AS count FROM drama_suggestion_cache WHERE user_id = ? AND status = 'ready'").bind(user.id).first<{ count: number }>();
  return row?.count ?? 0;
}

async function canonicalCounts() {
  const tables = ['plots', 'characters', 'episodes', 'episode_choices', 'choice_commits', 'daily_usage', 'quota_reservations', 'usage_events'];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
    counts[table] = row?.count ?? 0;
  }
  return counts;
}

interface SuggestionEnvelope {
  suggestions: [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion];
}
