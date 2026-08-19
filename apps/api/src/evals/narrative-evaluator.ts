import type { SceneGenerationInput, SceneProposal } from '../ai/contracts';
import { parseAndValidateSceneProposal } from '../ai/scene-schema';
import {
  deriveTrajectoryConstraints,
  excludedBeatsFromHistory,
  isNarrativeBeat,
  scoreLongRangeNovelty,
  scoreStructuralVariety,
  scoreTrajectoryDiversity,
  type NarrativeBeat,
  type SceneMotifSignature,
  type TrajectoryConstraint,
} from './narrative-novelty';

export type NarrativeEvalDimension =
  | 'continuity'
  | 'threadMomentum'
  | 'branchDistinctness'
  | 'consequenceSpecificity'
  | 'repetitionControl'
  | 'characterConsistency'
  | 'localeAlignment'
  | 'sceneProgression'
  | 'trajectoryDiversity'
  | 'structuralVariety'
  | 'longRangeNovelty';

export interface NarrativeEvalFinding {
  dimension: NarrativeEvalDimension | 'structure';
  code: string;
  message: string;
}

export interface NarrativeEvalReport {
  passed: boolean;
  score: number;
  dimensions: Record<NarrativeEvalDimension, number>;
  findings: NarrativeEvalFinding[];
}

const DIMENSIONS: NarrativeEvalDimension[] = [
  'continuity',
  'threadMomentum',
  'branchDistinctness',
  'consequenceSpecificity',
  'repetitionControl',
  'characterConsistency',
  'localeAlignment',
  'sceneProgression',
  'trajectoryDiversity',
  'structuralVariety',
  'longRangeNovelty',
];

/** Hard floors for novelty dimensions when novelty constraints are present. */
const NOVELTY_HARD_MINIMUM = 60;

export function evaluateNarrative(
  input: SceneGenerationInput,
  proposal: SceneProposal,
): NarrativeEvalReport {
  const structural = parseAndValidateSceneProposal(JSON.stringify(proposal), input);
  if (!structural.ok) {
    return {
      passed: false,
      score: 0,
      dimensions: emptyDimensions(),
      findings: structural.error.map((message) => ({
        dimension: 'structure',
        code: 'STRUCTURAL_OR_CANONICAL_FAILURE',
        message,
      })),
    };
  }

  const findings: NarrativeEvalFinding[] = [];
  const novelty = resolveNoveltyConstraints(input);
  const dimensions = {
    continuity: scoreContinuity(input, proposal, findings),
    threadMomentum: scoreThreadMomentum(input, proposal, findings),
    branchDistinctness: scoreBranchDistinctness(proposal, findings),
    consequenceSpecificity: scoreConsequences(proposal, findings),
    repetitionControl: scoreRepetition(proposal, findings),
    characterConsistency: scoreCharacterConsistency(input, proposal, findings),
    localeAlignment: scoreLocaleAlignment(input, proposal, findings),
    sceneProgression: scoreSceneProgression(proposal, findings),
    trajectoryDiversity: scoreTrajectoryDiversity(proposal, novelty.trajectoryConstraints, findings),
    structuralVariety: scoreStructuralVariety(proposal, novelty.excludedBeats, findings, novelty.requireBeat),
    longRangeNovelty: scoreLongRangeNovelty(proposal, novelty.motifHistory, findings),
  };
  const score = Math.round(DIMENSIONS.reduce((sum, key) => sum + dimensions[key], 0) / DIMENSIONS.length);
  const passed = score >= 80
    && DIMENSIONS.every((key) => dimensions[key] >= 60)
    && dimensions.trajectoryDiversity >= NOVELTY_HARD_MINIMUM
    && dimensions.structuralVariety >= NOVELTY_HARD_MINIMUM
    && dimensions.longRangeNovelty >= NOVELTY_HARD_MINIMUM;
  return { passed, score, dimensions, findings };
}

