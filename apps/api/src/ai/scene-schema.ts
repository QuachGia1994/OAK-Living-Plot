import type {
  SceneChoiceProposal,
  SceneGenerationInput,
  SceneProposal,
  RelationshipDelta,
  Result,
  ThreadProposal,
} from './contracts';

export const sceneResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'script', 'summary', 'establishedFacts', 'threadChanges', 'choices'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 80 },
    script: { type: 'string', minLength: 600, maxLength: 2400 },
    summary: { type: 'string', minLength: 1, maxLength: 240 },
    establishedFacts: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 160 } },
    threadChanges: {
      type: 'object',
      additionalProperties: false,
      required: ['open', 'resolve'],
      properties: {
        open: { type: 'array', maxItems: 4, items: threadSchema() },
        resolve: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 120 } },
      },
    },
    choices: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: choiceSchema(),
    },
  },
} as const;

export function parseAndValidateSceneProposal(
  raw: string,
  input: SceneGenerationInput,
): Result<SceneProposal, string[]> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: ['Response is not valid JSON.'] };
  }

  const structural = parseProposal(value);
  if (!structural.ok) return structural;

  const errors = validateBusinessRules(structural.value, input);
  return errors.length === 0 ? structural : { ok: false, error: errors };
}

function parseProposal(value: unknown): Result<SceneProposal, string[]> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['title', 'script', 'summary', 'establishedFacts', 'threadChanges', 'choices'], ['beat'])) {
    return invalid('Scene proposal has an invalid top-level shape.');
  }
  if (!isBoundedText(value.title, 1, 120) || !isBoundedText(value.script, 1, 6000) || !isBoundedText(value.summary, 1, 800)) {
    return invalid('Scene title, script, or summary is invalid.');
  }
  if (!isStringArray(value.establishedFacts, 8, 400)) return invalid('Established facts are invalid.');
  if (!isRecord(value.threadChanges) || !hasOnlyKeys(value.threadChanges, ['open', 'resolve'])) {
    return invalid('Thread changes are invalid.');
  }
  const openThreads = parseThreadArray(value.threadChanges.open, 4);
  if (!openThreads.ok) return openThreads;
  if (!isStringArray(value.threadChanges.resolve, 4, 120)) return invalid('Resolved thread keys are invalid.');
  if (!Array.isArray(value.choices) || value.choices.length !== 3) return invalid('Exactly three choices are required.');

  const choices: SceneChoiceProposal[] = [];
  for (const choice of value.choices) {
    const parsed = parseChoice(choice);
    if (!parsed.ok) return parsed;
    choices.push(parsed.value);
  }

  return {
    ok: true,
    value: {
      title: value.title,
      script: value.script,
      summary: value.summary,
      ...(typeof value.beat === 'string' ? { beat: value.beat } : {}),
      establishedFacts: value.establishedFacts,
      threadChanges: { open: openThreads.value, resolve: value.threadChanges.resolve },
      choices: [choices[0], choices[1], choices[2]],
    },
  };
}

function parseChoice(value: unknown): Result<SceneChoiceProposal, string[]> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['key', 'label', 'intent', 'consequence', 'stateDelta'])) {
    return invalid('Choice shape is invalid.');
  }
  if (!['A', 'B', 'C'].includes(String(value.key))) return invalid('Choice key is invalid.');
  if (!isBoundedText(value.label, 1, 240) || !isBoundedText(value.intent, 1, 240) || !isBoundedText(value.consequence, 1, 500)) {
    return invalid('Choice text is invalid.');
  }
  const stateDelta = parseStateDelta(value.stateDelta);
  if (!stateDelta.ok) return stateDelta;

  return {
    ok: true,
    value: {
      key: value.key as 'A' | 'B' | 'C',
      label: value.label,
      intent: value.intent,
      consequence: value.consequence,
      stateDelta: stateDelta.value,
    },
  };
}

