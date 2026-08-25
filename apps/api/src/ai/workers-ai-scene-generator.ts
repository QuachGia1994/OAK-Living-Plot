import type {
  Result,
  SceneGenerationError,
  SceneGenerationInput,
  SceneGenerationSuccess,
  SceneGenerationUsage,
  SceneGenerator,
  SceneProposal,
} from './contracts';
import {
  applyCreativeSceneRepair,
  creativeSceneRepairResponseSchema,
  creativeSceneResponseSchema,
  parseCreativeSceneProposal,
  parseCreativeSceneRepair,
  validateCreativeSceneSemantics,
  type CreativeSceneProposal,
} from './creative-scene-schema';
import { compileCreativeScene } from './scene-compiler';
import { parseAndValidateSceneProposal } from './scene-schema';
import { buildCreativeScenePrompt, validateSceneGenerationInput } from './scene-prompt';
import { validateNarrativePublication } from '../evals/narrative-evaluator';
import {
  NOOP_GENERATION_TELEMETRY,
  type GenerationAttemptOutcome,
  type GenerationTelemetrySink,
} from '../telemetry/contracts';

/** Fast primary model; the slim schema leaves canonical state compilation to the server. */
export const WORKERS_AI_SCENE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
/** Stronger recovery model; used only after the fast primary proposal is rejected. */
export const WORKERS_AI_SCENE_RECOVERY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

interface ProviderResponse {
  text: string;
  usage: SceneGenerationUsage;
  model: string;
}

interface PipelineTimings {
  providerMs: number;
  parseMs: number;
  compileMs: number;
  validateMs: number;
}

export class WorkersAiSceneGenerator implements SceneGenerator {
  constructor(
    private readonly ai: Ai,
    private readonly telemetry: GenerationTelemetrySink = NOOP_GENERATION_TELEMETRY,
  ) {}

