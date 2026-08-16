import { describe, expect, it } from 'vitest';
import type { StructuredPlotState } from '../src/domain/story';
import { applyCommittedChoiceState } from '../src/choice/state-application';
import { makeValidProposal } from './story-fixtures';

describe('applyCommittedChoiceState', () => {
  it('applies episode facts plus the selected choice delta into canonical v2 state', () => {
    const proposal = makeValidProposal();
    proposal.threadChanges = {
      open: [{ title: 'A new suspicion appears.', urgency: 70 }],
      resolve: ['thread-trust'],
    };
    proposal.choices[0].stateDelta.factsToAdd = ['Linh notices An is still withholding something.'];
    proposal.choices[0].stateDelta.factKeysToResolve = ['fact-hidden-message'];
    proposal.choices[0].stateDelta.threadsToOpen = [{ title: 'Linh tests An’s honesty.', urgency: 85 }];

    const result = applyCommittedChoiceState(initialState(), 'episode-1', 'choice-a', proposal, proposal.choices[0].stateDelta);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.relationships).toContainEqual({
      fromKey: 'hero',
      toKey: 'linh',
      affinity: 35,
      trust: 40,
      tension: 55,
      status: 'relationship shifts',
    });
    expect(result.value.facts).toEqual([
      { key: 'episode:episode-1:fact:1', text: 'Linh knows An intentionally hid the message.' },
      { key: 'choice:choice-a:fact:1', text: 'Linh notices An is still withholding something.' },
    ]);
    expect(result.value.openThreads).toEqual([
      { key: 'episode:episode-1:thread:1', title: 'A new suspicion appears.', urgency: 70 },
      { key: 'choice:choice-a:thread:1', title: 'Linh tests An’s honesty.', urgency: 85 },
    ]);
    expect(result.value.tone).toBe('raw');
  });

  it('rejects resolving an unknown canonical key', () => {
    const proposal = makeValidProposal();
    proposal.choices[0].stateDelta.factKeysToResolve = ['missing-fact'];

    const result = applyCommittedChoiceState(initialState(), 'episode-1', 'choice-a', proposal, proposal.choices[0].stateDelta);

    expect(result).toEqual({ ok: false, error: 'Unknown fact key during commit: missing-fact' });
  });

  it('rejects a relationship delta that would exceed canonical bounds', () => {
    const proposal = makeValidProposal();
    proposal.choices[0].stateDelta.relationships[0].trustDelta = 20;
    const state = initialState();
    state.relationships[0].trust = 90;

    const result = applyCommittedChoiceState(state, 'episode-1', 'choice-a', proposal, proposal.choices[0].stateDelta);

    expect(result).toEqual({ ok: false, error: 'Choice relationship delta exceeds canonical bounds.' });
  });
});

function initialState(): StructuredPlotState {
  return {
    schemaVersion: 2,
    relationships: [
      { fromKey: 'hero', toKey: 'linh', affinity: 40, trust: 35, tension: 45, status: 'strained' },
    ],
    facts: [{ key: 'fact-hidden-message', text: 'An hid a message from Linh.' }],
    openThreads: [{ key: 'thread-trust', title: 'Linh questions An’s honesty.', urgency: 80 }],
    tone: 'tense',
  };
}
