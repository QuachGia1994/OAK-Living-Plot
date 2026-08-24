import type { DramaMood } from '../domain/drama';
import {
  DRAMA_SUGGESTION_PIPELINE_TIMEOUT_MS,
  type DramaSeedSuggester,
  type DramaSeedSuggestion,
  type DramaSeedSuggestionProviderError,
  type DramaSeedSuggestionProviderInput,
  type DramaSeedSuggestionProviderMetrics,
  type DramaSeedSuggestionProviderSuccess,
} from '../drama-runtime/suggestion-contracts';
import { boundedNormalizedText, validatePublicSuggestions } from '../drama-runtime/suggestion-validation';
import { WORKERS_AI_SCENE_MODEL } from './workers-ai-scene-generator';

interface SeedProposal {
  label: string;
  incitingIncident: string;
  personalStakes: string;
  decisionPressure: string;
  dramaticQuestion: string;
  mood: DramaMood;
  characterName: string;
}

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'incitingIncident', 'personalStakes', 'decisionPressure', 'dramaticQuestion', 'mood', 'characterName'],
        properties: {
          label: { type: 'string', minLength: 3, maxLength: 48 },
          incitingIncident: { type: 'string', minLength: 12, maxLength: 180 },
          personalStakes: { type: 'string', minLength: 12, maxLength: 160 },
          decisionPressure: { type: 'string', minLength: 12, maxLength: 160 },
          dramaticQuestion: { type: 'string', minLength: 8, maxLength: 120 },
          mood: { type: 'string', enum: ['tense', 'mysterious', 'romantic', 'hopeful'] },
          characterName: { type: 'string', minLength: 2, maxLength: 50 },
        },
      },
    },
  },
} as const;

export class WorkersAiDramaSeedSuggester implements DramaSeedSuggester {
  constructor(
    private readonly ai: Ai,
    private readonly clock: () => number = Date.now,
    private readonly pipelineTimeoutMs = DRAMA_SUGGESTION_PIPELINE_TIMEOUT_MS,
  ) {}

  async suggest(input: DramaSeedSuggestionProviderInput): Promise<
    { ok: true; value: DramaSeedSuggestionProviderSuccess } |
    { ok: false; error: DramaSeedSuggestionProviderError }
  > {
    const metrics: DramaSeedSuggestionProviderMetrics = { providerMs: 0, parseMs: 0, validateMs: 0, providerCalls: 0, repairs: 0 };
    const deadlineAt = this.clock() + this.pipelineTimeoutMs;
    const first = await this.request(input, undefined, metrics, deadlineAt);
    if (!first.ok) return { ok: false, error: { code: 'provider_unavailable', metrics } };
    const parsed = parseBatch(first.text, metrics);
    if (parsed.ok) return { ok: true, value: { suggestions: parsed.suggestions, ...metrics } };

    metrics.repairs += 1;
    const repair = await this.request(input, parsed.errors, metrics, deadlineAt);
    if (!repair.ok) return { ok: false, error: { code: 'provider_unavailable', metrics } };
    const repaired = parseBatch(repair.text, metrics);
    if (!repaired.ok) return { ok: false, error: { code: 'invalid_suggestion_response', metrics } };
    return { ok: true, value: { suggestions: repaired.suggestions, ...metrics } };
  }

  private async request(
    input: DramaSeedSuggestionProviderInput,
    repairErrors: string[] | undefined,
    metrics: DramaSeedSuggestionProviderMetrics,
    deadlineAt: number,
  ): Promise<{ ok: true; text: string } | { ok: false }> {
    const prompt = buildPrompt(input, repairErrors);
    const startedAt = this.clock();
    const remainingMs = Math.max(0, deadlineAt - startedAt);
    if (remainingMs === 0) return { ok: false };
    metrics.providerCalls += 1;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const provider = this.ai.run(WORKERS_AI_SCENE_MODEL, {
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        response_format: { type: 'json_schema', json_schema: responseSchema },
        max_tokens: 1200,
        temperature: repairErrors ? 0.25 : 0.7,
      }, { signal: controller.signal });
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('suggestion_provider_timeout'));
        }, remainingMs);
      });
      const payload = await Promise.race([provider, deadline]);
      metrics.providerMs += Math.max(0, this.clock() - startedAt);
      return { ok: true, text: extractResponseText(payload) };
    } catch {
      metrics.providerMs += Math.max(0, this.clock() - startedAt);
      return { ok: false };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}

