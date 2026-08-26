import type {
  Result,
  SceneGenerationError,
  SceneGenerationInput,
  SceneGenerationSuccess,
  SceneGenerationUsage,
  SceneGenerator,
} from './contracts';
import { parseAndValidateSceneProposal, sceneResponseSchemaForInput } from './scene-schema';
import { buildScenePrompt, validateSceneGenerationInput } from './scene-prompt';
import { validateNarrativePublication } from '../evals/narrative-evaluator';
import {
  NOOP_GENERATION_TELEMETRY,
  type GenerationAttemptOutcome,
  type GenerationTelemetrySink,
} from '../telemetry/contracts';

export const SCENE_MODEL = 'gemini-3.5-flash-lite';
export const SCENE_FALLBACK_MODEL = 'gemini-3.6-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface GeminiResponse {
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
}

export class GeminiSceneGenerator implements SceneGenerator {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch.bind(globalThis),
    private readonly timeoutMs = 12_000,
    private readonly telemetry: GenerationTelemetrySink = NOOP_GENERATION_TELEMETRY,
    private readonly model = SCENE_MODEL,
    private readonly thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' = 'minimal',
  ) {}

  async generate(input: SceneGenerationInput): Promise<Result<SceneGenerationSuccess, SceneGenerationError>> {
    const inputValidation = validateSceneGenerationInput(input);
    if (!inputValidation.ok) {
      return { ok: false, error: { code: 'invalid_input', message: inputValidation.error.join(' ') } };
    }
    if (!this.apiKey.trim()) {
      return { ok: false, error: { code: 'provider_unavailable', message: 'Scene provider is not configured.', retryable: false } };
    }

    let validationErrors: string[] = [];
    const usage: SceneGenerationUsage = { inputTokens: 0, outputTokens: 0 };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const provider = await this.requestModel(input, validationErrors);
      if (!provider.ok) return provider;

      usage.inputTokens += provider.value.usage.inputTokens;
      usage.outputTokens += provider.value.usage.outputTokens;
      const validated = parseAndValidateSceneProposal(provider.value.text, input);
      if (!validated.ok) {
        this.recordAttempt(attempt as 1 | 2, 'rejected', provider.value.usage);
        validationErrors = validated.error;
      } else {
        const publication = validateNarrativePublication(input, validated.value);
        if (!publication.publishable) {
          this.recordAttempt(attempt as 1 | 2, 'rejected', provider.value.usage);
          validationErrors = publication.rejectionReasons;
        } else {
          this.recordAttempt(attempt as 1 | 2, 'accepted', provider.value.usage);
          return {
            ok: true,
            value: { proposal: validated.value, usage, attempts: attempt, provider: 'gemini', model: this.model },
          };
        }
      }

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

  private recordAttempt(
    attempt: 1 | 2,
    outcome: GenerationAttemptOutcome,
    usage: SceneGenerationUsage,
  ): void {
    try {
      this.telemetry.recordGenerationAttempt({ provider: 'gemini', model: this.model, attempt, outcome, usage });
    } catch {
      // Telemetry is observational and must never change scene-generation behavior.
    }
  }

  private async requestModel(
    input: SceneGenerationInput,
    validationErrors: string[],
  ): Promise<Result<{ text: string; usage: SceneGenerationUsage }, SceneGenerationError>> {
    const prompt = buildScenePrompt(input, validationErrors);
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      response = await this.fetcher(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          input: prompt.userContent,
          system_instruction: prompt.systemInstruction,
          generation_config: { thinking_level: this.thinkingLevel },
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: sceneResponseSchemaForInput(input),
          },
          store: false,
        }),
      });
    } catch {
      return {
        ok: false,
        error: { code: 'provider_unavailable', message: controller.signal.aborted ? 'Scene provider request timed out.' : 'Scene provider request failed.', retryable: true },
      };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: 'provider_unavailable',
          message: 'Scene provider rejected the request.',
          retryable: response.status === 429 || response.status >= 500,
          providerStatus: response.status,
        },
      };
    }

    let payload: GeminiResponse;
    try {
      payload = (await response.json()) as GeminiResponse;
    } catch {
      return { ok: true, value: { text: '', usage: { inputTokens: 0, outputTokens: 0 } } };
    }

    const text =
      payload.steps
        ?.filter((step) => step.type === 'model_output')
        .flatMap((step) => step.content ?? [])
        .filter((content) => content.type === 'text')
        .map((content) => content.text ?? '')
        .join('') ?? '';
    return {
      ok: true,
      value: {
        text,
        usage: {
          inputTokens: nonNegativeInteger(payload.usage?.total_input_tokens),
          outputTokens: nonNegativeInteger(payload.usage?.total_output_tokens),
        },
      },
    };
  }
}

function nonNegativeInteger(value: number | undefined): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}
