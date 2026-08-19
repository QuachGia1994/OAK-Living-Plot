import type { SceneChoiceProposal, SceneGenerationInput, SceneProposal } from '../ai/contracts';
import { MATERIAL_RELATIONSHIP_DELTA } from './narrative-novelty';

/** High urgency at or above this value is treated as critical for stall detection. */
export const CRITICAL_THREAD_URGENCY = 80;

/** Scenes a critical thread may remain untouched before stalling (eval-only; not hard authority). */
export const CRITICAL_THREAD_STALL_SCENES = 4;

/** Opening this many new threads while ignoring critical open threads is explosion. */
export const THREAD_EXPLOSION_NEW_OPEN = 2;

/** Max consecutive high-intensity pacing roles before penalty. */
export const MAX_ESCALATION_STREAK = 3;

/** Max consecutive low-energy pacing roles before penalty. */
export const MAX_BREATHER_STREAK = 2;

export const PACING_ROLES = [
  'setup',
  'build',
  'escalate',
  'payoff',
  'breather',
  'cliffhanger',
] as const;

export type PacingRole = (typeof PACING_ROLES)[number];

export function isPacingRole(value: unknown): value is PacingRole {
  return typeof value === 'string' && (PACING_ROLES as readonly string[]).includes(value);
}

export type QualityFinding = { dimension: string; code: string; message: string };

function hasMaterialRelationshipDelta(choice: SceneChoiceProposal): boolean {
  return choice.stateDelta.relationships.some(
    (rel) =>
      Math.abs(rel.affinityDelta) >= MATERIAL_RELATIONSHIP_DELTA
      || Math.abs(rel.trustDelta) >= MATERIAL_RELATIONSHIP_DELTA
      || Math.abs(rel.tensionDelta) >= MATERIAL_RELATIONSHIP_DELTA
      || rel.statusText.trim().length > 0,
  );
}

/** Durable effect: material relationship (SSoT threshold), fact, or thread change. Tone alone is not enough. */
export function choiceHasDurableEffect(choice: SceneChoiceProposal): boolean {
  const delta = choice.stateDelta;
  return (
    hasMaterialRelationshipDelta(choice)
    || delta.factsToAdd.length > 0
    || delta.factKeysToResolve.length > 0
    || delta.threadsToOpen.length > 0
    || delta.threadKeysToResolve.length > 0
  );
}

function durableDomains(choice: SceneChoiceProposal): Set<string> {
  const domains = new Set<string>();
  const delta = choice.stateDelta;
  if (hasMaterialRelationshipDelta(choice)) domains.add('relationship');
  if (delta.factsToAdd.length > 0 || delta.factKeysToResolve.length > 0) domains.add('fact');
  if (delta.threadsToOpen.length > 0 || delta.threadKeysToResolve.length > 0) domains.add('thread');
  return domains;
}

/** Every branch must create at least one durable canonical effect. */
export function scoreBranchCommitment(
  proposal: SceneProposal,
  findings: QualityFinding[],
): number {
  const durable = proposal.choices.map(choiceHasDurableEffect);
  if (durable.every(Boolean)) {
    const union = new Set<string>();
    for (const choice of proposal.choices) for (const domain of durableDomains(choice)) union.add(domain);
    if (union.size >= 2) return 100;
    return 85;
  }
  const emptyCount = durable.filter((ok) => !ok).length;
  findings.push({
    dimension: 'branchCommitment',
    code: 'BRANCH_NO_DURABLE_EFFECT',
    message: `${emptyCount} of 3 choices create no durable relationship/fact/thread effect.`,
  });
  return emptyCount === 3 ? 0 : 35;
}

function proposalAdvancesThread(proposal: SceneProposal, threadKey: string, threadTitle: string): boolean {
  if (proposal.threadChanges.resolve.includes(threadKey)) return true;
  if (proposal.choices.some((choice) => choice.stateDelta.threadKeysToResolve.includes(threadKey))) return true;
  const haystack = [
    proposal.script,
    proposal.summary,
    ...proposal.threadChanges.open.map((t) => t.title),
    ...proposal.choices.flatMap((c) => [c.label, c.intent, c.consequence, ...c.stateDelta.threadsToOpen.map((t) => t.title)]),
  ].join(' ').toLocaleLowerCase();
  const tokens = threadTitle.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 3);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits / tokens.length >= 0.4;
}