function parseStateDelta(value: unknown): Result<SceneChoiceProposal['stateDelta'], string[]> {
  const keys = ['relationships', 'factsToAdd', 'factKeysToResolve', 'threadsToOpen', 'threadKeysToResolve', 'nextTone'];
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return invalid('Choice state delta is invalid.');
  if (!Array.isArray(value.relationships) || value.relationships.length > 8) return invalid('Relationship deltas are invalid.');

  const relationships: RelationshipDelta[] = [];
  for (const relation of value.relationships) {
    const parsed = parseRelationshipDelta(relation);
    if (!parsed.ok) return parsed;
    relationships.push(parsed.value);
  }
  if (!isStringArray(value.factsToAdd, 6, 400) || !isStringArray(value.factKeysToResolve, 6, 120)) {
    return invalid('Fact deltas are invalid.');
  }
  const threadsToOpen = parseThreadArray(value.threadsToOpen, 4);
  if (!threadsToOpen.ok) return threadsToOpen;
  if (!isStringArray(value.threadKeysToResolve, 4, 120) || !isBoundedText(value.nextTone, 1, 80)) {
    return invalid('Thread or tone delta is invalid.');
  }

  return {
    ok: true,
    value: {
      relationships,
      factsToAdd: value.factsToAdd,
      factKeysToResolve: value.factKeysToResolve,
      threadsToOpen: threadsToOpen.value,
      threadKeysToResolve: value.threadKeysToResolve,
      nextTone: value.nextTone,
    },
  };
}

function parseRelationshipDelta(value: unknown): Result<RelationshipDelta, string[]> {
  const keys = ['fromKey', 'toKey', 'affinityDelta', 'trustDelta', 'tensionDelta', 'statusText'];
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return invalid('Relationship delta shape is invalid.');
  if (!isBoundedText(value.fromKey, 1, 80) || !isBoundedText(value.toKey, 1, 80) || !isBoundedText(value.statusText, 0, 160)) {
    return invalid('Relationship references are invalid.');
  }
  if (!isIntegerBetween(value.affinityDelta, -20, 20) || !isIntegerBetween(value.trustDelta, -20, 20) || !isIntegerBetween(value.tensionDelta, -20, 20)) {
    return invalid('Relationship deltas exceed allowed bounds.');
  }
  return { ok: true, value: value as unknown as RelationshipDelta };
}

function validateBusinessRules(proposal: SceneProposal, input: SceneGenerationInput): string[] {
  const errors: string[] = [];
  const characterKeys = new Set(input.characters.map((character) => character.key));
  const factKeys = new Set(input.activeFacts.map((fact) => fact.key));
  const threadKeys = new Set(input.openThreads.map((thread) => thread.key));

  const choiceKeys = proposal.choices.map((choice) => choice.key);
  if (choiceKeys.join(',') !== 'A,B,C') errors.push('Choices must be ordered and keyed A, B, C exactly once.');
  if (new Set(proposal.choices.map((choice) => normalize(choice.label))).size !== 3) errors.push('Choice labels must be materially distinct.');
  if (new Set(proposal.choices.map((choice) => normalize(choice.intent))).size !== 3) errors.push('Choice intents must be materially distinct.');
  if (hasMateriallySimilarPair(proposal.choices.map((choice) => choice.label), 0.78, 3)) {
    errors.push('Choice labels must represent materially distinct actions.');
  }
  if (hasMateriallySimilarPair(proposal.choices.map((choice) => choice.intent), 0.76, 3)) {
    errors.push('Choice intents must be materially distinct intents.');
  }
  if (hasMateriallySimilarPair(proposal.choices.map((choice) => choice.consequence), 0.72, 5)) {
    errors.push('Choice consequences must create materially distinct consequences.');
  }

  if (input.previous) {
    const previousSummary = semanticText(input.previous.sceneSummary);
    const nextSummary = semanticText(proposal.summary);
    if (previousSummary.length >= 20 && (nextSummary.includes(previousSummary) || previousSummary.includes(nextSummary))) {
      errors.push('Continuation summary must materially advance beyond the previous scene summary.');
    }
    const previousAction = semanticText(input.previous.chosenAction);
    if (proposal.choices.some((choice) => semanticText(choice.label) === previousAction)) {
      errors.push('Continuation choices must not repeat the previously committed action.');
    }
  }

  validateRecentNovelty(proposal, input, errors);

  const existingThreadTitles = new Set(input.openThreads.map((thread) => semanticText(thread.title)));
  for (const thread of proposal.threadChanges.open) {
    if (existingThreadTitles.has(semanticText(thread.title))) errors.push('Scene must not reopen an already active thread with the same title.');
  }

  const wordCount = proposal.script.trim().split(/\s+/u).filter(Boolean).length;
  if (wordCount < 100 || wordCount > 300) errors.push('Scene script must stay within the Phase 1 spoken-length envelope.');

  for (const key of proposal.threadChanges.resolve) {
    if (!threadKeys.has(key)) errors.push(`Unknown thread key in threadChanges.resolve: ${key}`);
  }
  for (const choice of proposal.choices) validateChoice(choice, input, characterKeys, factKeys, threadKeys, errors);
  return errors;
}

