import { isNarrativeBeat, NARRATIVE_BEATS, type NarrativeBeat } from '../evals/narrative-novelty';
import { isPacingRole, PACING_ROLES, type PacingRole } from '../evals/narrative-quality';
import type { Result, ThreadProposal } from './contracts';

export interface CreativeSceneChoice {
  key: 'A' | 'B' | 'C';
  label: string;
  intent: string;
  consequence: string;
  /** Model-authored durable branch fact. The server may canonicalize storage, but never invent this text. */
  durableFact: string;
  factTextsToResolve: string[];
  threadTitlesToResolve: string[];
  threadsToOpen: ThreadProposal[];
  nextTone: string;
}

export interface CreativeSceneProposal {
  title: string;
  script: string;
  summary: string;
  beat: NarrativeBeat;
  pacingRole: PacingRole;
  establishedFacts: string[];
  threadsToOpen: ThreadProposal[];
  threadTitlesToResolve: string[];
  choices: [CreativeSceneChoice, CreativeSceneChoice, CreativeSceneChoice];
}

export type CreativeSceneRepair = Omit<CreativeSceneProposal, 'script'>;

export const creativeSceneResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'script',
    'summary',
    'beat',
    'pacingRole',
    'establishedFacts',
    'threadsToOpen',
    'threadTitlesToResolve',
    'choices',
  ],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 80 },
    // 8B provider often lands 400–700 chars on continuations; spoken-length quality remains advisory.
    script: { type: 'string', minLength: 400, maxLength: 2400 },
    summary: { type: 'string', minLength: 1, maxLength: 240 },
    beat: { type: 'string', enum: [...NARRATIVE_BEATS] },
    pacingRole: { type: 'string', enum: [...PACING_ROLES] },
    establishedFacts: {
      type: 'array',
      maxItems: 2,
      items: { type: 'string', minLength: 1, maxLength: 160 },
    },
    threadsToOpen: {
      type: 'array',
      maxItems: 2,
      items: threadSchema(),
    },
    threadTitlesToResolve: {
      type: 'array',
      maxItems: 2,
      items: { type: 'string', minLength: 1, maxLength: 160 },
    },
    choices: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'key',
          'label',
          'intent',
          'consequence',
          'durableFact',
          'factTextsToResolve',
          'threadTitlesToResolve',
          'threadsToOpen',
          'nextTone',
        ],
        properties: {
          key: { type: 'string', enum: ['A', 'B', 'C'] },
          label: { type: 'string', minLength: 1, maxLength: 120 },
          intent: { type: 'string', minLength: 1, maxLength: 120 },
          consequence: { type: 'string', minLength: 1, maxLength: 240 },
          durableFact: { type: 'string', minLength: 1, maxLength: 160 },
          factTextsToResolve: {
            type: 'array',
            maxItems: 2,
            items: { type: 'string', minLength: 1, maxLength: 160 },
          },
          threadTitlesToResolve: {
            type: 'array',
            maxItems: 2,
            items: { type: 'string', minLength: 1, maxLength: 160 },
          },
          threadsToOpen: {
            type: 'array',
            maxItems: 1,
            items: threadSchema(),
          },
          nextTone: { type: 'string', minLength: 1, maxLength: 80 },
        },
      },
    },
  },
} as const;

export const creativeSceneRepairResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'beat', 'pacingRole', 'establishedFacts', 'threadsToOpen', 'threadTitlesToResolve', 'choices'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 80 },
    summary: { type: 'string', minLength: 1, maxLength: 240 },
    beat: { type: 'string', enum: [...NARRATIVE_BEATS] },
    pacingRole: { type: 'string', enum: [...PACING_ROLES] },
    establishedFacts: { type: 'array', maxItems: 2, items: { type: 'string', minLength: 1, maxLength: 160 } },
    threadsToOpen: { type: 'array', maxItems: 2, items: threadSchema() },
    threadTitlesToResolve: { type: 'array', maxItems: 2, items: { type: 'string', minLength: 1, maxLength: 160 } },
    choices: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: creativeChoiceSchema(),
    },
  },
} as const;