/** High-urgency open threads must not starve while new mysteries proliferate. */
export function scoreThreadPayoff(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: QualityFinding[],
): number {
  if (input.openThreads.length === 0) return 100;
  const critical = input.openThreads.filter((thread) => thread.urgency >= CRITICAL_THREAD_URGENCY);
  if (critical.length === 0) return 100;

  const advancedCritical = critical.filter((thread) => proposalAdvancesThread(proposal, thread.key, thread.title));
  const newOpens = proposal.threadChanges.open.length
    + proposal.choices.reduce((sum, choice) => sum + choice.stateDelta.threadsToOpen.length, 0);

  if (advancedCritical.length === 0 && newOpens >= THREAD_EXPLOSION_NEW_OPEN) {
    findings.push({
      dimension: 'threadPayoff',
      code: 'THREAD_EXPLOSION',
      message: `Opened ${newOpens} new threads while ignoring ${critical.length} critical open thread(s).`,
    });
    return 0;
  }

  // Eval-only stall signal: global recentHistory length is not per-thread age.
  // Do not hard-reject on this heuristic alone (see PHASE2_HARD_CODES).
  if (
    advancedCritical.length === 0
    && input.recentHistory.length >= CRITICAL_THREAD_STALL_SCENES
    && critical.some((thread) => thread.urgency >= 90)
  ) {
    findings.push({
      dimension: 'threadPayoff',
      code: 'CRITICAL_THREAD_STALLED',
      message: 'A critical high-urgency open thread was not advanced or resolved (eval heuristic; not hard authority).',
    });
    return 20;
  }

  if (advancedCritical.length > 0) return 100;
  if (input.recentHistory.length < 2) return 90;
  findings.push({
    dimension: 'threadPayoff',
    code: 'NO_EXISTING_THREAD_ADVANCED',
    message: 'No critical open thread was materially advanced.',
  });
  return 55;
}

/**
 * Causal consequence quality (eval-oriented).
 * Continuity already hard-enforces that the prior consequence appears in the opening.
 * This dimension requires progression that is not wholly unrelated noise.
 */
export function scoreConsequenceRealization(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: QualityFinding[],
): number {
  if (!input.previous) return 100;

  const prior = input.previous.consequence.toLocaleLowerCase();
  const priorTokens = prior.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 3);
  const developmentSurface = [
    proposal.script,
    proposal.summary,
    ...proposal.establishedFacts,
    ...proposal.threadChanges.open.map((t) => t.title),
    ...proposal.choices.flatMap((c) => [c.consequence, ...c.stateDelta.factsToAdd, ...c.stateDelta.threadsToOpen.map((t) => t.title)]),
  ].join(' ').toLocaleLowerCase();

  const linked = priorTokens.length > 0
    && priorTokens.filter((token) => developmentSurface.includes(token)).length / priorTokens.length >= 0.25;

  const developed = proposal.establishedFacts.length > 0
    || proposal.threadChanges.open.length > 0
    || proposal.threadChanges.resolve.length > 0
    || proposal.choices.some((choice) => choiceHasDurableEffect(choice));

  if (developed && linked) return 100;
  if (developed && !linked) {
    findings.push({
      dimension: 'consequenceRealization',
      code: 'CONSEQUENCE_UNRELATED_PROGRESSION',
      message: 'New canonical development appears unrelated to the prior committed consequence.',
    });
    return 55;
  }

  findings.push({
    dimension: 'consequenceRealization',
    code: 'CONSEQUENCE_NOT_REALIZED',
    message: 'Prior committed consequence is acknowledged without new canonical fact, thread, or durable branch development.',
  });
  return 25;
}

export function scorePacingQuality(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: QualityFinding[],
): number {
  const role = proposal.pacingRole;
  if (role !== undefined && !isPacingRole(role)) {
    findings.push({
      dimension: 'pacingQuality',
      code: 'PACING_ROLE_INVALID',
      message: `Unknown pacing role: ${String(role)}`,
    });
    return 0;
  }

  const historyRoles = input.recentHistory
    .map((scene) => scene.pacingRole)
    .filter((value): value is string => typeof value === 'string');
  const sequence = role && isPacingRole(role) ? [...historyRoles, role] : historyRoles;
  if (sequence.length < 2) return 100;

  const recent = sequence.slice(-MAX_ESCALATION_STREAK - 1);
  const high = new Set(['escalate', 'cliffhanger']);
  const low = new Set(['breather', 'setup']);
  if (recent.length > MAX_ESCALATION_STREAK && recent.every((r) => high.has(r))) {
    findings.push({
      dimension: 'pacingQuality',
      code: 'ENDLESS_ESCALATION',
      message: `Pacing stayed high-intensity for ${recent.length} consecutive scenes without payoff/breather.`,
    });
    return 30;
  }
  const recentLow = sequence.slice(-MAX_BREATHER_STREAK - 1);
  if (recentLow.length > MAX_BREATHER_STREAK && recentLow.every((r) => low.has(r))) {
    findings.push({
      dimension: 'pacingQuality',
      code: 'ENDLESS_BREATHER',
      message: 'Multiple low-energy reset scenes in succession without progression.',
    });
    return 35;
  }
  return 100;
}