function validateChoice(
  choice: SceneChoiceProposal,
  input: SceneGenerationInput,
  characterKeys: Set<string>,
  factKeys: Set<string>,
  threadKeys: Set<string>,
  errors: string[],
): void {
  for (const relation of choice.stateDelta.relationships) {
    if (!characterKeys.has(relation.fromKey) || !characterKeys.has(relation.toKey) || relation.fromKey === relation.toKey) {
      errors.push(`Choice ${choice.key} references an invalid relationship.`);
      continue;
    }
    const current = input.relationships.find(
      (item) => item.fromKey === relation.fromKey && item.toKey === relation.toKey,
    );
    const affinity = (current?.affinity ?? 0) + relation.affinityDelta;
    const trust = (current?.trust ?? 0) + relation.trustDelta;
    const tension = (current?.tension ?? 0) + relation.tensionDelta;
    if (affinity < -100 || affinity > 100 || trust < -100 || trust > 100 || tension < 0 || tension > 100) {
      errors.push(`Choice ${choice.key} would move a relationship outside canonical bounds.`);
    }
  }
  for (const key of choice.stateDelta.factKeysToResolve) {
    if (!factKeys.has(key)) errors.push(`Choice ${choice.key} references unknown fact key: ${key}`);
  }
  for (const key of choice.stateDelta.threadKeysToResolve) {
    if (!threadKeys.has(key)) errors.push(`Choice ${choice.key} references unknown thread key: ${key}`);
  }
}

function validateRecentNovelty(proposal: SceneProposal, input: SceneGenerationInput, errors: string[]): void {
  if (input.recentHistory.length === 0) return;

  const historicalTitles = input.recentHistory.map((scene) => scene.title);
  if (historicalTitles.some((title) => materiallySimilar(proposal.title, title, 0.8, 3))) {
    errors.push('Scene title is too similar to recent history.');
  }

  const historicalSummaries = input.recentHistory.map((scene) => scene.summary);
  if (historicalSummaries.some((summary) => materiallySimilar(proposal.summary, summary, 0.72, 7))) {
    errors.push('Scene summary is too similar to recent history.');
  }

  const historicalChoices = input.recentHistory.flatMap((scene) => [
    ...scene.choiceLabels,
    ...(scene.committedChoice ? [scene.committedChoice] : []),
  ]);
  if (proposal.choices.some((choice) => historicalChoices.some((prior) => materiallySimilar(choice.label, prior, 0.78, 3)))) {
    errors.push('Scene choices must introduce new actions instead of recycling recent choices.');
  }

  const historicalIntents = input.recentHistory.flatMap((scene) => scene.choiceIntent ? [scene.choiceIntent] : []);
  if (proposal.choices.some((choice) => historicalIntents.some((prior) => materiallySimilar(choice.intent, prior, 0.76, 3)))) {
    errors.push('Scene choices must introduce new motives instead of recycling recent choice intent.');
  }

  const historicalConsequences = input.recentHistory.flatMap((scene) => scene.consequence ? [scene.consequence] : []);
  if (proposal.choices.some((choice) => historicalConsequences.some((prior) => materiallySimilar(choice.consequence, prior, 0.72, 5)))) {
    errors.push('Choice consequences must open new outcomes instead of repeating recent consequences.');
  }
}

function choiceSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['key', 'label', 'intent', 'consequence', 'stateDelta'],
    properties: {
      key: { type: 'string', enum: ['A', 'B', 'C'] },
      label: { type: 'string', minLength: 1, maxLength: 120 },
      intent: { type: 'string', minLength: 1, maxLength: 120 },
      consequence: { type: 'string', minLength: 1, maxLength: 240 },
      stateDelta: {
        type: 'object',
        additionalProperties: false,
        required: ['relationships', 'factsToAdd', 'factKeysToResolve', 'threadsToOpen', 'threadKeysToResolve', 'nextTone'],
        properties: {
          relationships: { type: 'array', maxItems: 8, items: relationshipSchema() },
          factsToAdd: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 160 } },
          factKeysToResolve: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 120 } },
          threadsToOpen: { type: 'array', maxItems: 4, items: threadSchema() },
          threadKeysToResolve: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 120 } },
          nextTone: { type: 'string', minLength: 1, maxLength: 80 },
        },
      },
    },
  } as const;
}

function relationshipSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['fromKey', 'toKey', 'affinityDelta', 'trustDelta', 'tensionDelta', 'statusText'],
    properties: {
      fromKey: { type: 'string' },
      toKey: { type: 'string' },
      affinityDelta: { type: 'integer', minimum: -20, maximum: 20 },
      trustDelta: { type: 'integer', minimum: -20, maximum: 20 },
      tensionDelta: { type: 'integer', minimum: -20, maximum: 20 },
      statusText: { type: 'string' },
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
  if (!Array.isArray(value) || value.length > maxItems) return invalid('Thread proposals are invalid.');
  const result: ThreadProposal[] = [];
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyKeys(item, ['title', 'urgency']) || !isBoundedText(item.title, 1, 240) || !isIntegerBetween(item.urgency, 0, 100)) {
      return invalid('Thread proposal is invalid.');
    }
    result.push({ title: item.title, urgency: item.urgency });
  }
  return { ok: true, value: result };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: string[], optional: string[] = []): boolean {
  const actual = Object.keys(value);
  const allowed = new Set([...expected, ...optional]);
  if (!expected.every((key) => actual.includes(key))) return false;
  return actual.every((key) => allowed.has(key));
}

function isBoundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}

function isStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => isBoundedText(item, 1, maxLength));
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function semanticText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function hasMateriallySimilarPair(values: string[], threshold: number, minTokens: number): boolean {
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (materiallySimilar(values[left], values[right], threshold, minTokens)) return true;
    }
  }
  return false;
}

function materiallySimilar(left: string, right: string, threshold: number, minTokens: number): boolean {
  const leftTokens = semanticTokens(left);
  const rightTokens = semanticTokens(right);
  if (leftTokens.length < minTokens || rightTokens.length < minTokens) {
    return semanticText(left) === semanticText(right);
  }
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let intersection = 0;
  for (const token of leftSet) if (rightSet.has(token)) intersection += 1;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union > 0 && intersection / union >= threshold;
}

function semanticTokens(value: string): string[] {
  return semanticText(value).split(' ').filter((token) => token.length >= 2);
}

function invalid<T>(message: string): Result<T, string[]> {
  return { ok: false, error: [message] };
}
