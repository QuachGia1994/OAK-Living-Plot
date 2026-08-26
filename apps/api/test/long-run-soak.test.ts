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
import type { SceneGenerationInput, SceneGenerator } from '../src/ai/contracts';
import type { CreativeSceneProposal } from '../src/ai/creative-scene-schema';
import { compileCreativeScene } from '../src/ai/scene-compiler';
import { buildCreativeScenePrompt } from '../src/ai/scene-prompt';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_JWT_KEY: 'unused-in-soak-test',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused-in-soak-test',
  REVENUECAT_SECRET_API_KEY: 'unused-in-soak-test',
  REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer unused-in-soak-test',
  REVENUECAT_WEBHOOK_SIGNING_SECRET: 'unused-in-soak-test',
};
const nowMs = Date.parse('2026-08-22T12:00:00.000Z');
const migrations = [
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
];

beforeAll(async () => {
  for (const migration of migrations) await applySqlMigration(db, migration);
});

beforeEach(async () => {
  await resetStoryData(db);
});

describe('50-scene canonical soak', () => {
  it('keeps complete canonical history while generation memory stays bounded', async () => {
    const generator = new SoakSceneGenerator();
    let response = await dramaRequest('/v1/dramas', 'POST', createBody(), generator);
    expect(response.status).toBe(201);
    let drama = (await response.json() as DramaEnvelope).drama;
    const dramaId = drama.id;
    const protagonistId = drama.leadCharacter.id;

    for (let sceneNumber = 1; sceneNumber <= 49; sceneNumber += 1) {
      const scene = drama.currentScene;
      expect(scene.number).toBe(sceneNumber);
      const chosen = scene.choices[0];
      response = await dramaRequest(
        `/v1/dramas/${dramaId}/scenes/${scene.id}/choices/${chosen.id}`,
        'POST',
        undefined,
        generator,
      );
      expect(response.status).toBe(200);
      drama = (await response.json() as DramaEnvelope).drama;

      if (sceneNumber === 1) {
        const stored = await db.prepare('SELECT script_json FROM episodes WHERE id = ?')
          .bind(scene.id)
          .first<{ script_json: string }>();
        expect(stored).not.toBeNull();
        const legacy = JSON.parse(stored!.script_json) as Record<string, unknown>;
        delete legacy.beat;
        delete legacy.pacingRole;
        delete legacy.motifSignature;
        await db.prepare('UPDATE episodes SET script_json = ? WHERE id = ?')
          .bind(JSON.stringify(legacy), scene.id)
          .run();
      }

      response = await dramaRequest(
        `/v1/dramas/${dramaId}/scenes`,
        'POST',
        { generationKey: `generation-soak-${String(sceneNumber + 1).padStart(3, '0')}` },
        generator,
      );
      expect(response.status).toBe(200);
      drama = (await response.json() as DramaEnvelope).drama;
    }

    expect(drama.currentScene.number).toBe(50);
    expect(generator.inputs).toHaveLength(50);
    expect(new Set(generator.inputs.map((input) => input.characters[0]?.key))).toEqual(new Set([protagonistId]));
    expect(new Set(generator.inputs.map((input) => input.characters[0]?.name))).toEqual(new Set(['Mina']));

    for (let sceneNumber = 2; sceneNumber <= 50; sceneNumber += 1) {
      expect(generator.inputs[sceneNumber - 1]?.previous?.consequence).toBe(consequenceFor(sceneNumber - 1));
    }

    const legacyHistory = generator.inputs[1]!.recentHistory.at(-1);
    expect(legacyHistory).toMatchObject({ sceneNumber: 1, beat: null, pacingRole: null, motifSignature: null });

    expect(generator.resolvedFactText).toBeTruthy();
    expect(generator.resolvedThreadTitle).toBeTruthy();
    const sceneTenInput = generator.inputs[9]!;
    const sceneFiftyInput = generator.inputs[49]!;
    expect(sceneTenInput.resolvedMemory?.facts).toContain(generator.resolvedFactText);
    expect(sceneTenInput.resolvedMemory?.threads).toContain(generator.resolvedThreadTitle);
    expect(sceneFiftyInput.resolvedMemory?.facts).toContain(generator.resolvedFactText);
    expect(sceneFiftyInput.resolvedMemory?.threads).toContain(generator.resolvedThreadTitle);
    expect(sceneTenInput.activeFacts.some((fact) => fact.text === generator.resolvedFactText)).toBe(false);
    expect(sceneTenInput.openThreads.some((thread) => thread.title === generator.resolvedThreadTitle)).toBe(false);
    expect(sceneFiftyInput.activeFacts.some((fact) => fact.text === generator.resolvedFactText)).toBe(false);
    expect(sceneFiftyInput.openThreads.some((thread) => thread.title === generator.resolvedThreadTitle)).toBe(false);
    expect(generator.factResurrectionBlocked).toBe(true);
    expect(generator.threadResurrectionBlocked).toBe(true);

    const episodes = await db.prepare(
      'SELECT episode_number, status FROM episodes WHERE plot_id = ? ORDER BY episode_number ASC',
    ).bind(dramaId).all<{ episode_number: number; status: 'ready' | 'completed' }>();
    expect(episodes.results).toHaveLength(50);
    expect(episodes.results.map((row) => row.episode_number)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(episodes.results.slice(0, 49).every((row) => row.status === 'completed')).toBe(true);
    expect(episodes.results[49]?.status).toBe('ready');

    const commits = await db.prepare(
      `SELECT episode_id, COUNT(*) AS commit_count
       FROM choice_commits WHERE plot_id = ? GROUP BY episode_id ORDER BY sequence`,
    ).bind(dramaId).all<{ episode_id: string; commit_count: number }>();
    expect(commits.results).toHaveLength(49);
    expect(commits.results.every((row) => row.commit_count === 1)).toBe(true);

    const plot = await db.prepare('SELECT version, next_episode_number, state_json FROM plots WHERE id = ?')
      .bind(dramaId)
      .first<{ version: number; next_episode_number: number; state_json: string }>();
    expect(plot).not.toBeNull();
    expect(plot).toMatchObject({ version: 99, next_episode_number: 51 });
    const canonicalState = JSON.parse(plot!.state_json) as {
      facts: Array<{ text: string }>;
      openThreads: Array<{ title: string }>;
    };
    expect(canonicalState.facts.length).toBeGreaterThan(24);
    expect(canonicalState.openThreads.length).toBeGreaterThan(12);
    expect(canonicalState.facts.some((fact) => fact.text === generator.resolvedFactText)).toBe(false);
    expect(canonicalState.openThreads.some((thread) => thread.title === generator.resolvedThreadTitle)).toBe(false);

    const checkpoints = await db.prepare(
      'SELECT through_scene_number FROM arc_checkpoints WHERE plot_id = ? ORDER BY through_scene_number ASC',
    ).bind(dramaId).all<{ through_scene_number: number }>();
    expect(checkpoints.results.map((row) => row.through_scene_number)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45]);

    const maxRecentHistory = Math.max(...generator.inputs.map((input) => input.recentHistory.length));
    const maxFacts = Math.max(...generator.inputs.map((input) => input.activeFacts.length));
    const maxThreads = Math.max(...generator.inputs.map((input) => input.openThreads.length));
    const maxRelationships = Math.max(...generator.inputs.map((input) => input.relationships.length));
    const maxCheckpoints = Math.max(...generator.inputs.map((input) => input.arcMemory?.length ?? 0));
    const maxMotifs = Math.max(...generator.inputs.map((input) => input.novelty?.motifHistory.length ?? 0));
    const maxTrajectories = Math.max(...generator.inputs.map((input) => input.novelty?.trajectoryConstraints.length ?? 0));
    const maxExcludedBeats = Math.max(...generator.inputs.map((input) => input.novelty?.excludedBeats.length ?? 0));
    const maxResolvedFacts = Math.max(...generator.inputs.map((input) => input.resolvedMemory?.facts.length ?? 0));
    const maxResolvedThreads = Math.max(...generator.inputs.map((input) => input.resolvedMemory?.threads.length ?? 0));

    expect(maxRecentHistory).toBeLessThanOrEqual(4);
    expect(maxFacts).toBeLessThanOrEqual(24);
    expect(maxThreads).toBeLessThanOrEqual(12);
    expect(maxRelationships).toBeLessThanOrEqual(20);
    expect(maxCheckpoints).toBeLessThanOrEqual(3);
    expect(maxMotifs).toBeLessThanOrEqual(12);
    expect(maxTrajectories).toBeLessThanOrEqual(20);
    expect(maxExcludedBeats).toBeLessThanOrEqual(4);
    expect(maxResolvedFacts).toBeLessThanOrEqual(24);
    expect(maxResolvedThreads).toBeLessThanOrEqual(24);

    const contextBytes = {
      scene1: byteLength(generator.inputs[0]!),
      scene10: byteLength(generator.inputs[9]!),
      scene25: byteLength(generator.inputs[24]!),
      scene50: byteLength(generator.inputs[49]!),
    };
    expect(contextBytes.scene50).toBeLessThanOrEqual(Math.ceil(contextBytes.scene25 * 1.25));
    expect(contextBytes.scene50).toBeLessThanOrEqual(Math.ceil(contextBytes.scene10 * 1.6));
    // Scene 1 has almost no memory yet; even after every bounded tier is saturated,
    // Scene 50 must remain below 40% of linear 50x growth and under a fixed byte ceiling.
    expect(contextBytes.scene50).toBeLessThan(contextBytes.scene1 * 20);
    expect(contextBytes.scene50).toBeLessThan(20_000);

    console.info('SOAK_METRICS', JSON.stringify({
      scenes: episodes.results.length,
      contextBytes,
      maxRecentHistory,
      maxFacts,
      maxThreads,
      maxRelationships,
      maxCheckpoints,
      maxMotifs,
      maxTrajectories,
      maxExcludedBeats,
      maxResolvedFacts,
      maxResolvedThreads,
      continuityFailures: 0,
      resurrectionFailures: 0,
      canonicalFacts: canonicalState.facts.length,
      canonicalThreads: canonicalState.openThreads.length,
      checkpoints: checkpoints.results.map((row) => row.through_scene_number),
    }));
  }, 60_000);
});