function scoreContinuity(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: NarrativeEvalFinding[],
): number {
  if (!input.previous) return 100;
  const firstThird = firstThirdText(proposal.script);
  const consequenceOverlap = tokenOverlap(input.previous.consequence, firstThird);
  const chosenActionOverlap = tokenOverlap(input.previous.chosenAction, `${firstThird} ${proposal.summary}`);
  let score = 100;
  if (consequenceOverlap < 0.3) {
    score -= 50;
    findings.push({
      dimension: 'continuity',
      code: 'PREVIOUS_CONSEQUENCE_NOT_VISIBLE_EARLY',
      message: 'The previous committed consequence is not materially visible in the first third of the scene.',
    });
  }
  if (chosenActionOverlap < 0.2) {
    score -= 20;
    findings.push({
      dimension: 'continuity',
      code: 'COMMITTED_ACTION_WEAKLY_REFLECTED',
      message: 'The committed action is weakly reflected in the scene opening or summary.',
    });
  }
  return clampScore(score);
}

function scoreThreadMomentum(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: NarrativeEvalFinding[],
): number {
  if (input.openThreads.length === 0) return 100;
  const resolved = new Set([
    ...proposal.threadChanges.resolve,
    ...proposal.choices.flatMap((choice) => choice.stateDelta.threadKeysToResolve),
  ]);
  if (input.openThreads.some((thread) => resolved.has(thread.key))) return 100;

  const storyText = [
    proposal.script,
    proposal.summary,
    ...proposal.threadChanges.open.map((thread) => thread.title),
    ...proposal.choices.flatMap((choice) => choice.stateDelta.threadsToOpen.map((thread) => thread.title)),
  ].join(' ');
  const strongestOverlap = Math.max(...input.openThreads.map((thread) => tokenOverlap(thread.title, storyText)));
  if (strongestOverlap >= 0.35) return 90;
  if (strongestOverlap >= 0.2) return 70;

  findings.push({
    dimension: 'threadMomentum',
    code: 'NO_OPEN_THREAD_ADVANCED',
    message: 'No existing open thread is resolved or materially reflected in the scene.',
  });
  return 40;
}

function scoreBranchDistinctness(
  proposal: SceneProposal,
  findings: NarrativeEvalFinding[],
): number {
  const labelSimilarity = maxPairwiseSimilarity(proposal.choices.map((choice) => choice.label));
  const intentSimilarity = maxPairwiseSimilarity(proposal.choices.map((choice) => choice.intent));
  const signatures = proposal.choices.map((choice) => stateDeltaSignature(choice.stateDelta));
  let score = 100;

  if (labelSimilarity >= 0.75 || intentSimilarity >= 0.75) {
    score -= 50;
    findings.push({
      dimension: 'branchDistinctness',
      code: 'CHOICES_SEMANTICALLY_NEAR_DUPLICATE',
      message: 'At least two choice labels or intents are too similar to feel like distinct branches.',
    });
  } else if (labelSimilarity >= 0.55 || intentSimilarity >= 0.55) {
    score -= 25;
  }
  if (new Set(signatures).size !== 3) {
    score -= 35;
    findings.push({
      dimension: 'branchDistinctness',
      code: 'CHOICE_STATE_DELTAS_NOT_DISTINCT',
      message: 'At least two choices lead to the same materialized state-delta signature.',
    });
  }
  return clampScore(score);
}

function scoreConsequences(proposal: SceneProposal, findings: NarrativeEvalFinding[]): number {
  const consequences = proposal.choices.map((choice) => choice.consequence);
  const similarity = maxPairwiseSimilarity(consequences);
  const shortCount = consequences.filter((text) => meaningfulTokens(text).length < 5).length;
  let score = 100;

  if (similarity >= 0.75) {
    score -= 45;
    findings.push({
      dimension: 'consequenceSpecificity',
      code: 'CONSEQUENCES_TOO_SIMILAR',
      message: 'Choice consequences are too similar to communicate branch-specific fallout.',
    });
  } else if (similarity >= 0.55) {
    score -= 20;
  }
  if (shortCount > 0) {
    score -= shortCount * 20;
    findings.push({
      dimension: 'consequenceSpecificity',
      code: 'CONSEQUENCE_TOO_GENERIC',
      message: 'At least one consequence is too short or generic to communicate immediate fallout.',
    });
  }
  return clampScore(score);
}

