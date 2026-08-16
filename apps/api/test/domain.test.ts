import { describe, expect, it } from 'vitest';
import {
  DomainInvariantError,
  createInitialPlotState,
  parseStructuredPlotState,
  requireThreeChoices,
} from '../src/domain/story';

describe('story domain contracts', () => {
  it('creates canonical v2 structured memory', () => {
    expect(createInitialPlotState()).toEqual({
      schemaVersion: 2,
      relationships: [],
      facts: [],
      openThreads: [],
      tone: 'neutral',
    });
  });

  it('upgrades legacy v1 memory deterministically without dropping text', () => {
    const state = parseStructuredPlotState(
      '{"relationships":{"linh":72},"facts":["The message was hidden."],"openThreads":["Linh suspects betrayal."],"tone":"tense"}',
    );

    expect(state).toEqual({
      schemaVersion: 2,
      relationships: [
        { fromKey: 'legacy', toKey: 'linh', affinity: 72, trust: 0, tension: 0, status: 'legacy' },
      ],
      facts: [{ key: 'legacy-fact-1', text: 'The message was hidden.' }],
      openThreads: [{ key: 'legacy-thread-1', title: 'Linh suspects betrayal.', urgency: 50 }],
      tone: 'tense',
    });
  });

  it('requires exactly one choice at each position', () => {
    const choices = requireThreeChoices([
      { position: 1 as const, label: 'Tell the truth' },
      { position: 2 as const, label: 'Hide the message' },
      { position: 3 as const, label: 'Leave' },
    ]);

    expect(choices).toHaveLength(3);
    expect(() =>
      requireThreeChoices([
        { position: 1 as const, label: 'A' },
        { position: 1 as const, label: 'B' },
        { position: 3 as const, label: 'C' },
      ]),
    ).toThrow(DomainInvariantError);
  });

  it('rejects malformed v2 structured memory', () => {
    expect(() =>
      parseStructuredPlotState(
        '{"schemaVersion":2,"relationships":[{"fromKey":"hero","toKey":"linh","affinity":101,"trust":0,"tension":0,"status":"bad"}],"facts":[],"openThreads":[],"tone":"tense"}',
      ),
    ).toThrow(DomainInvariantError);
  });
});