export function scoreRelationshipProgression(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: QualityFinding[],
): number {
  const materialChoices = proposal.choices.filter((choice) =>
    choice.stateDelta.relationships.some(
      (rel) =>
        Math.abs(rel.affinityDelta) >= MATERIAL_RELATIONSHIP_DELTA
        || Math.abs(rel.trustDelta) >= MATERIAL_RELATIONSHIP_DELTA
        || Math.abs(rel.tensionDelta) >= MATERIAL_RELATIONSHIP_DELTA,
    ));
  if (materialChoices.length === 0) return 100;

  const story = [proposal.script, proposal.summary, ...proposal.choices.map((c) => c.consequence)].join(' ').toLocaleLowerCase();
  const statusHints = materialChoices.flatMap((choice) =>
    choice.stateDelta.relationships.map((rel) => rel.statusText.toLocaleLowerCase()).filter(Boolean),
  );
  const reflected = statusHints.some((hint) => hint.length >= 4 && story.includes(hint.slice(0, Math.min(hint.length, 12))));
  const consequenceDepth = materialChoices.every((choice) => choice.consequence.trim().split(/\s+/).length >= 8);
  if (reflected || consequenceDepth) return 100;

  findings.push({
    dimension: 'relationshipProgression',
    code: 'RELATIONSHIP_SHIFT_INVISIBLE',
    message: 'Material relationship deltas are not visibly reflected in narrative consequences.',
  });
  return 45;
}

export function scoreProtagonistAgency(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: QualityFinding[],
): number {
  const protagonist = input.characters[0];
  if (!protagonist?.name.trim()) return 100;
  const agencyFromStructure = proposal.choices.every((choice) => choice.intent.trim().length >= 4 && choiceHasDurableEffect(choice));
  if (agencyFromStructure) return 100;
  if (proposal.choices.every((choice) => choice.intent.trim().length >= 4)) return 80;
  findings.push({
    dimension: 'protagonistAgency',
    code: 'PROTAGONIST_PASSIVE',
    message: 'Branches lack clear protagonist intent or durable decision effects.',
  });
  return 50;
}

export function scoreArcCoherence(
  input: SceneGenerationInput,
  proposal: SceneProposal,
  findings: QualityFinding[],
): number {
  if (input.recentHistory.length < 5) return 100;
  const opens = proposal.threadChanges.open.length;
  const resolves = proposal.threadChanges.resolve.length;
  const criticalOpen = input.openThreads.filter((t) => t.urgency >= CRITICAL_THREAD_URGENCY).length;
  if (opens >= 2 && resolves === 0 && criticalOpen >= 2) {
    findings.push({
      dimension: 'arcCoherence',
      code: 'ENDLESS_SETUP',
      message: 'Long-run arc keeps opening questions without paying off existing critical threads.',
    });
    return 40;
  }
  return 100;
}

export function scoreReturnPull(
  proposal: SceneProposal,
  findings: QualityFinding[],
): number {
  const paidSomething = proposal.establishedFacts.length > 0
    || proposal.threadChanges.resolve.length > 0
    || proposal.choices.some((c) => c.stateDelta.factKeysToResolve.length > 0 || c.stateDelta.threadKeysToResolve.length > 0);
  const opensSomething = proposal.threadChanges.open.length > 0
    || proposal.choices.some((c) => c.stateDelta.threadsToOpen.length > 0 || c.stateDelta.factsToAdd.length > 0);

  if (paidSomething && opensSomething) return 100;
  if (paidSomething) return 85;
  if (opensSomething) {
    findings.push({
      dimension: 'returnPull',
      code: 'CLIFFHANGER_WITHOUT_PAYOFF',
      message: 'Scene opens new tension without paying off any prior fact or thread.',
    });
    return 55;
  }
  findings.push({
    dimension: 'returnPull',
    code: 'NO_RETURN_HOOK',
    message: 'Scene neither pays something off nor opens a concrete return hook.',
  });
  return 40;
}

/**
 * Objective Phase-2 codes that may reject publication.
 * CRITICAL_THREAD_STALLED is intentionally excluded: age is not per-thread.
 * CONSEQUENCE_NOT_REALIZED remains hard only when there is zero development;
 * CONSEQUENCE_UNRELATED_PROGRESSION is eval-only.
 */
export const PHASE2_HARD_CODES = new Set([
  'BRANCH_NO_DURABLE_EFFECT',
  'THREAD_EXPLOSION',
  'CONSEQUENCE_NOT_REALIZED',
  'PACING_ROLE_INVALID',
]);

export function isPhase2HardFailure(code: string): boolean {
  return PHASE2_HARD_CODES.has(code);
}
