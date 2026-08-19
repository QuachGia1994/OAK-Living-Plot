import type {
  Result,
  SceneGenerationError,
  SceneGenerationInput,
  SceneGenerationSuccess,
  SceneGenerationUsage,
  SceneGenerator,
} from './contracts';
import { parseAndValidateSceneProposal, sceneResponseSchema } from './scene-schema';
import { buildScenePrompt, validateSceneGenerationInput } from './scene-prompt';
import {
  NOOP_GENERATION_TELEMETRY,
  type GenerationAttemptOutcome,
  type GenerationTelemetrySink,
} from '../telemetry/contracts';

export const WORKERS_AI_SCENE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

export class WorkersAiSceneGenerator implements SceneGenerator {
  constructor(
    private readonly ai: Ai,
    private readonly telemetry: GenerationTelemetrySink = NOOP_GENERATION_TELEMETRY,
  ) {}

  async generate(input: SceneGenerationInput): Promise<Result<SceneGenerationSuccess, SceneGenerationError>> {
    const inputValidation = validateSceneGenerationInput(input);
    if (!inputValidation.ok) {
      return { ok: false, error: { code: 'invalid_input', message: inputValidation.error.join(' ') } };
    }

    let validationErrors: string[] = [];
    const usage: SceneGenerationUsage = { inputTokens: 0, outputTokens: 0 };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const provider = await this.requestModel(input, validationErrors);
      if (!provider.ok) return provider;

      usage.inputTokens += provider.value.usage.inputTokens;
      usage.outputTokens += provider.value.usage.outputTokens;
      const validated = parseAndValidateSceneProposal(normalizeCanonicalReferences(provider.value.text, input), input);
      this.recordAttempt(attempt as 1 | 2, validated.ok ? 'accepted' : 'rejected', provider.value.usage);
      if (validated.ok) {
        return {
          ok: true,
          value: {
            proposal: validated.value,
            usage,
            attempts: attempt,
            provider: 'workers-ai',
            model: WORKERS_AI_SCENE_MODEL,
          },
        };
      }

      validationErrors = validated.error;
      if (attempt === 2) {
        return {
          ok: false,
          error: {
            code: 'invalid_response',
            message: 'Scene provider returned an invalid structured proposal after one controlled retry.',
            attempts: 2,
          },
        };
      }
    }

    return { ok: false, error: { code: 'invalid_response', message: 'Scene generation failed.', attempts: 2 } };
  }

  private async requestModel(
    input: SceneGenerationInput,
    validationErrors: string[],
  ): Promise<Result<{ text: string; usage: SceneGenerationUsage }, SceneGenerationError>> {
    const prompt = buildScenePrompt(input, validationErrors);
    const compactInstruction = [
      'Keep the JSON compact. The script must be 130–180 words; all other prose must be brief.',
      'Summary: one sentence, at most 30 words. establishedFacts: at most 2 short strings. threadChanges.open: at most 1 short thread.',
      'Each choice label: at most 8 words; intent: at most 10 words; consequence: at most 18 words.',
      'Each choice stateDelta must be minimal: factsToAdd at most 2 short strings, threadsToOpen at most 1, nextTone at most 4 words.',
      'If fewer than two characters exist, every stateDelta.relationships must be an empty array.',
      'If activeFacts is empty, every factKeysToResolve must be empty. If openThreads is empty, every resolve/threadKeysToResolve must be empty.',
      'Never repeat the script or explanation outside the required JSON object.',
    ].join(' ');
    let payload: unknown;
    try {
      payload = await this.ai.run(WORKERS_AI_SCENE_MODEL, {
        messages: [
          { role: 'system', content: `${prompt.systemInstruction}\n${compactInstruction}` },
          { role: 'user', content: prompt.userContent },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'living_plot_scene',
            schema: sceneResponseSchema,
            strict: true,
          },
        },
        max_tokens: 2400,
        temperature: 0.5,
      });
    } catch {
      return {
        ok: false,
        error: { code: 'provider_unavailable', message: 'Scene provider request failed.', retryable: true },
      };
    }

    return {
      ok: true,
      value: {
        text: extractResponseText(payload),
        usage: extractUsage(payload),
      },
    };
  }

  private recordAttempt(
    attempt: 1 | 2,
    outcome: GenerationAttemptOutcome,
    usage: SceneGenerationUsage,
  ): void {
    try {
      this.telemetry.recordGenerationAttempt({
        provider: 'workers-ai',
        model: WORKERS_AI_SCENE_MODEL,
        attempt,
        outcome,
        usage,
      });
    } catch {
      // Telemetry is observational and must never change scene-generation behavior.
    }
  }
}

function normalizeCanonicalReferences(raw: string, input: SceneGenerationInput): string {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!isRecord(value)) return raw;

  const characterKeys = new Set(input.characters.map((character) => character.key));
  const factKeys = new Set(input.activeFacts.map((fact) => fact.key));
  const threadKeys = new Set(input.openThreads.map((thread) => thread.key));

  if (isRecord(value.threadChanges) && Array.isArray(value.threadChanges.resolve)) {
    value.threadChanges.resolve = value.threadChanges.resolve.filter((key) => typeof key === 'string' && threadKeys.has(key));
  }
  if (Array.isArray(value.choices)) {
    for (const choice of value.choices) {
      if (!isRecord(choice) || !isRecord(choice.stateDelta)) continue;
      const delta = choice.stateDelta;
      if (Array.isArray(delta.relationships)) {
        delta.relationships = delta.relationships.filter((relation) => {
          if (!isRecord(relation) || typeof relation.fromKey !== 'string' || typeof relation.toKey !== 'string') return false;
          return relation.fromKey !== relation.toKey && characterKeys.has(relation.fromKey) && characterKeys.has(relation.toKey);
        });
      }
      if (Array.isArray(delta.factKeysToResolve)) {
        delta.factKeysToResolve = delta.factKeysToResolve.filter((key) => typeof key === 'string' && factKeys.has(key));
      }
      if (Array.isArray(delta.threadKeysToResolve)) {
        delta.threadKeysToResolve = delta.threadKeysToResolve.filter((key) => typeof key === 'string' && threadKeys.has(key));
      }
    }
  }

  return JSON.stringify(value);
}

function extractResponseText(payload: unknown): string {
  if (!isRecord(payload)) return '';
  if (typeof payload.response === 'string') return payload.response;
  if (payload.response !== undefined) {
    try {
      return JSON.stringify(payload.response);
    } catch {
      return '';
    }
  }
  if (!Array.isArray(payload.choices) || payload.choices.length === 0) return '';
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return '';
  if (first.message.parsed !== undefined) {
    try {
      return JSON.stringify(first.message.parsed);
    } catch {
      return '';
    }
  }
  return typeof first.message.content === 'string' ? first.message.content : '';
}

function extractUsage(payload: unknown): SceneGenerationUsage {
  if (!isRecord(payload) || !isRecord(payload.usage)) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: firstNonNegativeInteger(payload.usage.prompt_tokens, payload.usage.input_tokens),
    outputTokens: firstNonNegativeInteger(payload.usage.completion_tokens, payload.usage.output_tokens),
  };
}

function firstNonNegativeInteger(...values: unknown[]): number {
  const value = values.find((candidate) => Number.isInteger(candidate) && Number(candidate) >= 0);
  return value === undefined ? 0 : Number(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