class SoakSceneGenerator implements SceneGenerator {
  readonly inputs: SceneGenerationInput[] = [];
  resolvedFactText: string | undefined;
  resolvedThreadTitle: string | undefined;
  factResurrectionBlocked = false;
  threadResurrectionBlocked = false;

  async generate(input: SceneGenerationInput) {
    const sceneNumber = this.inputs.length + 1;
    this.inputs.push(structuredClone(input));

    const factToResolve = sceneNumber === 8 ? input.activeFacts[0] : undefined;
    const threadToResolve = sceneNumber === 9 ? input.openThreads[0] : undefined;
    if (factToResolve) this.resolvedFactText = factToResolve.text;
    if (threadToResolve) this.resolvedThreadTitle = threadToResolve.title;

    const proposal = compileCreativeScene(input, creativeFor(
      sceneNumber,
      factToResolve?.text,
      threadToResolve?.title,
      sceneNumber === 50 ? this.resolvedFactText : undefined,
      sceneNumber === 50 ? this.resolvedThreadTitle : undefined,
    ));
    if (sceneNumber === 50) {
      this.factResurrectionBlocked = !proposal.establishedFacts.includes(this.resolvedFactText ?? '');
      this.threadResurrectionBlocked = !proposal.threadChanges.open.some(
        (thread) => thread.title === this.resolvedThreadTitle,
      );
    }

    return {
      ok: true as const,
      value: {
        proposal,
        usage: { inputTokens: 100, outputTokens: 80 },
        attempts: 1,
        provider: 'soak-fixture',
        model: 'deterministic-v1',
      },
    };
  }
}