export function parseCreativeSceneProposal(raw: string): Result<CreativeSceneProposal, string[]> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid('Creative response is not valid JSON.');
  }
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'title',
    'script',
    'summary',
    'beat',
    'pacingRole',
    'establishedFacts',
    'threadsToOpen',
    'threadTitlesToResolve',
    'choices',
  ])) {
    return invalid('Creative scene proposal has an invalid top-level shape.');
  }
  if (!boundedText(value.title, 1, 120) || !boundedText(value.script, 1, 6000) || !boundedText(value.summary, 1, 800)) {
    return invalid('Creative scene title, script, or summary is invalid.');
  }
  if (!isNarrativeBeat(value.beat)) return invalid('Creative scene beat is invalid.');
  if (!isPacingRole(value.pacingRole)) return invalid('Creative scene pacingRole is invalid.');
  if (!stringArray(value.establishedFacts, 4, 400)) return invalid('Creative established facts are invalid.');
  const threadsToOpen = parseThreadArray(value.threadsToOpen, 4);
  if (!threadsToOpen.ok) return threadsToOpen;
  if (!stringArray(value.threadTitlesToResolve, 4, 240)) return invalid('Creative resolved thread titles are invalid.');
  if (!Array.isArray(value.choices) || value.choices.length !== 3) return invalid('Creative scene requires exactly three choices.');

  const choices: CreativeSceneChoice[] = [];
  for (const choice of value.choices) {
    const parsed = parseChoice(choice);
    if (!parsed.ok) return parsed;
    choices.push(parsed.value);
  }
  if (choices.map((choice) => choice.key).join(',') !== 'A,B,C') {
    return invalid('Creative choices must be ordered and keyed A, B, C exactly once.');
  }

  return {
    ok: true,
    value: {
      title: value.title,
      script: value.script,
      summary: value.summary,
      beat: value.beat,
      pacingRole: value.pacingRole,
      establishedFacts: value.establishedFacts,
      threadsToOpen: threadsToOpen.value,
      threadTitlesToResolve: value.threadTitlesToResolve,
      choices: [choices[0], choices[1], choices[2]],
    },
  };
}

export function parseCreativeSceneRepair(raw: string): Result<CreativeSceneRepair, string[]> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid('Creative repair response is not valid JSON.');
  }
  const keys = ['title', 'summary', 'beat', 'pacingRole', 'establishedFacts', 'threadsToOpen', 'threadTitlesToResolve', 'choices'];
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return invalid('Creative repair has an invalid shape.');
  if (!boundedText(value.title, 1, 120) || !boundedText(value.summary, 1, 800)) return invalid('Creative repair title or summary is invalid.');
  if (!isNarrativeBeat(value.beat)) return invalid('Creative repair beat is invalid.');
  if (!isPacingRole(value.pacingRole)) return invalid('Creative repair pacingRole is invalid.');
  if (!stringArray(value.establishedFacts, 4, 400)) return invalid('Creative repair established facts are invalid.');
  const threadsToOpen = parseThreadArray(value.threadsToOpen, 4);
  if (!threadsToOpen.ok) return threadsToOpen;
  if (!stringArray(value.threadTitlesToResolve, 4, 240)) return invalid('Creative repair resolved thread titles are invalid.');
  if (!Array.isArray(value.choices) || value.choices.length !== 3) return invalid('Creative repair requires exactly three choices.');
  const choices: CreativeSceneChoice[] = [];
  for (const choice of value.choices) {
    const parsed = parseChoice(choice);
    if (!parsed.ok) return parsed;
    choices.push(parsed.value);
  }
  if (choices.map((choice) => choice.key).join(',') !== 'A,B,C') return invalid('Creative repair choices must be ordered A, B, C.');
  return {
    ok: true,
    value: {
      title: value.title,
      summary: value.summary,
      beat: value.beat,
      pacingRole: value.pacingRole,
      establishedFacts: value.establishedFacts,
      threadsToOpen: threadsToOpen.value,
      threadTitlesToResolve: value.threadTitlesToResolve,
      choices: [choices[0], choices[1], choices[2]],
    },
  };
}

export function applyCreativeSceneRepair(base: CreativeSceneProposal, repair: CreativeSceneRepair): CreativeSceneProposal {
  return { ...repair, script: base.script };
}

export function validateCreativeSceneSemantics(creative: CreativeSceneProposal): string[] {
  const errors: string[] = [];
  const durableFacts = creative.choices.map((choice) => choice.durableFact);
  if (new Set(durableFacts.map(semanticText)).size !== durableFacts.length) {
    errors.push('Creative durable facts must be branch-specific and distinct.');
  }
  for (const choice of creative.choices) {
    const tokens = semanticTokens(choice.durableFact);
    const factChars = choice.durableFact.trim().length;
    // Vietnamese short phrases may yield fewer Latin-style tokens; require substance by length or tokens.
    if ((tokens.length < 2 && factChars < 12) || isPlaceholderDurableFact(choice.durableFact)) {
      errors.push(`Choice ${choice.key} durableFact is too generic to become canonical story state.`);
      continue;
    }
    const consequenceTokens = new Set(semanticTokens(choice.consequence));
    const consequenceText = semanticText(choice.consequence);
    const factText = semanticText(choice.durableFact);
    const tokenOverlap = tokens.some((token) => consequenceTokens.has(token));
    const phraseOverlap = factText.length >= 8 && consequenceText.includes(factText.slice(0, Math.min(factText.length, 16)));
    if (!tokenOverlap && !phraseOverlap) {
      errors.push(`Choice ${choice.key} durableFact is not supported by its consequence.`);
    }
  }
  if (hasMateriallySimilarPair(durableFacts, 0.68)) {
    errors.push('Creative durable facts must create materially different branch outcomes.');
  }
  return errors;
}