function scoreRepetition(proposal: SceneProposal, findings: NarrativeEvalFinding[]): number {
  const tokens = meaningfulTokens(proposal.script);
  if (tokens.length < 3) return 0;
  const trigrams: string[] = [];
  for (let index = 0; index <= tokens.length - 3; index += 1) {
    trigrams.push(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
  }
  const ratio = new Set(trigrams).size / Math.max(trigrams.length, 1);
  if (ratio >= 0.8) return 100;
  if (ratio >= 0.65) return 75;

  findings.push({
    dimension: 'repetitionControl',
    code: 'SCRIPT_EXCESSIVELY_REPETITIVE',
    message: 'The scene contains excessive repeated three-word sequences.',
  });
  return 40;
}

function scoreCharacterConsistency(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: NarrativeEvalFinding[],
): number {
  const protagonist = input.characters[0];
  if (!protagonist?.name.trim()) return 100;
  const storyText = [proposal.script, proposal.summary, ...proposal.choices.map((choice) => choice.label)].join(' ');
  if (containsPhrase(storyText, protagonist.name)) return 100;
  findings.push({
    dimension: 'characterConsistency',
    code: 'PROTAGONIST_NOT_ANCHORED',
    message: 'The scene does not name the canonical protagonist in the scene, summary, or branch labels.',
  });
  return 40;
}

function scoreLocaleAlignment(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: NarrativeEvalFinding[],
): number {
  const storyText = [proposal.script, proposal.summary, ...proposal.choices.flatMap((choice) => [choice.label, choice.consequence])].join(' ');
  if (input.locale.toLocaleLowerCase().startsWith('vi')) {
    const marks = storyText.match(/[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/giu)?.length ?? 0;
    if (marks >= 8) return 100;
    if (marks >= 3) return 70;
    findings.push({
      dimension: 'localeAlignment',
      code: 'VIETNAMESE_OUTPUT_NOT_VISIBLE',
      message: 'A Vietnamese scene contains too little Vietnamese-language signal to match the requested locale.',
    });
    return 30;
  }

  if (input.locale.toLocaleLowerCase().startsWith('en')) {
    const tokens = meaningfulTokens(storyText);
    if (tokens.length === 0) return 0;
    const asciiWords = tokens.filter((token) => /^[a-z0-9]+$/u.test(token)).length;
    const ratio = asciiWords / tokens.length;
    if (ratio >= 0.8) return 100;
    if (ratio >= 0.6) return 70;
    findings.push({
      dimension: 'localeAlignment',
      code: 'ENGLISH_OUTPUT_NOT_VISIBLE',
      message: 'An English scene contains too little English-language signal to match the requested locale.',
    });
    return 40;
  }
  return 100;
}

function scoreSceneProgression(proposal: SceneProposal, findings: NarrativeEvalFinding[]): number {
  const progresses = proposal.establishedFacts.length > 0 ||
    proposal.threadChanges.open.length > 0 ||
    proposal.threadChanges.resolve.length > 0;
  if (progresses) return 100;
  findings.push({
    dimension: 'sceneProgression',
    code: 'SCENE_ADDS_NO_CANONICAL_PROGRESS',
    message: 'The scene establishes no fact and opens or resolves no canonical thread before branching.',
  });
  return 40;
}

function firstThirdText(script: string): string {
  const tokens = script.trim().split(/\s+/u).filter(Boolean);
  return tokens.slice(0, Math.max(1, Math.ceil(tokens.length / 3))).join(' ');
}

function tokenOverlap(reference: string, candidate: string): number {
  const referenceTokens = new Set(meaningfulTokens(reference));
  if (referenceTokens.size === 0) return 1;
  const candidateTokens = new Set(meaningfulTokens(candidate));
  let matched = 0;
  for (const token of referenceTokens) if (candidateTokens.has(token)) matched += 1;
  return matched / referenceTokens.size;
}

function maxPairwiseSimilarity(values: string[]): number {
  let maximum = 0;
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      maximum = Math.max(maximum, jaccard(values[left], values[right]));
    }
  }
  return maximum;
}

