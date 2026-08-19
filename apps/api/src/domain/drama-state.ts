export type ChoicePosition = 1 | 2 | 3;

export interface RelationshipState {
  fromKey: string;
  toKey: string;
  affinity: number;
  trust: number;
  tension: number;
  status: string;
}

export interface FactState {
  key: string;
  text: string;
}

export interface ThreadState {
  key: string;
  title: string;
  urgency: number;
}

export interface DramaState {
  schemaVersion: 2;
  relationships: RelationshipState[];
  facts: FactState[];
  openThreads: ThreadState[];
  tone: string;
}

export interface SceneChoiceContract {
  id: string;
  position: ChoicePosition;
  label: string;
}

export class DomainInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainInvariantError';
  }
}

export function createInitialDramaState(): DramaState {
  return {
    schemaVersion: 2,
    relationships: [],
    facts: [],
    openThreads: [],
    tone: 'neutral',
  };
}

export function normalizeDramaStateSemantics(state: DramaState): DramaState {
  return {
    schemaVersion: 2,
    relationships: state.relationships.map((item) => ({ ...item })),
    facts: dedupeSemantic(state.facts, (item) => item.text),
    openThreads: dedupeSemantic(state.openThreads, (item) => item.title),
    tone: state.tone,
  };
}

export function requireThreeChoices<T extends Pick<SceneChoiceContract, 'position' | 'label'>>(
  choices: readonly T[],
): readonly [T, T, T] {
  if (choices.length !== 3) {
    throw new DomainInvariantError('A scene must have exactly three choices.');
  }

  const positions = new Set(choices.map((choice) => choice.position));
  const labelsAreValid = choices.every((choice) => choice.label.trim().length > 0);
  if (positions.size !== 3 || !positions.has(1) || !positions.has(2) || !positions.has(3)) {
    throw new DomainInvariantError('Scene choices must use positions 1, 2, and 3 exactly once.');
  }
  if (!labelsAreValid) {
    throw new DomainInvariantError('Scene choice labels cannot be blank.');
  }

  return [choices[0], choices[1], choices[2]];
}

export function parseDramaState(raw: string): DramaState {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new DomainInvariantError('Invalid drama state.');

  if (value.schemaVersion === 2) return parseStateV2(value);
  return upgradeLegacyState(value);
}

function parseStateV2(value: Record<string, unknown>): DramaState {
  if (!Array.isArray(value.relationships) || !Array.isArray(value.facts) || !Array.isArray(value.openThreads)) {
    throw new DomainInvariantError('Invalid drama state collections.');
  }
  const relationships = value.relationships.map(parseRelationshipState);
  const facts = value.facts.map(parseFactState);
  const openThreads = value.openThreads.map(parseThreadState);
  const tone = requireText(value.tone, 'Invalid drama tone state.');

  ensureUnique(relationships.map((item) => `${item.fromKey}\u0000${item.toKey}`), 'Duplicate relationship state.');
  ensureUnique(facts.map((item) => item.key), 'Duplicate fact key.');
  ensureUnique(openThreads.map((item) => item.key), 'Duplicate thread key.');

  return { schemaVersion: 2, relationships, facts, openThreads, tone };
}

function upgradeLegacyState(value: Record<string, unknown>): DramaState {
  if (!isRelationshipMap(value.relationships) || !isStringArray(value.facts) || !isStringArray(value.openThreads)) {
    throw new DomainInvariantError('Invalid legacy plot state.');
  }
  const tone = requireText(value.tone, 'Invalid drama tone state.');
  const relationships = Object.entries(value.relationships).map(([key, score]) => ({
    fromKey: 'legacy',
    toKey: key,
    affinity: score,
    trust: 0,
    tension: 0,
    status: 'legacy',
  }));
  const facts = value.facts.map((text, index) => ({ key: `legacy-fact-${index + 1}`, text }));
  const openThreads = value.openThreads.map((title, index) => ({
    key: `legacy-thread-${index + 1}`,
    title,
    urgency: 50,
  }));
  return { schemaVersion: 2, relationships, facts, openThreads, tone };
}

function parseRelationshipState(value: unknown): RelationshipState {
  if (!isRecord(value)) throw new DomainInvariantError('Invalid relationship state.');
  const fromKey = requireText(value.fromKey, 'Invalid relationship source.');
  const toKey = requireText(value.toKey, 'Invalid relationship target.');
  if (fromKey === toKey) throw new DomainInvariantError('Relationship endpoints must differ.');
  const affinity = requireInteger(value.affinity, -100, 100, 'Invalid relationship affinity.');
  const trust = requireInteger(value.trust, -100, 100, 'Invalid relationship trust.');
  const tension = requireInteger(value.tension, 0, 100, 'Invalid relationship tension.');
  const status = typeof value.status === 'string' ? value.status : '';
  return { fromKey, toKey, affinity, trust, tension, status };
}

function parseFactState(value: unknown): FactState {
  if (!isRecord(value)) throw new DomainInvariantError('Invalid fact state.');
  return {
    key: requireText(value.key, 'Invalid fact key.'),
    text: requireText(value.text, 'Invalid fact text.'),
  };
}

function parseThreadState(value: unknown): ThreadState {
  if (!isRecord(value)) throw new DomainInvariantError('Invalid thread state.');
  return {
    key: requireText(value.key, 'Invalid thread key.'),
    title: requireText(value.title, 'Invalid thread title.'),
    urgency: requireInteger(value.urgency, 0, 100, 'Invalid thread urgency.'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRelationshipMap(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (score) => typeof score === 'number' && Number.isFinite(score) && score >= -100 && score <= 100,
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new DomainInvariantError(message);
  return value;
}

function requireInteger(value: unknown, min: number, max: number, message: string): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new DomainInvariantError(message);
  return Number(value);
}

function ensureUnique(values: string[], message: string): void {
  if (new Set(values).size !== values.length) throw new DomainInvariantError(message);
}

function dedupeSemantic<T extends object>(items: T[], textOf: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = semanticTextKey(textOf(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item });
  }
  return result;
}

export function semanticTextKey(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
}
