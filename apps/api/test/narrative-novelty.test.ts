import { describe, expect, it } from 'vitest';
import type { SceneChoiceProposal, SceneProposal } from '../src/ai/contracts';
import {
  BEAT_COOLDOWN_SCENES,
  buildMotifSignature,
  deriveTrajectoryConstraints,
  excludedBeatsFromHistory,
  motifsMatch,
  scoreLongRangeNovelty,
  scoreStructuralVariety,
  scoreTrajectoryDiversity,
} from '../src/evals/narrative-novelty';

function choice(partial: Partial<SceneChoiceProposal> & Pick<SceneChoiceProposal, 'key' | 'label'>): SceneChoiceProposal {
  return {
    key: partial.key,
    label: partial.label,
    intent: partial.intent ?? 'act',
    consequence: partial.consequence ?? 'Something durable changes for the protagonist.',
    stateDelta: partial.stateDelta ?? {
      relationships: [],
      factsToAdd: [],
      factKeysToResolve: [],
      threadsToOpen: [],
      threadKeysToResolve: [],
      nextTone: 'tense',
    },
  };
}

function proposal(overrides: Partial<SceneProposal> = {}): SceneProposal {
  return {
    title: 'Night threshold',
    script: 'Mina faces the visitor and the prior consequence remains visible while new pressure builds across the room.'.repeat(8),
    summary: 'Mina must choose under new pressure.',
    beat: 'confrontation',
    establishedFacts: ['Mina saw the visitor at the door.'],
    threadChanges: { open: [{ title: 'Visitor pressure', urgency: 70 }], resolve: [] },
    choices: [
      choice({
        key: 'A',
        label: 'Confront the visitor',
        stateDelta: {
          relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 8, tensionDelta: 5, statusText: 'trust rises' }],
          factsToAdd: [],
          factKeysToResolve: [],
          threadsToOpen: [],
          threadKeysToResolve: [],
          nextTone: 'tense',
        },
      }),
      choice({
        key: 'B',
        label: 'Stall for time',
        stateDelta: {
          relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 6, tensionDelta: 4, statusText: 'trust rises slowly' }],
          factsToAdd: [],
          factKeysToResolve: [],
          threadsToOpen: [],
          threadKeysToResolve: [],
          nextTone: 'tense',
        },
      }),
      choice({
        key: 'C',
        label: 'Invite them in',
        stateDelta: {
          relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 10, tensionDelta: 2, statusText: 'trust spikes' }],
          factsToAdd: [],
          factKeysToResolve: [],
          threadsToOpen: [],
          threadKeysToResolve: [],
          nextTone: 'hopeful',
        },
      }),
    ],
    ...overrides,
  };
}

describe('narrative novelty trajectory diversity', () => {
  it('fails when three same-direction material moves are followed by three same-direction branches',
    () => {
      const constraints = deriveTrajectoryConstraints([
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 8, tensionDelta: 0, statusText: 'a' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 6, tensionDelta: 0, statusText: 'b' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 10, tensionDelta: 0, statusText: 'c' }] },
      ]);
      expect(constraints).toEqual([
        { fromKey: 'hero', toKey: 'visitor', dimension: 'trust', direction: 'up', streak: 3 },
      ]);
      const findings: Array<{ dimension: string; code: string; message: string }> = [];
      expect(scoreTrajectoryDiversity(proposal(), constraints, findings)).toBe(0);
      expect(findings[0]?.code).toBe('TRAJECTORY_MONOTONE_ALL_BRANCHES');
    });

  it('passes when one branch materially reverses the streak',
    () => {
      const constraints = deriveTrajectoryConstraints([
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 8, tensionDelta: 0, statusText: 'a' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 6, tensionDelta: 0, statusText: 'b' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 10, tensionDelta: 0, statusText: 'c' }] },
      ]);
      const findings: Array<{ dimension: string; code: string; message: string }> = [];
      const reversed = proposal({
        choices: [
          choice({
            key: 'A',
            label: 'Withdraw trust',
            stateDelta: {
              relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: -8, tensionDelta: 6, statusText: 'trust collapses' }],
              factsToAdd: [],
              factKeysToResolve: [],
              threadsToOpen: [],
              threadKeysToResolve: [],
              nextTone: 'raw',
            },
          }),
          choice({ key: 'B', label: 'Hold steady' }),
          choice({ key: 'C', label: 'Lean in' }),
        ],
      });
      expect(scoreTrajectoryDiversity(reversed, constraints, findings)).toBe(100);
    });

  it('passes when one branch opens an independent thread instead of reversing',
    () => {
      const constraints = deriveTrajectoryConstraints([
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 8, tensionDelta: 0, statusText: 'a' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 6, tensionDelta: 0, statusText: 'b' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 10, tensionDelta: 0, statusText: 'c' }] },
      ]);
      const findings: Array<{ dimension: string; code: string; message: string }> = [];
      const independent = proposal({
        choices: [
          choice({
            key: 'A',
            label: 'Call an ally',
            stateDelta: {
              relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 5, tensionDelta: 0, statusText: 'still rising' }],
              factsToAdd: ['Mina signals for outside help.'],
              factKeysToResolve: [],
              threadsToOpen: [{ title: 'Outside ally arrives', urgency: 80 }],
              threadKeysToResolve: [],
              nextTone: 'hopeful',
            },
          }),
          choice({ key: 'B', label: 'Wait' }),
          choice({ key: 'C', label: 'Open the door' }),
        ],
      });
      expect(scoreTrajectoryDiversity(independent, constraints, findings)).toBe(100);
    });

  it('ignores tiny deltas as non-material trajectory noise',
    () => {
      const constraints = deriveTrajectoryConstraints([
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 1, tensionDelta: 0, statusText: 'a' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 1, tensionDelta: 0, statusText: 'b' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 1, tensionDelta: 0, statusText: 'c' }] },
      ]);
      expect(constraints).toEqual([]);
    });

  it('scopes trajectory to the exact relationship pair',
    () => {
      const constraints = deriveTrajectoryConstraints([
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 8, tensionDelta: 0, statusText: 'a' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'visitor', affinityDelta: 0, trustDelta: 6, tensionDelta: 0, statusText: 'b' }] },
        { relationships: [{ fromKey: 'hero', toKey: 'ally', affinityDelta: 0, trustDelta: 10, tensionDelta: 0, statusText: 'c' }] },
      ]);
      expect(constraints).toEqual([]);
    });
});

