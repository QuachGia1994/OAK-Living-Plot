import type { ChoiceStateDelta, RelationshipDelta, SceneProposal, ThreadProposal } from '../ai/contracts';
import { normalizeDramaStateSemantics, semanticTextKey, type DramaState, type FactState, type RelationshipState, type ThreadState } from '../domain/drama-state';

export type StateApplicationResult =
  | { ok: true; value: DramaState }
  | { ok: false; error: string };

export function applyCommittedChoiceState(
  current: DramaState,
  sceneId: string,
  choiceId: string,
  scene: Pick<SceneProposal, 'establishedFacts' | 'threadChanges'>,
  delta: ChoiceStateDelta,
): StateApplicationResult {
  const state = cloneState(current);

  const sceneThreadResolution = resolveThreads(state.openThreads, scene.threadChanges.resolve);
  if (!sceneThreadResolution.ok) return sceneThreadResolution;
  state.openThreads = sceneThreadResolution.value;
  state.openThreads = appendUniqueThreads(state.openThreads, createThreads(`scene:${sceneId}:thread`, scene.threadChanges.open));
  state.facts = appendUniqueFacts(state.facts, createFacts(`scene:${sceneId}:fact`, scene.establishedFacts));

  for (const relationshipDelta of delta.relationships) {
    const result = applyRelationshipDelta(state.relationships, relationshipDelta);
    if (!result.ok) return result;
  }

  const factResolution = resolveFacts(state.facts, delta.factKeysToResolve);
  if (!factResolution.ok) return factResolution;
  state.facts = factResolution.value;
  state.facts = appendUniqueFacts(state.facts, createFacts(`choice:${choiceId}:fact`, delta.factsToAdd));

  const threadResolution = resolveThreads(state.openThreads, delta.threadKeysToResolve);
  if (!threadResolution.ok) return threadResolution;
  state.openThreads = threadResolution.value;
  state.openThreads = appendUniqueThreads(state.openThreads, createThreads(`choice:${choiceId}:thread`, delta.threadsToOpen));
  state.tone = delta.nextTone;

  const duplicate = findDuplicateStateKey(state);
  if (duplicate) return { ok: false, error: duplicate };
  return { ok: true, value: state };
}

function cloneState(state: DramaState): DramaState {
  return normalizeDramaStateSemantics(state);
}

function applyRelationshipDelta(
  relationships: RelationshipState[],
  delta: RelationshipDelta,
): { ok: true } | { ok: false; error: string } {
  if (!delta.fromKey.trim() || !delta.toKey.trim() || delta.fromKey === delta.toKey) {
    return { ok: false, error: 'Choice relationship reference is invalid.' };
  }

  let relation = relationships.find(
    (item) => item.fromKey === delta.fromKey && item.toKey === delta.toKey,
  );
  if (!relation) {
    relation = {
      fromKey: delta.fromKey,
      toKey: delta.toKey,
      affinity: 0,
      trust: 0,
      tension: 0,
      status: '',
    };
    relationships.push(relation);
  }

  const affinity = relation.affinity + delta.affinityDelta;
  const trust = relation.trust + delta.trustDelta;
  const tension = relation.tension + delta.tensionDelta;
  if (!inRange(affinity, -100, 100) || !inRange(trust, -100, 100) || !inRange(tension, 0, 100)) {
    return { ok: false, error: 'Choice relationship delta exceeds canonical bounds.' };
  }

  relation.affinity = affinity;
  relation.trust = trust;
  relation.tension = tension;
  relation.status = delta.statusText;
  return { ok: true };
}

function resolveFacts(facts: FactState[], keys: string[]): { ok: true; value: FactState[] } | { ok: false; error: string } {
  const existing = new Set(facts.map((item) => item.key));
  for (const key of keys) {
    if (!existing.has(key)) return { ok: false, error: `Unknown fact key during commit: ${key}` };
  }
  const resolved = new Set(keys);
  return { ok: true, value: facts.filter((item) => !resolved.has(item.key)) };
}

function resolveThreads(
  threads: ThreadState[],
  keys: string[],
): { ok: true; value: ThreadState[] } | { ok: false; error: string } {
  const existing = new Set(threads.map((item) => item.key));
  for (const key of keys) {
    if (!existing.has(key)) return { ok: false, error: `Unknown thread key during commit: ${key}` };
  }
  const resolved = new Set(keys);
  return { ok: true, value: threads.filter((item) => !resolved.has(item.key)) };
}

function createFacts(prefix: string, texts: string[]): FactState[] {
  return texts.map((text, index) => ({ key: `${prefix}:${index + 1}`, text }));
}

function createThreads(prefix: string, threads: ThreadProposal[]): ThreadState[] {
  return threads.map((thread, index) => ({
    key: `${prefix}:${index + 1}`,
    title: thread.title,
    urgency: thread.urgency,
  }));
}

function appendUniqueFacts(current: FactState[], incoming: FactState[]): FactState[] {
  return appendUniqueByText(current, incoming, (item) => item.text);
}

function appendUniqueThreads(current: ThreadState[], incoming: ThreadState[]): ThreadState[] {
  return appendUniqueByText(current, incoming, (item) => item.title);
}

function appendUniqueByText<T>(current: T[], incoming: T[], textOf: (value: T) => string): T[] {
  const seen = new Set(current.map((item) => semanticTextKey(textOf(item))));
  const result = [...current];
  for (const item of incoming) {
    const key = semanticTextKey(textOf(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function findDuplicateStateKey(state: DramaState): string | null {
  const relationshipKeys = state.relationships.map((item) => `${item.fromKey}\u0000${item.toKey}`);
  if (new Set(relationshipKeys).size !== relationshipKeys.length) return 'Duplicate canonical relationship key.';
  const factKeys = state.facts.map((item) => item.key);
  if (new Set(factKeys).size !== factKeys.length) return 'Duplicate canonical fact key.';
  const threadKeys = state.openThreads.map((item) => item.key);
  if (new Set(threadKeys).size !== threadKeys.length) return 'Duplicate canonical thread key.';
  return null;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
