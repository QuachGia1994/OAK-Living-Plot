import { describe, expect, it } from 'vitest';
import { evaluateNarrative, validateNarrativePublication } from '../src/evals/narrative-evaluator';
import {
  choiceHasDurableEffect,
  scoreBranchCommitment,
  scoreConsequenceRealization,
  scorePacingQuality,
  scoreReturnPull,
  scoreThreadPayoff,
} from '../src/evals/narrative-quality';
import { NARRATIVE_FIXTURES } from '../evals/narrative-fixtures';
import { makeGenerationInput, makeValidProposal } from './drama-fixtures';

describe('Phase-2 narrative quality', () => {
  it('keeps Phase-1 good fixtures green under Phase-2 objective publication', () => {
    for (const fixture of NARRATIVE_FIXTURES) {
      const decision = validateNarrativePublication(fixture.input, fixture.proposal);
      expect(decision.publishable, `${fixture.id}: ${decision.rejectionReasons.join('; ')}`).toBe(true);
      expect(decision.report.dimensions.branchCommitment).toBeGreaterThanOrEqual(60);
    }
  });

  it('fails three choices with no durable state effects', () => {
    const proposal = makeValidProposal();
    for (const choice of proposal.choices) {
      choice.stateDelta.relationships = [];
      choice.stateDelta.factsToAdd = [];
      choice.stateDelta.factKeysToResolve = [];
      choice.stateDelta.threadsToOpen = [];
      choice.stateDelta.threadKeysToResolve = [];
      choice.stateDelta.nextTone = '';
    }
    const findings: Array<{ dimension: string; code: string; message: string }> = [];
    const score = scoreBranchCommitment(proposal, findings);
    expect(score).toBe(0);
    expect(findings.some((f) => f.code === 'BRANCH_NO_DURABLE_EFFECT')).toBe(true);
  });

  it('does not treat ±1/±2 numerical wiggle as durable relationship effect', () => {
    const proposal = makeValidProposal();
    for (const choice of proposal.choices) {
      choice.stateDelta.relationships = [{
        fromKey: 'hero',
        toKey: 'linh',
        affinityDelta: 2,
        trustDelta: 1,
        tensionDelta: -2,
        statusText: '',
      }];
      choice.stateDelta.factsToAdd = [];
      choice.stateDelta.factKeysToResolve = [];
      choice.stateDelta.threadsToOpen = [];
      choice.stateDelta.threadKeysToResolve = [];
      choice.stateDelta.nextTone = '';
    }
    expect(choiceHasDurableEffect(proposal.choices[0])).toBe(false);
    const findings: Array<{ dimension: string; code: string; message: string }> = [];
    expect(scoreBranchCommitment(proposal, findings)).toBe(0);
  });

  it('treats material relationship threshold movement as durable', () => {
    const proposal = makeValidProposal();
    for (const choice of proposal.choices) {
      choice.stateDelta.relationships = [{
        fromKey: 'hero',
        toKey: 'linh',
        affinityDelta: 4,
        trustDelta: 0,
        tensionDelta: 0,
        statusText: '',
      }];
      choice.stateDelta.factsToAdd = [];
      choice.stateDelta.factKeysToResolve = [];
      choice.stateDelta.threadsToOpen = [];
      choice.stateDelta.threadKeysToResolve = [];
    }
    expect(choiceHasDurableEffect(proposal.choices[0])).toBe(true);
  });

  it('fails consequence echo without canonical development', () => {
    const input = makeGenerationInput();
    const proposal = makeValidProposal();
    proposal.establishedFacts = [];
    proposal.threadChanges = { open: [], resolve: [] };
    for (const choice of proposal.choices) {
      choice.stateDelta.relationships = [];
      choice.stateDelta.factsToAdd = [];
      choice.stateDelta.factKeysToResolve = [];
      choice.stateDelta.threadsToOpen = [];
      choice.stateDelta.threadKeysToResolve = [];
      choice.stateDelta.nextTone = '';
    }
    const findings: Array<{ dimension: string; code: string; message: string }> = [];
    const score = scoreConsequenceRealization(input, proposal, findings);
    expect(score).toBeLessThan(60);
    expect(findings.some((f) => f.code === 'CONSEQUENCE_NOT_REALIZED')).toBe(true);
  });

  it('does not award full consequenceRealization for unrelated progression', () => {
    const input = makeGenerationInput();
    const proposal = makeValidProposal();
    proposal.script = 'A stranger buys a blue umbrella at the market and leaves without speaking.';
    proposal.summary = 'Unrelated market beat.';
    proposal.establishedFacts = ['Someone bought an umbrella downtown.'];
    proposal.threadChanges = { open: [{ title: 'Who sold the umbrella?', urgency: 40 }], resolve: [] };
    for (const choice of proposal.choices) {
      choice.consequence = 'The umbrella purchase changes nothing about prior demands.';
      choice.stateDelta.factsToAdd = ['Umbrella receipt exists.'];
      choice.stateDelta.threadsToOpen = [];
      choice.stateDelta.factKeysToResolve = [];
      choice.stateDelta.threadKeysToResolve = [];
    }
    const findings: Array<{ dimension: string; code: string; message: string }> = [];
    const score = scoreConsequenceRealization(input, proposal, findings);
    expect(score).toBeLessThan(100);
    expect(findings.some((f) => f.code === 'CONSEQUENCE_UNRELATED_PROGRESSION')).toBe(true);
  });

  it('fails thread explosion while critical threads starve', () => {
    const input = makeGenerationInput();
    input.openThreads = [{ key: 'thread-trust', title: 'Linh questions honesty', urgency: 95 }];
    const proposal = makeValidProposal();
    proposal.threadChanges = {
      open: [
        { title: 'New mystery A', urgency: 50 },
        { title: 'New mystery B', urgency: 50 },
      ],
      resolve: [],
    };
    proposal.script = 'Someone walks down a quiet street and looks at the sky without naming prior conflicts.';
    proposal.summary = 'No prior thread is mentioned.';
    const findings: Array<{ dimension: string; code: string; message: string }> = [];
    const score = scoreThreadPayoff(input, proposal, findings);
    expect(score).toBe(0);
    expect(findings.some((f) => f.code === 'THREAD_EXPLOSION')).toBe(true);
  });

  it('does not hard-reject a newly introduced critical thread merely because drama age is high', () => {
    const input = makeGenerationInput();
    input.recentHistory = Array.from({ length: 30 }, (_, index) => ({
      sceneNumber: index + 1,
      title: `Scene ${index + 1}`,
      summary: `Development ${index + 1}`,
      committedChoice: 'A',
      choiceIntent: 'push',
      consequence: `Consequence ${index + 1}`,
      choiceLabels: ['A', 'B', 'C'],
      beat: 'revelation',
      pacingRole: 'build',
    }));
    input.openThreads = [{ key: 'thread-new', title: 'Brand new critical threat', urgency: 95 }];
    const proposal = makeValidProposal();
    proposal.threadChanges = { open: [], resolve: [] };
    proposal.script = 'The pair discusses dinner plans and weather without addressing any threat.';
    proposal.summary = 'Quiet domestic beat.';
    const decision = validateNarrativePublication(input, proposal);
    expect(decision.rejectionReasons.some((r) => r.includes('CRITICAL_THREAD_STALLED'))).toBe(false);
  });

  it('penalizes endless escalation pacing as eval-only', () => {
    const input = makeGenerationInput();
    input.recentHistory = [
      { sceneNumber: 1, title: 'a', summary: 's', committedChoice: null, choiceIntent: null, consequence: null, choiceLabels: [], pacingRole: 'escalate' },
      { sceneNumber: 2, title: 'b', summary: 's', committedChoice: null, choiceIntent: null, consequence: null, choiceLabels: [], pacingRole: 'cliffhanger' },
      { sceneNumber: 3, title: 'c', summary: 's', committedChoice: null, choiceIntent: null, consequence: null, choiceLabels: [], pacingRole: 'escalate' },
    ];
    const proposal = makeValidProposal();
    proposal.pacingRole = 'cliffhanger';
    const findings: Array<{ dimension: string; code: string; message: string }> = [];
    const score = scorePacingQuality(input, proposal, findings);
    expect(score).toBeLessThan(60);
    expect(findings.some((f) => f.code === 'ENDLESS_ESCALATION')).toBe(true);
    const decision = validateNarrativePublication(input, proposal);
    expect(decision.rejectionReasons.some((r) => r.includes('ENDLESS_ESCALATION'))).toBe(false);
  });

  it('accepts publication when only returnPull is weak', () => {
    const input = makeGenerationInput();
    const proposal = makeValidProposal();
    proposal.establishedFacts = [];
    proposal.threadChanges = { open: [], resolve: [] };
    for (const choice of proposal.choices) {
      choice.stateDelta.factsToAdd = [];
      choice.stateDelta.threadsToOpen = [];
      choice.stateDelta.factKeysToResolve = [];
      choice.stateDelta.threadKeysToResolve = [];
    }
    // Keep durable relationship effects so branchCommitment still passes.
    const report = evaluateNarrative(input, proposal);
    expect(report.dimensions.returnPull).toBeLessThan(60);
    const decision = validateNarrativePublication(input, proposal);
    expect(decision.publishable).toBe(true);
  });

  it('rewards payoff plus a concrete return hook', () => {
    const proposal = makeValidProposal();
    proposal.establishedFacts = ['A prior threat becomes concrete.'];
    proposal.threadChanges = { open: [{ title: 'Who is watching them?', urgency: 90 }], resolve: ['thread-trust'] };
    const findings: Array<{ dimension: string; code: string; message: string }> = [];
    expect(scoreReturnPull(proposal, findings)).toBe(100);
  });

  it('long-horizon synthetic arc (~24 scenes) keeps objective dimensions publishable', () => {
    const input = makeGenerationInput();
    const roles = ['setup', 'build', 'escalate', 'payoff', 'breather', 'build'] as const;
    input.recentHistory = Array.from({ length: 24 }, (_, index) => ({
      sceneNumber: index + 1,
      title: `Scene ${index + 1}`,
      summary: `Development ${index + 1} with consequence feed-forward`,
      committedChoice: 'A',
      choiceIntent: 'advance',
      consequence: `Consequence ${index + 1} shifts trust`,
      choiceLabels: ['A', 'B', 'C'],
      beat: (['confrontation', 'betrayal', 'alliance', 'pursuit'] as const)[index % 4],
      pacingRole: roles[index % roles.length],
    }));
    input.openThreads = [{ key: 'thread-trust', title: 'Linh questions honesty', urgency: 92 }];
    const proposal = makeValidProposal();
    proposal.beat = 'discovery';
    proposal.pacingRole = 'payoff';
    proposal.threadChanges = { open: [{ title: 'Watcher escalates', urgency: 94 }], resolve: ['thread-trust'] };
    const decision = validateNarrativePublication(input, proposal);
    expect(decision.publishable, decision.rejectionReasons.join('; ')).toBe(true);
    expect(decision.report.dimensions.threadPayoff).toBeGreaterThanOrEqual(60);
    expect(decision.report.dimensions.pacingQuality).toBeGreaterThanOrEqual(60);
    expect(decision.report.dimensions.branchCommitment).toBeGreaterThanOrEqual(60);
    expect(decision.report.dimensions.arcCoherence).toBeGreaterThanOrEqual(60);
  });
});
