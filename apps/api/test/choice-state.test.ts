import { describe, expect, it } from 'vitest';
import type { DramaState } from '../src/domain/drama-state';
import { applyCommittedChoiceState } from '../src/choice/state-application';
import { makeValidProposal } from './drama-fixtures';

describe('applyCommittedChoiceState', () => {
  it('applies scene facts plus the selected choice delta into canonical v2 state', () => {
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
      affinity: 43,
      trust: 43,
      tension: 57,
      status: 'defiant',
    });
    expect(result.value.facts).toEqual([
      { key: 'scene:episode-1:fact:1', text: 'Người gửi tin nặc danh biết vị trí hiện tại của An và Linh.' },
      { key: 'choice:choice-a:fact:1', text: 'Linh notices An is still withholding something.' },
    ]);
    expect(result.value.openThreads).toEqual([
      { key: 'scene:episode-1:thread:1', title: 'A new suspicion appears.', urgency: 70 },
      { key: 'choice:choice-a:thread:1', title: 'Linh tests An’s honesty.', urgency: 85 },
    ]);
    expect(result.value.tone).toBe('defiant');
  });

  it('deduplicates semantically identical facts and open threads across scenes and choices', () => {
    const proposal = makeValidProposal();
    proposal.establishedFacts = ['  An hid a message from Linh.  '];
    proposal.threadChanges.open = [{ title: 'LINH QUESTIONS AN’S HONESTY.', urgency: 99 }];
    proposal.choices[0].stateDelta.factsToAdd = ['An hid a message from Linh.'];
    proposal.choices[0].stateDelta.threadsToOpen = [{ title: 'Linh questions An’s honesty.', urgency: 95 }];

    const result = applyCommittedChoiceState(initialState(), 'episode-1', 'choice-a', proposal, proposal.choices[0].stateDelta);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.facts).toHaveLength(1);
    expect(result.value.facts[0]).toEqual({ key: 'fact-hidden-message', text: 'An hid a message from Linh.' });
    // Default fixture resolves thread-trust; scene open is kept (deduped against choice open of same semantic title).
    expect(result.value.openThreads).toHaveLength(1);
    expect(result.value.openThreads[0]?.title).toBe('LINH QUESTIONS AN’S HONESTY.');
  });

  it('rejects resolving an unknown canonical key', () => {
    const proposal = makeValidProposal();
    proposal.choices[0].stateDelta.factKeysToResolve = ['missing-fact'];

    const result = applyCommittedChoiceState(initialState(), 'episode-1', 'choice-a', proposal, proposal.choices[0].stateDelta);

    expect(result).toEqual({ ok: false, error: 'Unknown fact key during commit: missing-fact' });
  });

  it('resolves a canonical thread once when both the scene and selected choice close it', () => {
    const proposal = makeValidProposal();
    proposal.threadChanges.resolve = ['thread-trust'];
    proposal.choices[0].stateDelta.threadKeysToResolve = ['thread-trust'];

    const result = applyCommittedChoiceState(
      initialState(),
      'episode-1',
      'choice-a',
      proposal,
      proposal.choices[0].stateDelta,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.openThreads).not.toContainEqual(
      expect.objectContaining({ key: 'thread-trust' }),
    );
    expect(result.value.openThreads).toContainEqual(
      expect.objectContaining({ key: 'scene:episode-1:thread:1' }),
    );
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

function initialState(): DramaState {
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
