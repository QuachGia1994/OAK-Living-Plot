import type { RelationshipDelta, SceneChoiceProposal, SceneProposal } from '../ai/contracts';

/** Single source of truth: recent scenes whose beat is excluded. */
export const BEAT_COOLDOWN_SCENES = 3;

/** Absolute relationship delta magnitude that counts as material movement. */
export const MATERIAL_RELATIONSHIP_DELTA = 4;

/** Consecutive same-direction material moves that trigger trajectory restriction. */
export const TRAJECTORY_STREAK_THRESHOLD = 3;

export const NARRATIVE_BEATS = [
  'confrontation',
  'revelation',
  'betrayal',
  'alliance',
  'pursuit',
  'dilemma',
  'sacrifice',
  'discovery',
  'reversal',
  'separation',
  'rescue',
  'deadline',
] as const;

export type NarrativeBeat = (typeof NARRATIVE_BEATS)[number];

export type RelationshipDimension = 'affinity' | 'trust' | 'tension';

export type Direction = 'up' | 'down' | 'flat';

export interface TrajectoryConstraint {
  fromKey: string;
  toKey: string;
  dimension: RelationshipDimension;
  direction: 'up' | 'down';
  streak: number;
}

export interface SceneMotifSignature {
  beat: NarrativeBeat | 'unknown';
  threadCategory: 'open' | 'resolve' | 'mixed' | 'none';
  dominantRelation: string;
  intentFamily: string;
  consequenceFamily: string;
}

export interface NoveltyConstraints {
  excludedBeats: NarrativeBeat[];
  trajectoryConstraints: TrajectoryConstraint[];
  motifHistory: SceneMotifSignature[];
}

export function isNarrativeBeat(value: unknown): value is NarrativeBeat {
  return typeof value === 'string' && (NARRATIVE_BEATS as readonly string[]).includes(value);
}

export function directionOf(delta: number): Direction {
  if (delta >= MATERIAL_RELATIONSHIP_DELTA) return 'up';
  if (delta <= -MATERIAL_RELATIONSHIP_DELTA) return 'down';
  return 'flat';
}

export function dimensionDelta(delta: RelationshipDelta, dimension: RelationshipDimension): number {
  if (dimension === 'affinity') return delta.affinityDelta;
  if (dimension === 'trust') return delta.trustDelta;
  return delta.tensionDelta;
}

/** Derive constraints from committed relationship history streaks (server-owned). */
export function deriveTrajectoryConstraints(
  history: Array<{ relationships: RelationshipDelta[] }>,
): TrajectoryConstraint[] {
  const byPairDim = new Map<string, Direction[]>();
  for (const scene of history) {
    for (const rel of scene.relationships) {
      for (const dimension of ['affinity', 'trust', 'tension'] as const) {
        const dir = directionOf(dimensionDelta(rel, dimension));
        if (dir === 'flat') continue;
        const key = `${rel.fromKey}\0${rel.toKey}\0${dimension}`;
        const list = byPairDim.get(key) ?? [];
        list.push(dir);
        byPairDim.set(key, list);
      }
    }
  }

  const constraints: TrajectoryConstraint[] = [];
  for (const [key, dirs] of byPairDim) {
    if (dirs.length < TRAJECTORY_STREAK_THRESHOLD) continue;
    const recent = dirs.slice(-TRAJECTORY_STREAK_THRESHOLD);
    if (recent.every((d) => d === recent[0])) {
      const [fromKey, toKey, dimension] = key.split('\0') as [string, string, RelationshipDimension];
      constraints.push({
        fromKey,
        toKey,
        dimension,
        direction: recent[0] as 'up' | 'down',
        streak: recent.length,
      });
    }
  }
  return constraints;
}

export function choiceHasMaterialReversal(
  choice: SceneChoiceProposal,
  constraint: TrajectoryConstraint,
): boolean {
  for (const rel of choice.stateDelta.relationships) {
    if (rel.fromKey !== constraint.fromKey || rel.toKey !== constraint.toKey) continue;
    const dir = directionOf(dimensionDelta(rel, constraint.dimension));
    if (dir === 'flat') return false;
    return dir !== constraint.direction;
  }
  return false;
}

export function choiceOpensIndependentThread(choice: SceneChoiceProposal): boolean {
  return choice.stateDelta.threadsToOpen.length > 0 || choice.stateDelta.factsToAdd.length > 0;
}

export function scoreTrajectoryDiversity(
  proposal: SceneProposal,
  constraints: TrajectoryConstraint[],
  findings: Array<{ dimension: string; code: string; message: string }>,
): number {
  if (constraints.length === 0) return 100;
  let score = 100;
  for (const constraint of constraints) {
    const hasReversal = proposal.choices.some((choice) => choiceHasMaterialReversal(choice, constraint));
    const hasIndependent = proposal.choices.some((choice) => choiceOpensIndependentThread(choice));
    if (hasReversal || hasIndependent) continue;
    score = 0;
    findings.push({
      dimension: 'trajectoryDiversity',
      code: 'TRAJECTORY_MONOTONE_ALL_BRANCHES',
      message: `All three branches continue the same ${constraint.dimension} ${constraint.direction} trajectory for ${constraint.fromKey}->${constraint.toKey} after ${constraint.streak} material moves.`,
    });
  }
  return clamp(score);
}

