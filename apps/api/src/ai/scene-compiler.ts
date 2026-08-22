import { semanticTextKey } from '../domain/drama-state';
import type { SceneGenerationInput, SceneProposal } from './contracts';
import type { CreativeSceneProposal } from './creative-scene-schema';

/**
 * Compiles provider-authored creative text into the canonical SceneProposal contract.
 * This function may canonicalize exact references, but never invents narrative facts or relationship movement.
 */
export function compileCreativeScene(input: SceneGenerationInput, creative: CreativeSceneProposal): SceneProposal {
  const factKeyByText = exactKeyMap(input.activeFacts, (item) => item.text, (item) => item.key);
  const threadKeyByTitle = exactKeyMap(input.openThreads, (item) => item.title, (item) => item.key);
  const resolvedFacts = new Set((input.resolvedMemory?.facts ?? []).map(semanticTextKey));
  const resolvedThreads = new Set((input.resolvedMemory?.threads ?? []).map(semanticTextKey));

  const sceneResolvedThreadKeys = resolveExactKeys(creative.threadTitlesToResolve, threadKeyByTitle);
  const choices = creative.choices.map((choice) => ({
    key: choice.key,
    label: choice.label.trim(),
    intent: choice.intent.trim(),
    consequence: choice.consequence.trim(),
    stateDelta: {
      relationships: [],
      // Durable branch commitment comes directly from provider-authored text. Exact resolved tombstones are never resurrected.
      factsToAdd: resolvedFacts.has(semanticTextKey(choice.durableFact)) ? [] : [choice.durableFact.trim()],
      factKeysToResolve: resolveExactKeys(choice.factTextsToResolve, factKeyByText),
      threadsToOpen: uniqueThreads(choice.threadsToOpen, resolvedThreads),
      threadKeysToResolve: resolveExactKeys(choice.threadTitlesToResolve, threadKeyByTitle),
      nextTone: choice.nextTone.trim(),
    },
  }));
  return {
    title: creative.title.trim(),
    script: creative.script.trim(),
    summary: creative.summary.trim(),
    beat: creative.beat,
    pacingRole: creative.pacingRole,
    establishedFacts: uniqueTexts(creative.establishedFacts, resolvedFacts),
    threadChanges: {
      open: uniqueThreads(creative.threadsToOpen, resolvedThreads),
      resolve: sceneResolvedThreadKeys,
    },
    choices: [choices[0], choices[1], choices[2]],
  };
}

function exactKeyMap<T>(items: T[], textOf: (item: T) => string, keyOf: (item: T) => string): Map<string, string> {
  const map = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const item of items) {
    const normalized = semanticTextKey(textOf(item));
    if (!normalized) continue;
    if (map.has(normalized)) {
      ambiguous.add(normalized);
      map.delete(normalized);
      continue;
    }
    if (!ambiguous.has(normalized)) map.set(normalized, keyOf(item));
  }
  return map;
}

function resolveExactKeys(values: string[], keyByText: Map<string, string>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = keyByText.get(semanticTextKey(value));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function uniqueTexts(values: string[], excluded: Set<string> = new Set()): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = semanticTextKey(trimmed);
    if (!key || seen.has(key) || excluded.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function uniqueThreads(
  values: Array<{ title: string; urgency: number }>,
  excluded: Set<string> = new Set(),
): Array<{ title: string; urgency: number }> {
  const seen = new Set<string>();
  const result: Array<{ title: string; urgency: number }> = [];
  for (const value of values) {
    const title = value.title.trim();
    const key = semanticTextKey(title);
    if (!key || seen.has(key) || excluded.has(key)) continue;
    seen.add(key);
    result.push({ title, urgency: value.urgency });
  }
  return result;
}
