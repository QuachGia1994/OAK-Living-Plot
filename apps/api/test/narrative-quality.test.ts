import { describe, expect, it } from 'vitest';
import { evaluateNarrative } from '../src/evals/narrative-evaluator';
import {
  scoreBranchCommitment,
  scoreConsequenceRealization,
  scorePacingQuality,
  scoreReturnPull,
  scoreThreadPayoff,
} from '../src/evals/narrative-quality';
import { NARRATIVE_FIXTURES } from '../evals/narrative-fixtures';
import { makeGenerationInput, makeValidProposal } from './drama-fixtures';

describe('Phase-2 narrative quality', () => {
  it('keeps Phase-1 good fixtures green under Phase-2 dimensions', () => {
    for (const fixture of NARRATIVE_FIXTURES) {
      const report = evaluateNarrative(fixture.input, fixture.proposal);
      expect(report.passed, `${fixture.id}: ${JSON.stringify(report.findings)}`).toBe(true);
      expect(report.dimensions.branchCommitment).toBeGreaterThanOrEqual(60);
      expect(report.dimensions.consequenceRealization).toBeGreaterThanOrEqual(60);
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

  it('penalizes endless escalation pacing', () => {
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
  });

  it('rewards payoff plus a concrete return hook', () => {
    const proposal = makeValidProposal();
    proposal.establishedFacts = ['A prior threat becomes concrete.'];
    proposal.threadChanges = { open: [{ title: 'Who is watching them?', urgency: 90 }], resolve: ['thread-trust'] };
    const findings: Array<{ dimension: string; code: string; message: string }> = [];
    expect(scoreReturnPull(proposal, findings)).toBe(100);
  });

  it('long-horizon synthetic arc keeps Phase-2 objective dimensions above floor', () => {
    const input = makeGenerationInput();
    input.recentHistory = Array.from({ length: 12 }, (_, index) => ({
      sceneNumber: index + 1,
      title: `Scene ${index + 1}`,
      summary: `Development ${index + 1}`,
      committedChoice: 'A',
      choiceIntent: 'push',
      consequence: `Consequence ${index + 1}`,
      choiceLabels: ['A', 'B', 'C'],
      beat: index % 2 === 0 ? 'revelation' : 'dilemma',
      pacingRole: (['build', 'escalate', 'payoff', 'breather'] as const)[index % 4],
    }));
    input.openThreads = [{ key: 'thread-trust', title: 'Linh questions honesty', urgency: 92 }];
    const proposal = makeValidProposal();
    proposal.pacingRole = 'payoff';
    proposal.threadChanges = { open: [{ title: 'Watcher escalates', urgency: 94 }], resolve: ['thread-trust'] };
    const report = evaluateNarrative(input, proposal);
    expect(report.dimensions.threadPayoff).toBeGreaterThanOrEqual(60);
    expect(report.dimensions.pacingQuality).toBeGreaterThanOrEqual(60);
    expect(report.dimensions.branchCommitment).toBeGreaterThanOrEqual(60);
    expect(report.dimensions.arcCoherence).toBeGreaterThanOrEqual(60);
  });
});