function jaccard(left: string, right: string): number {
  const leftTokens = new Set(meaningfulTokens(left));
  const rightTokens = new Set(meaningfulTokens(right));
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  return intersection / union.size;
}

function meaningfulTokens(value: string): string[] {
  const stopwords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with',
    'và', 'là', 'của', 'cho', 'trong', 'một', 'những', 'các', 'đã', 'đang', 'sẽ', 'với', 'thì', 'mà', 'để', 'từ', 'về',
  ]);
  return value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !stopwords.has(token));
}

function containsPhrase(text: string, phrase: string): boolean {
  return text.normalize('NFKC').toLocaleLowerCase().includes(phrase.normalize('NFKC').toLocaleLowerCase());
}

function stateDeltaSignature(delta: SceneProposal['choices'][number]['stateDelta']): string {
  return JSON.stringify({
    relationships: delta.relationships.map((relationship) => ({
      fromKey: relationship.fromKey,
      toKey: relationship.toKey,
      affinityDelta: relationship.affinityDelta,
      trustDelta: relationship.trustDelta,
      tensionDelta: relationship.tensionDelta,
      statusText: relationship.statusText,
    })),
    factsToAdd: delta.factsToAdd,
    factKeysToResolve: delta.factKeysToResolve,
    threadsToOpen: delta.threadsToOpen,
    threadKeysToResolve: delta.threadKeysToResolve,
    nextTone: delta.nextTone,
  });
}

function resolveNoveltyConstraints(input: SceneGenerationInput): {
  excludedBeats: NarrativeBeat[];
  trajectoryConstraints: TrajectoryConstraint[];
  motifHistory: SceneMotifSignature[];
  requireBeat: boolean;
} {
  if (input.novelty) {
    return {
      excludedBeats: input.novelty.excludedBeats.filter(isNarrativeBeat),
      trajectoryConstraints: input.novelty.trajectoryConstraints,
      motifHistory: input.novelty.motifHistory.map((item): SceneMotifSignature => ({
        beat: isNarrativeBeat(item.beat) ? item.beat : 'unknown',
        threadCategory: item.threadCategory as SceneMotifSignature['threadCategory'],
        dominantRelation: item.dominantRelation,
        intentFamily: item.intentFamily,
        consequenceFamily: item.consequenceFamily,
      })),
      requireBeat: true,
    };
  }

  const historyBeats = input.recentHistory
    .map((scene) => scene.beat)
    .filter((beat): beat is string => typeof beat === 'string');
  const excludedBeats = excludedBeatsFromHistory(
    historyBeats.map((beat) => (isNarrativeBeat(beat) ? beat : 'unknown')),
  );
  const trajectoryConstraints = deriveTrajectoryConstraints(
    input.recentHistory
      .filter((scene) => scene.committedRelationshipDeltas && scene.committedRelationshipDeltas.length > 0)
      .map((scene) => ({ relationships: scene.committedRelationshipDeltas! })),
  );
  const motifHistory = input.recentHistory
    .map((scene) => scene.motifSignature)
    .filter((signature): signature is NonNullable<typeof signature> => Boolean(signature))
    .map((item): SceneMotifSignature => ({
      beat: isNarrativeBeat(item.beat) ? item.beat : 'unknown',
      threadCategory: item.threadCategory as SceneMotifSignature['threadCategory'],
      dominantRelation: item.dominantRelation,
      intentFamily: item.intentFamily,
      consequenceFamily: item.consequenceFamily,
    }));

  const hasAnyConstraint = excludedBeats.length > 0 || trajectoryConstraints.length > 0 || motifHistory.length > 0;
  return {
    excludedBeats,
    trajectoryConstraints,
    motifHistory,
    requireBeat: hasAnyConstraint,
  };
}

function emptyDimensions(): Record<NarrativeEvalDimension, number> {
  return {
    continuity: 0,
    threadMomentum: 0,
    branchDistinctness: 0,
    consequenceSpecificity: 0,
    repetitionControl: 0,
    characterConsistency: 0,
    localeAlignment: 0,
    sceneProgression: 0,
    trajectoryDiversity: 0,
    structuralVariety: 0,
    longRangeNovelty: 0,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