  async generate(input: SceneGenerationInput): Promise<Result<SceneGenerationSuccess, SceneGenerationError>> {
    const startedAt = Date.now();
    const inputValidation = validateSceneGenerationInput(input);
    if (!inputValidation.ok) {
      return { ok: false, error: { code: 'invalid_input', message: inputValidation.error.join(' ') } };
    }

    const timings: PipelineTimings = { providerMs: 0, parseMs: 0, compileMs: 0, validateMs: 0 };
    const usage: SceneGenerationUsage = { inputTokens: 0, outputTokens: 0 };
    let providerCalls = 0;
    let repairs = 0;

    const first = await this.requestCreative(input, [], timings);
    providerCalls += 1;
    if (!first.ok) {
      this.recordPipeline(timings, startedAt, providerCalls, repairs, 'provider_error', WORKERS_AI_SCENE_MODEL);
      return first;
    }
    addUsage(usage, first.value.usage);

    const firstParsed = timedParse(() => parseCreativeSceneProposal(first.value.text), timings);
    if (!firstParsed.ok) {
      this.recordAttempt(1, 'rejected', first.value.usage, first.value.model);
      const retry = await this.requestCreative(
        input,
        firstParsed.error,
        timings,
        WORKERS_AI_SCENE_RECOVERY_MODEL,
      );
      providerCalls += 1;
      if (!retry.ok) {
        this.recordPipeline(
          timings,
          startedAt,
          providerCalls,
          repairs,
          'provider_error',
          WORKERS_AI_SCENE_RECOVERY_MODEL,
        );
        return retry;
      }
      addUsage(usage, retry.value.usage);
      const retryParsed = timedParse(() => parseCreativeSceneProposal(retry.value.text), timings);
      if (!retryParsed.ok) {
        this.recordAttempt(2, 'rejected', retry.value.usage, retry.value.model);
        this.recordPipeline(timings, startedAt, providerCalls, repairs, 'invalid_response', retry.value.model, retryParsed.error);
        return invalidResponse(2);
      }
      const retryValidated = validateCreative(input, retryParsed.value, timings);
      if (!retryValidated.ok) {
        this.recordAttempt(2, 'rejected', retry.value.usage, retry.value.model);
        this.recordPipeline(timings, startedAt, providerCalls, repairs, 'invalid_response', retry.value.model, retryValidated.errors);
        return invalidResponse(2);
      }
      this.recordAttempt(2, 'accepted', retry.value.usage, retry.value.model);
      this.recordPipeline(timings, startedAt, providerCalls, repairs, 'accepted', retry.value.model);
      return success(retryValidated.proposal, usage, 2, retry.value.model);
    }

    const firstValidated = validateCreative(input, firstParsed.value, timings);
    if (firstValidated.ok) {
      this.recordAttempt(1, 'accepted', first.value.usage, first.value.model);
      this.recordPipeline(timings, startedAt, providerCalls, repairs, 'accepted', first.value.model);
      return success(firstValidated.proposal, usage, 1, first.value.model);
    }

    this.recordAttempt(1, 'rejected', first.value.usage, first.value.model);
    if (canTargetRepair(firstValidated.errors)) {
      const repaired = await this.requestRepair(
        input,
        firstParsed.value,
        firstValidated.errors,
        timings,
        WORKERS_AI_SCENE_RECOVERY_MODEL,
      );
      providerCalls += 1;
      repairs += 1;
      if (!repaired.ok) {
        this.recordPipeline(
          timings,
          startedAt,
          providerCalls,
          repairs,
          'provider_error',
          WORKERS_AI_SCENE_RECOVERY_MODEL,
        );
        return repaired;
      }
      addUsage(usage, repaired.value.usage);
      const repairParsed = timedParse(() => parseCreativeSceneRepair(repaired.value.text), timings);
      if (!repairParsed.ok) {
        this.recordAttempt(2, 'rejected', repaired.value.usage, repaired.value.model);
        this.recordPipeline(timings, startedAt, providerCalls, repairs, 'invalid_response', repaired.value.model, repairParsed.error);
        return invalidResponse(2);
      }
      const merged = applyCreativeSceneRepair(firstParsed.value, repairParsed.value);
      const repairValidated = validateCreative(input, merged, timings);
      if (!repairValidated.ok) {
        this.recordAttempt(2, 'rejected', repaired.value.usage, repaired.value.model);
        this.recordPipeline(timings, startedAt, providerCalls, repairs, 'invalid_response', repaired.value.model, repairValidated.errors);
        return invalidResponse(2);
      }
      this.recordAttempt(2, 'accepted', repaired.value.usage, repaired.value.model);
      this.recordPipeline(timings, startedAt, providerCalls, repairs, 'accepted', repaired.value.model);
      return success(repairValidated.proposal, usage, 2, repaired.value.model);
    }

    // Full regeneration is reserved for failures that cannot be repaired without rewriting the script.
    const retry = await this.requestCreative(
      input,
      firstValidated.errors,
      timings,
      WORKERS_AI_SCENE_RECOVERY_MODEL,
    );
    providerCalls += 1;
    if (!retry.ok) {
      this.recordPipeline(
        timings,
        startedAt,
        providerCalls,
        repairs,
        'provider_error',
        WORKERS_AI_SCENE_RECOVERY_MODEL,
      );
      return retry;
    }
    addUsage(usage, retry.value.usage);
    const retryParsed = timedParse(() => parseCreativeSceneProposal(retry.value.text), timings);
    if (!retryParsed.ok) {
      this.recordAttempt(2, 'rejected', retry.value.usage, retry.value.model);
      this.recordPipeline(timings, startedAt, providerCalls, repairs, 'invalid_response', retry.value.model, retryParsed.error);
      return invalidResponse(2);
    }
    const retryValidated = validateCreative(input, retryParsed.value, timings);
    if (!retryValidated.ok) {
      this.recordAttempt(2, 'rejected', retry.value.usage, retry.value.model);
      this.recordPipeline(timings, startedAt, providerCalls, repairs, 'invalid_response', retry.value.model, retryValidated.errors);
      return invalidResponse(2);
    }
    this.recordAttempt(2, 'accepted', retry.value.usage, retry.value.model);
    this.recordPipeline(timings, startedAt, providerCalls, repairs, 'accepted', retry.value.model);
    return success(retryValidated.proposal, usage, 2, retry.value.model);
  }