function buildPrompt(input: DramaSeedSuggestionProviderInput, repairErrors?: string[]) {
  const language = input.locale === 'vi-VN' ? 'Vietnamese' : 'English';
  return {
    system: [
      'You generate pre-story dramatic seed options, never scenes.',
      `Write all user-visible text in ${language}.`,
      'Content rating: teen. No explicit sexual content, graphic violence, or self-harm instructions.',
      'Return exactly three materially distinct directions. Do not paraphrase one premise three ways.',
      'Each direction must contain one concrete inciting incident, personal stakes, immediate decision pressure, and one unanswered dramatic question.',
      'Do not return scripts, scene prose, choices, state deltas, facts, threads, relationships, IDs, provider metadata, or commentary.',
      'Labels must be short meaningful phrases and must not be A, B, C, Option A, Option B, or Option C.',
      repairErrors?.length ? `Previous output failed validation: ${repairErrors.slice(0, 6).join(' | ')}. Return a fresh corrected batch only.` : '',
    ].filter(Boolean).join('\n'),
    user: JSON.stringify({
      preferredMood: input.mood,
      optionalCharacterName: input.characterName ?? null,
      optionalInspiration: input.inspiration ?? null,
      requirement: 'Exactly three different dramatic sparks.',
    }),
  };
}

function parseBatch(text: string, metrics: DramaSeedSuggestionProviderMetrics):
  | { ok: true; suggestions: [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion] }
  | { ok: false; errors: string[] } {
  const parseStartedAt = Date.now();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    metrics.parseMs += Date.now() - parseStartedAt;
    return { ok: false, errors: ['Response is not valid JSON.'] };
  }
  metrics.parseMs += Date.now() - parseStartedAt;

  const validateStartedAt = Date.now();
  const parsed = parseProposalEnvelope(value);
  if (!parsed.ok) {
    metrics.validateMs += Date.now() - validateStartedAt;
    return parsed;
  }
  const suggestions = parsed.proposals.map(compileProposal) as [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion];
  const errors = validatePublicSuggestions(suggestions);
  metrics.validateMs += Date.now() - validateStartedAt;
  return errors.length === 0 ? { ok: true, suggestions } : { ok: false, errors };
}

function parseProposalEnvelope(value: unknown): { ok: true; proposals: [SeedProposal, SeedProposal, SeedProposal] } | { ok: false; errors: string[] } {
  if (!isRecord(value) || !hasOnlyKeys(value, ['suggestions']) || !Array.isArray(value.suggestions) || value.suggestions.length !== 3) {
    return { ok: false, errors: ['Response must contain exactly three suggestions and no other fields.'] };
  }
  const proposals: SeedProposal[] = [];
  const errors: string[] = [];
  value.suggestions.forEach((item, index) => {
    const parsed = parseProposal(item, index);
    if (parsed.ok) proposals.push(parsed.value);
    else errors.push(...parsed.errors);
  });
  return errors.length === 0
    ? { ok: true, proposals: proposals as [SeedProposal, SeedProposal, SeedProposal] }
    : { ok: false, errors };
}

function parseProposal(value: unknown, index: number): { ok: true; value: SeedProposal } | { ok: false; errors: string[] } {
  const keys = ['label', 'incitingIncident', 'personalStakes', 'decisionPressure', 'dramaticQuestion', 'mood', 'characterName'];
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return { ok: false, errors: [`Suggestion ${index + 1} has an invalid shape.`] };
  const label = boundedNormalizedText(value.label, 3, 48);
  const incitingIncident = boundedNormalizedText(value.incitingIncident, 12, 180);
  const personalStakes = boundedNormalizedText(value.personalStakes, 12, 160);
  const decisionPressure = boundedNormalizedText(value.decisionPressure, 12, 160);
  const dramaticQuestion = boundedNormalizedText(value.dramaticQuestion, 8, 120);
  const characterName = boundedNormalizedText(value.characterName, 2, 50);
  if (!label || !incitingIncident || !personalStakes || !decisionPressure || !dramaticQuestion || !characterName || !isMood(value.mood)) {
    return { ok: false, errors: [`Suggestion ${index + 1} contains an invalid field.`] };
  }
  if (/^(?:option\s*)?[abc]$/iu.test(label)) return { ok: false, errors: [`Suggestion ${index + 1} uses a reserved choice label.`] };
  if (!dramaticQuestion.endsWith('?')) return { ok: false, errors: [`Suggestion ${index + 1} needs an unanswered question.`] };
  return { ok: true, value: { label, incitingIncident, personalStakes, decisionPressure, dramaticQuestion, mood: value.mood, characterName } };
}

function compileProposal(value: SeedProposal): DramaSeedSuggestion {
  return {
    label: value.label,
    premise: [value.incitingIncident, value.personalStakes, value.decisionPressure, value.dramaticQuestion].join(' '),
    mood: value.mood,
    characterName: value.characterName,
  };
}

function hasOnlyKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const allowed = new Set(expected);
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => allowed.has(key));
}

function isMood(value: unknown): value is DramaMood {
  return value === 'tense' || value === 'mysterious' || value === 'romantic' || value === 'hopeful';
}

function extractResponseText(payload: unknown): string {
  if (!isRecord(payload)) return '';
  if (typeof payload.response === 'string') return payload.response;
  if (payload.response !== undefined) {
    try { return JSON.stringify(payload.response); } catch { return ''; }
  }
  if (!Array.isArray(payload.choices) || payload.choices.length === 0) return '';
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return '';
  if (first.message.parsed !== undefined) {
    try { return JSON.stringify(first.message.parsed); } catch { return ''; }
  }
  return typeof first.message.content === 'string' ? first.message.content : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