function parseChoice(value: unknown): Result<CreativeSceneChoice, string[]> {
  const keys = [
    'key',
    'label',
    'intent',
    'consequence',
    'durableFact',
    'factTextsToResolve',
    'threadTitlesToResolve',
    'threadsToOpen',
    'nextTone',
  ];
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return invalid('Creative choice shape is invalid.');
  if (value.key !== 'A' && value.key !== 'B' && value.key !== 'C') return invalid('Creative choice key is invalid.');
  if (
    !boundedText(value.label, 1, 240)
    || !boundedText(value.intent, 1, 240)
    || !boundedText(value.consequence, 1, 500)
    || !boundedText(value.durableFact, 1, 400)
    || !boundedText(value.nextTone, 1, 80)
  ) {
    return invalid('Creative choice text is invalid.');
  }
  if (!stringArray(value.factTextsToResolve, 4, 240) || !stringArray(value.threadTitlesToResolve, 4, 240)) {
    return invalid('Creative choice resolution hints are invalid.');
  }
  const threadsToOpen = parseThreadArray(value.threadsToOpen, 2);
  if (!threadsToOpen.ok) return threadsToOpen;
  return {
    ok: true,
    value: {
      key: value.key,
      label: value.label,
      intent: value.intent,
      consequence: value.consequence,
      durableFact: value.durableFact,
      factTextsToResolve: value.factTextsToResolve,
      threadTitlesToResolve: value.threadTitlesToResolve,
      threadsToOpen: threadsToOpen.value,
      nextTone: value.nextTone,
    },
  };
}

function creativeChoiceSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'key',
      'label',
      'intent',
      'consequence',
      'durableFact',
      'factTextsToResolve',
      'threadTitlesToResolve',
      'threadsToOpen',
      'nextTone',
    ],
    properties: {
      key: { type: 'string', enum: ['A', 'B', 'C'] },
      label: { type: 'string', minLength: 1, maxLength: 120 },
      intent: { type: 'string', minLength: 1, maxLength: 120 },
      consequence: { type: 'string', minLength: 1, maxLength: 240 },
      durableFact: { type: 'string', minLength: 1, maxLength: 160 },
      factTextsToResolve: { type: 'array', maxItems: 2, items: { type: 'string', minLength: 1, maxLength: 160 } },
      threadTitlesToResolve: { type: 'array', maxItems: 2, items: { type: 'string', minLength: 1, maxLength: 160 } },
      threadsToOpen: { type: 'array', maxItems: 1, items: threadSchema() },
      nextTone: { type: 'string', minLength: 1, maxLength: 80 },
    },
  } as const;
}

function threadSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'urgency'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 160 },
      urgency: { type: 'integer', minimum: 0, maximum: 100 },
    },
  } as const;
}

function parseThreadArray(value: unknown, maxItems: number): Result<ThreadProposal[], string[]> {
  if (!Array.isArray(value) || value.length > maxItems) return invalid('Creative thread proposals are invalid.');
  const result: ThreadProposal[] = [];
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyKeys(item, ['title', 'urgency'])) return invalid('Creative thread proposal is invalid.');
    if (!boundedText(item.title, 1, 240) || !integerBetween(item.urgency, 0, 100)) return invalid('Creative thread proposal is invalid.');
    result.push({ title: item.title, urgency: item.urgency });
  }
  return { ok: true, value: result };
}

function hasOnlyKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value);
  const allowed = new Set(expected);
  return expected.every((key) => actual.includes(key)) && actual.every((key) => allowed.has(key));
}

function stringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => boundedText(item, 1, maxLength));
}

function boundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}

function integerBetween(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function isPlaceholderDurableFact(value: string): boolean {
  const normalized = semanticText(value);
  return /^branch [abc]\b/u.test(normalized)
    || /\bcreates? (a )?(distinct )?(immediate )?consequence\b/u.test(normalized)
    || /\bdurable (branch )?effect\b/u.test(normalized);
}

function hasMateriallySimilarPair(values: string[], threshold: number): boolean {
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      const leftTokens = new Set(semanticTokens(values[left]!));
      const rightTokens = new Set(semanticTokens(values[right]!));
      const union = new Set([...leftTokens, ...rightTokens]);
      if (union.size === 0) return true;
      let intersection = 0;
      for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
      if (intersection / union.size >= threshold) return true;
    }
  }
  return false;
}

function semanticText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function semanticTokens(value: string): string[] {
  const stopwords = new Set(['a', 'an', 'and', 'the', 'to', 'of', 'in', 'on', 'for', 'with', 'và', 'là', 'của', 'cho', 'trong', 'một', 'đã', 'sẽ']);
  return semanticText(value).split(' ').filter((token) => token.length >= 3 && !stopwords.has(token));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid<T>(message: string): Result<T, string[]> {
  return { ok: false, error: [message] };
}
