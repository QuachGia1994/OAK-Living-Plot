import type {
  EpisodeGenerationInput,
  Result,
  StoryGenerationError,
  StoryGenerationSuccess,
  StoryGenerationUsage,
  StoryGenerator,
} from './contracts';
import { episodeResponseSchema, parseAndValidateEpisodeProposal } from './episode-schema';
import { buildStoryPrompt, validateEpisodeGenerationInput } from './prompt';
import {
  NOOP_STORY_TELEMETRY,
  type StoryGenerationAttemptOutcome,
  type StoryTelemetrySink,
} from '../telemetry/contracts';

export const STORY_MODEL = 'gemini-3.5-flash-lite';
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

export class GeminiStoryGenerator implements StoryGenerator {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly timeoutMs = 12_000,
    private readonly telemetry: StoryTelemetrySink = NOOP_STORY_TELEMETRY,
  ) {}

  async generate(input: EpisodeGenerationInput): Promise<Result<StoryGenerationSuccess, StoryGenerationError>> {
    const inputValidation = validateEpisodeGenerationInput(input);
    if (!inputValidation.ok) {
      return { ok: false, error: { code: 'invalid_input', message: inputValidation.error.join(' ') } };
    }
    if (!this.apiKey.trim()) {
      return { ok: false, error: { code: 'provider_unavailable', message: 'Story provider is not configured.', retryable: false } };
    }

    let validationErrors: string[] = [];
    const usage: StoryGenerationUsage = { inputTokens: 0, outputTokens: 0 };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const provider = await this.requestModel(input, validationErrors);
      if (!provider.ok) return provider;

      usage.inputTokens += provider.value.usage.inputTokens;
      usage.outputTokens += provider.value.usage.outputTokens;
      const validated = parseAndValidateEpisodeProposal(provider.value.text, input);
      this.recordAttempt(attempt as 1 | 2, validated.ok ? 'accepted' : 'rejected', provider.value.usage);
      if (validated.ok) {
        return {
          ok: true,
          value: { proposal: validated.value, usage, attempts: attempt, provider: 'gemini', model: STORY_MODEL },
        };
      }

      validationErrors = validated.error;
      if (attempt === 2) {
        return {
          ok: false,
          error: {
            code: 'invalid_response',
            message: 'Story provider returned an invalid structured proposal after one controlled retry.',
            attempts: 2,
          },
        };
      }
    }

    return { ok: false, error: { code: 'invalid_response', message: 'Story generation failed.', attempts: 2 } };
  }

  private recordAttempt(
    attempt: 1 | 2,
    outcome: StoryGenerationAttemptOutcome,
    usage: StoryGenerationUsage,
  ): void {
    try {
      this.telemetry.recordGenerationAttempt({ provider: 'gemini', model: STORY_MODEL, attempt, outcome, usage });
    } catch {
      // Telemetry is observational and must never change story-generation behavior.
    }
  }

  private async requestModel(
    input: EpisodeGenerationInput,
    validationErrors: string[],
  ): Promise<Result<{ text: string; usage: StoryGenerationUsage }, StoryGenerationError>> {
    const prompt = buildStoryPrompt(input, validationErrors);
    let response: Response;
    try {
      response = await this.fetcher(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: STORY_MODEL,
          input: prompt.userContent,
          system_instruction: prompt.systemInstruction,
          generation_config: { thinking_level: 'minimal' },
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: episodeResponseSchema,
          },
          store: false,
        }),
      });
    } catch {
      return {
        ok: false,
        error: { code: 'provider_unavailable', message: 'Story provider request failed.', retryable: true },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: 'provider_unavailable',
          message: 'Story provider rejected the request.',
          retryable: response.status === 429 || response.status >= 500,
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