function creativeFor(
  sceneNumber: number,
  factTextToResolve?: string,
  threadTitleToResolve?: string,
  factTextToResurrect?: string,
  threadTitleToResurrect?: string,
): CreativeSceneProposal {
  const beatCycle = [
    'confrontation', 'revelation', 'betrayal', 'alliance', 'pursuit', 'dilemma',
    'sacrifice', 'discovery', 'reversal', 'separation', 'rescue', 'deadline',
  ] as const;
  const pacingCycle = ['setup', 'build', 'escalate', 'payoff', 'breather', 'cliffhanger'] as const;
  const beat = beatCycle[(sceneNumber - 1) % beatCycle.length]!;
  const pacingRole = pacingCycle[(sceneNumber - 1) % pacingCycle.length]!;
  return {
    title: `Scene ${sceneNumber} — Marker ${sceneNumber}`,
    beat,
    pacingRole,
    script: Array.from({ length: 130 }, (_, index) => `mina-scene-${sceneNumber}-word-${index}`).join(' '),
    summary: `Mina advances canonical marker ${sceneNumber} while the long-running mystery changes in a distinct way.`,
    establishedFacts: [
      `Canonical scene fact ${sceneNumber} belongs to Mina's continuing investigation.`,
      ...(factTextToResurrect ? [factTextToResurrect] : []),
    ],
    threadsToOpen: [
      { title: `Open mystery thread ${sceneNumber} for Mina`, urgency: 50 + (sceneNumber % 50) },
      ...(threadTitleToResurrect ? [{ title: threadTitleToResurrect, urgency: 99 }] : []),
    ],
    threadTitlesToResolve: [],
    choices: [
      choice(
        'A',
        `Act on clue ${sceneNumber}`,
        `pursue clue ${sceneNumber}`,
        consequenceFor(sceneNumber),
        `Committed branch A fact ${sceneNumber} now shapes Mina's next scene.`,
        factTextToResolve ? [factTextToResolve] : [],
        threadTitleToResolve ? [threadTitleToResolve] : [],
        'focused',
      ),
      choice(
        'B',
        `Protect witness ${sceneNumber}`,
        `shield witness ${sceneNumber}`,
        `Mina protects witness ${sceneNumber}, shifting the immediate risk away from the clue.`,
        `Branch B fact ${sceneNumber} would protect the witness instead of following the clue.`,
        [],
        [],
        'guarded',
      ),
      choice(
        'C',
        `Expose signal ${sceneNumber}`,
        `broadcast signal ${sceneNumber}`,
        `Mina exposes signal ${sceneNumber}, forcing the opposing side to react publicly.`,
        `Branch C fact ${sceneNumber} would expose the signal and force a public reaction.`,
        [],
        [],
        'defiant',
      ),
    ],
  };
}