describe('narrative novelty structural beat rotation', () => {
  it('uses a single cooldown constant',
    () => {
      expect(BEAT_COOLDOWN_SCENES).toBe(3);
    });

  it('rejects a beat still inside cooldown',
    () => {
      const excluded = excludedBeatsFromHistory(['confrontation', 'revelation', 'dilemma']);
      expect(excluded).toContain('confrontation');
      const findings: Array<{ dimension: string; code: string; message: string }> = [];
      expect(scoreStructuralVariety(proposal({ beat: 'confrontation' }), excluded, findings)).toBe(0);
      expect(findings[0]?.code).toBe('BEAT_COOLDOWN_VIOLATION');
    });

  it('allows a beat once it falls outside cooldown',
    () => {
      const excluded = excludedBeatsFromHistory(['confrontation', 'revelation', 'dilemma', 'alliance']);
      expect(excluded).not.toContain('confrontation');
      expect(scoreStructuralVariety(proposal({ beat: 'confrontation' }), excluded, [])).toBe(100);
    });
});

describe('narrative novelty long-range motif signatures', () => {
  it('detects a recycled motif beyond the recent cooldown window',
    () => {
      const early = buildMotifSignature(proposal({ beat: 'revelation' }));
      const history = [
        early,
        buildMotifSignature(proposal({ beat: 'pursuit' })),
        buildMotifSignature(proposal({ beat: 'alliance' })),
        buildMotifSignature(proposal({ beat: 'dilemma' })),
        buildMotifSignature(proposal({ beat: 'sacrifice' })),
      ];
      // pad so early is outside cooldown tail
      while (history.length < 12) {
        history.push(buildMotifSignature(proposal({ beat: 'deadline', title: `Scene ${history.length}` })));
      }
      const findings: Array<{ dimension: string; code: string; message: string }> = [];
      const recycled = proposal({ beat: 'revelation' });
      expect(motifsMatch(early, buildMotifSignature(recycled))).toBe(true);
      expect(scoreLongRangeNovelty(recycled, history, findings)).toBe(0);
      expect(findings[0]?.code).toBe('LONG_RANGE_MOTIF_RECYCLE');
    });

  it('does not false-positive nearby but different motifs',
    () => {
      const history = [
        buildMotifSignature(proposal({ beat: 'revelation' })),
        buildMotifSignature(proposal({ beat: 'pursuit' })),
        buildMotifSignature(proposal({ beat: 'alliance' })),
        buildMotifSignature(proposal({ beat: 'dilemma' })),
      ];
      const different = proposal({
        beat: 'rescue',
        choices: [
          choice({
            key: 'A',
            label: 'Pull the ally free',
            intent: 'protect',
            consequence: 'The ally is pulled into safety and the chase ends.',
            stateDelta: {
              relationships: [{ fromKey: 'hero', toKey: 'ally', affinityDelta: 12, trustDelta: 4, tensionDelta: -6, statusText: 'bond strengthens' }],
              factsToAdd: ['The ally is safe.'],
              factKeysToResolve: [],
              threadsToOpen: [],
              threadKeysToResolve: [],
              nextTone: 'hopeful',
            },
          }),
          choice({ key: 'B', label: 'Cover the exit', intent: 'defend', consequence: 'The exit is sealed and pursuit is delayed.' }),
          choice({ key: 'C', label: 'Signal retreat', intent: 'withdraw', consequence: 'The group falls back into the service corridor.' }),
        ],
      });
      expect(scoreLongRangeNovelty(different, history, [])).toBe(100);
    });
});