  private async requestCreative(
    input: SceneGenerationInput,
    validationErrors: string[],
    timings: PipelineTimings,
    model = WORKERS_AI_SCENE_MODEL,
  ): Promise<Result<ProviderResponse, SceneGenerationError>> {
    const prompt = buildCreativeScenePrompt(input, validationErrors);
    const startedAt = Date.now();
    let payload: unknown;
    try {
      payload = await this.ai.run(model, {
        messages: [
          { role: 'system', content: prompt.systemInstruction },
          { role: 'user', content: prompt.userContent },
        ],
        response_format: { type: 'json_schema', json_schema: creativeSceneResponseSchema },
        max_tokens: 2300,
        temperature: 0.45,
      });
    } catch {
      timings.providerMs += Date.now() - startedAt;
      return {
        ok: false,
        error: { code: 'provider_unavailable', message: 'Scene provider request failed.', retryable: true },
      };
    }
    timings.providerMs += Date.now() - startedAt;
    return { ok: true, value: { text: extractResponseText(payload), usage: extractUsage(payload), model } };
  }

  private async requestRepair(
    input: SceneGenerationInput,
    creative: CreativeSceneProposal,
    validationErrors: string[],
    timings: PipelineTimings,
    model = WORKERS_AI_SCENE_RECOVERY_MODEL,
  ): Promise<Result<ProviderResponse, SceneGenerationError>> {
    const prompt = buildCreativeScenePrompt(input, validationErrors);
    const repairDraft = {
      title: creative.title,
      summary: creative.summary,
      beat: creative.beat,
      pacingRole: creative.pacingRole,
      establishedFacts: creative.establishedFacts,
      threadsToOpen: creative.threadsToOpen,
      threadTitlesToResolve: creative.threadTitlesToResolve,
      choices: creative.choices,
    };
    const startedAt = Date.now();
    let payload: unknown;
    try {
      payload = await this.ai.run(model, {
        messages: [
          {
            role: 'system',
            content: [
              prompt.systemInstruction,
              'Repair metadata and choices only. The original script is immutable and MUST NOT be returned.',
              'Return the smaller repair schema only. Make each durableFact concrete, branch-specific, and supported by its consequence.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: `${prompt.userContent}\nORIGINAL_CREATIVE_DRAFT_JSON\n${JSON.stringify(repairDraft)}\nEND_ORIGINAL_CREATIVE_DRAFT_JSON`,
          },
        ],
        response_format: { type: 'json_schema', json_schema: creativeSceneRepairResponseSchema },
        max_tokens: 1200,
        temperature: 0.3,
      });
    } catch {
      timings.providerMs += Date.now() - startedAt;
      return {
        ok: false,
        error: { code: 'provider_unavailable', message: 'Scene provider repair request failed.', retryable: true },
      };
    }
    timings.providerMs += Date.now() - startedAt;
    return { ok: true, value: { text: extractResponseText(payload), usage: extractUsage(payload), model } };
  }

  private recordAttempt(
    attempt: 1 | 2,
    outcome: GenerationAttemptOutcome,
    usage: SceneGenerationUsage,
    model: string,
  ): void {
    try {
      this.telemetry.recordGenerationAttempt({
        provider: 'workers-ai',
        model,
        attempt,
        outcome,
        usage,
      });
    } catch {
      // Telemetry is observational and must never change scene-generation behavior.
    }
  }

  private recordPipeline(
    timings: PipelineTimings,
    startedAt: number,
    providerCalls: number,
    repairs: number,
    outcome: 'accepted' | 'invalid_response' | 'provider_error',
    model: string,
    errors?: string[],
  ): void {
    try {
      this.telemetry.recordGenerationPipeline?.({
        provider: 'workers-ai',
        model,
        providerCalls,
        repairs,
        outcome,
        timings: {
          providerMs: timings.providerMs,
          parseMs: timings.parseMs,
          compileMs: timings.compileMs,
          validateMs: timings.validateMs,
          totalMs: Date.now() - startedAt,
        },
      });
    } catch {
      // Pipeline telemetry is fail-open and contains timing/count metadata only.
    }
    if (outcome === 'invalid_response' && errors && errors.length > 0) {
      safePipelineDiagnostic(errors, model, providerCalls, repairs);
    }
  }
}

function safePipelineDiagnostic(
  errors: string[],
  model: string,
  providerCalls: number,
  repairs: number,
): void {
  try {
    console.info('[scene-generation][invalid_response]', {
      provider: 'workers-ai',
      model,
      providerCalls,
      repairs,
      stage: repairs > 0 ? 'after_repair' : 'initial_or_retry',
      errorCount: errors.length,
      errors: errors.map((error) => redactValidationMessage(error)).slice(0, 20),
    });
  } catch {
    // Diagnostics are observational only.
  }
}

/**
 * Server-side validation messages occasionally include short provider echo fragments
 * that may contain quoted user-facing tokens. We strip them down to a structural
 * shape so the log cannot leak the canonical drama prose.
 */
function redactValidationMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 80)}…[truncated, ${trimmed.length} chars]`;
}

function validateCreative(
  input: SceneGenerationInput,
  creative: CreativeSceneProposal,
  timings: PipelineTimings,
): { ok: true; proposal: SceneProposal } | { ok: false; errors: string[] } {
  const creativeErrors = validateCreativeSceneSemantics(creative);
  if (creativeErrors.length > 0) return { ok: false, errors: creativeErrors };

  const compileStartedAt = Date.now();
  const compiled = compileCreativeScene(input, creative);
  timings.compileMs += Date.now() - compileStartedAt;

  const validateStartedAt = Date.now();
  const structural = parseAndValidateSceneProposal(JSON.stringify(compiled), input);
  if (!structural.ok) {
    timings.validateMs += Date.now() - validateStartedAt;
    return { ok: false, errors: structural.error };
  }
  const publication = validateNarrativePublication(input, structural.value);
  timings.validateMs += Date.now() - validateStartedAt;
  return publication.publishable
    ? { ok: true, proposal: structural.value }
    : { ok: false, errors: publication.rejectionReasons };
}

function timedParse<T>(parse: () => T, timings: PipelineTimings): T {
  const startedAt = Date.now();
  const result = parse();
  timings.parseMs += Date.now() - startedAt;
  return result;
}

function canTargetRepair(errors: string[]): boolean {
  return !errors.some((error) =>
    error.includes('Scene script must stay within')
    || error.includes('Scene title, script, or summary is invalid')
    || error.includes('Creative response is not valid JSON')
    || error.includes('CONSEQUENCE_NOT_REALIZED'),
  );
}

function success(
  proposal: SceneProposal,
  usage: SceneGenerationUsage,
  attempts: 1 | 2,
  model: string,
): Result<SceneGenerationSuccess, SceneGenerationError> {
  return {
    ok: true,
    value: {
      proposal,
      usage,
      attempts,
      provider: 'workers-ai',
      model,
    },
  };
}

function invalidResponse(attempts: 1 | 2): Result<never, SceneGenerationError> {
  return {
    ok: false,
    error: {
      code: 'invalid_response',
      message: attempts === 1
        ? 'Scene provider returned an invalid creative proposal.'
        : 'Scene provider returned an invalid proposal after one controlled repair or retry.',
      attempts,
    },
  };
}

function addUsage(total: SceneGenerationUsage, next: SceneGenerationUsage): void {
  total.inputTokens += next.inputTokens;
  total.outputTokens += next.outputTokens;
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