function choice(
  key: 'A' | 'B' | 'C',
  label: string,
  intent: string,
  consequence: string,
  _legacyBranchFact: string,
  factTextsToResolve: string[],
  threadTitlesToResolve: string[],
  nextTone: string,
) {
  return {
    key,
    label,
    intent,
    consequence,
    factTextsToResolve,
    threadTitlesToResolve,
    threadsToOpen: [],
    nextTone,
  };
}

function consequenceFor(sceneNumber: number): string {
  return `Mina commits to clue ${sceneNumber}, and canonical consequence marker ${sceneNumber} must shape the next scene.`;
}

function byteLength(input: SceneGenerationInput): number {
  const prompt = buildCreativeScenePrompt(input);
  return new TextEncoder().encode(prompt.userContent).byteLength;
}

function createBody() {
  return {
    creationKey: 'creation-soak-001',
    generationKey: 'generation-soak-001',
    premise: 'Mina follows a changing chain of impossible messages through a long investigation without losing continuity.',
    mood: 'mysterious',
    characterName: 'Mina',
    locale: 'en-US',
  };
}

async function dramaRequest(
  path: string,
  method: string,
  body: unknown,
  generator: SceneGenerator,
): Promise<Response> {
  return handleRequest(request(path, method, body), testEnv, {
    sessionVerifier: verifier('clerk-soak-owner'),
    sceneGenerator: generator,
    dramaClock: () => nowMs,
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