export function excludedBeatsFromHistory(beats: Array<NarrativeBeat | 'unknown'>): NarrativeBeat[] {
  const recent = beats.slice(-BEAT_COOLDOWN_SCENES).filter(isNarrativeBeat);
  return [...new Set(recent)];
}

export function scoreStructuralVariety(
  proposal: SceneProposal,
  excludedBeats: NarrativeBeat[],
  findings: Array<{ dimension: string; code: string; message: string }>,
  requireBeat = true,
): number {
  const beat = proposal.beat;
  if (beat === undefined) {
    if (!requireBeat) return 100;
    findings.push({
      dimension: 'structuralVariety',
      code: 'BEAT_MISSING',
      message: 'Scene proposal must declare a structural narrative beat.',
    });
    return 40;
  }
  if (!isNarrativeBeat(beat)) {
    findings.push({
      dimension: 'structuralVariety',
      code: 'BEAT_UNKNOWN',
      message: `Unknown narrative beat: ${String(beat)}`,
    });
    return 0;
  }
  if (excludedBeats.includes(beat)) {
    findings.push({
      dimension: 'structuralVariety',
      code: 'BEAT_COOLDOWN_VIOLATION',
      message: `Beat "${beat}" is still inside the ${BEAT_COOLDOWN_SCENES}-scene cooldown.`,
    });
    return 0;
  }
  return 100;
}

export function buildMotifSignature(proposal: SceneProposal): SceneMotifSignature {
  const beat = isNarrativeBeat(proposal.beat) ? proposal.beat : 'unknown';
  const opened = proposal.threadChanges.open.length > 0;
  const resolved = proposal.threadChanges.resolve.length > 0;
  const threadCategory = opened && resolved ? 'mixed' : opened ? 'open' : resolved ? 'resolve' : 'none';
  const dominantRelation = dominantRelationCategory(proposal.choices);
  const intentFamily = normalizeFamily(proposal.choices.map((c) => c.intent).join(' '));
  const consequenceFamily = normalizeFamily(proposal.choices.map((c) => c.consequence).join(' '));
  return { beat, threadCategory, dominantRelation, intentFamily, consequenceFamily };
}

export function motifsMatch(a: SceneMotifSignature, b: SceneMotifSignature): boolean {
  if (a.beat !== 'unknown' && b.beat !== 'unknown' && a.beat === b.beat) {
    if (a.threadCategory === b.threadCategory && a.dominantRelation === b.dominantRelation) {
      if (a.intentFamily === b.intentFamily || a.consequenceFamily === b.consequenceFamily) return true;
    }
  }
  return (
    a.threadCategory === b.threadCategory
    && a.dominantRelation === b.dominantRelation
    && a.intentFamily === b.intentFamily
    && a.consequenceFamily === b.consequenceFamily
    && a.threadCategory !== 'none'
  );
}

export function scoreLongRangeNovelty(
  proposal: SceneProposal,
  history: SceneMotifSignature[],
  findings: Array<{ dimension: string; code: string; message: string }>,
): number {
  if (history.length === 0) return 100;
  const candidate = buildMotifSignature(proposal);
  // Ignore the most recent BEAT_COOLDOWN_SCENES — those are covered by structuralVariety / repetitionControl.
  const longRange = history.slice(0, Math.max(0, history.length - BEAT_COOLDOWN_SCENES));
  const hit = longRange.find((prior) => motifsMatch(prior, candidate));
  if (!hit) return 100;
  findings.push({
    dimension: 'longRangeNovelty',
    code: 'LONG_RANGE_MOTIF_RECYCLE',
    message: `Candidate motif recycles a prior long-range signature (beat=${hit.beat}, relation=${hit.dominantRelation}).`,
  });
  return 0;
}

function dominantRelationCategory(choices: SceneChoiceProposal[]): string {
  const tallies = { affinity_up: 0, affinity_down: 0, trust_up: 0, trust_down: 0, tension_up: 0, tension_down: 0, none: 0 };
  for (const choice of choices) {
    if (choice.stateDelta.relationships.length === 0) {
      tallies.none += 1;
      continue;
    }
    for (const rel of choice.stateDelta.relationships) {
      for (const dim of ['affinity', 'trust', 'tension'] as const) {
        const dir = directionOf(dimensionDelta(rel, dim));
        if (dir === 'up') tallies[`${dim}_up` as keyof typeof tallies] += 1;
        if (dir === 'down') tallies[`${dim}_down` as keyof typeof tallies] += 1;
      }
    }
  }
  let best: keyof typeof tallies = 'none';
  let bestScore = -1;
  for (const [key, value] of Object.entries(tallies) as Array<[keyof typeof tallies, number]>) {
    if (value > bestScore) {
      best = key;
      bestScore = value;
    }
  }
  return best;
}

function normalizeFamily(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 6)
    .sort()
    .join('|');
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, score));
}
