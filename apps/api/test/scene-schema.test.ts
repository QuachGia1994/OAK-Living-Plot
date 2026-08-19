import { describe, expect, it } from 'vitest';
import { parseAndValidateSceneProposal } from '../src/ai/scene-schema';
import { makeGenerationInput, makeValidProposal } from './drama-fixtures';

describe('scene proposal validation', () => {
  it('accepts a valid provider-neutral proposal', () => {
    const result = parseAndValidateSceneProposal(JSON.stringify(makeValidProposal()), makeGenerationInput());
    expect(result.ok).toBe(true);
  });

  it('rejects any proposal that does not contain exactly A, B, C choices', () => {
    const proposal = makeValidProposal();
    proposal.choices[1].key = 'A';

    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), makeGenerationInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.join(' ')).toContain('A, B, C');
  });

  it('rejects unknown canonical fact/thread references', () => {
    const proposal = makeValidProposal();
    proposal.choices[0].stateDelta.factKeysToResolve = ['fact-does-not-exist'];
    proposal.choices[1].stateDelta.threadKeysToResolve = ['thread-does-not-exist'];

    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), makeGenerationInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.join(' ')).toContain('unknown fact key');
      expect(result.error.join(' ')).toContain('unknown thread key');
    }
  });

  it('rejects continuation summaries and choices that repeat the previous canonical turn', () => {
    const input = makeGenerationInput();
    const proposal = makeValidProposal();
    proposal.summary = `${input.previous!.sceneSummary} Then the same setup continues.`;
    proposal.choices[0].label = input.previous!.chosenAction;

    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.join(' ')).toContain('materially advance');
      expect(result.error.join(' ')).toContain('previously committed action');
    }
  });

  it('rejects reopening an already active thread with the same semantic title', () => {
    const input = makeGenerationInput();
    const proposal = makeValidProposal();
    proposal.threadChanges.open = [{ title: `  ${input.openThreads[0].title.toUpperCase()}  `, urgency: 90 }];

    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), input);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.join(' ')).toContain('already active thread');
  });

  it('rejects relationship mutations that escape canonical bounds', () => {
    const input = makeGenerationInput();
    input.relationships[0].tension = 95;
    const proposal = makeValidProposal();
    proposal.choices[0].stateDelta.relationships[0].tensionDelta = 10;

    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), input);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.join(' ')).toContain('outside canonical bounds');
  });

  it('rejects unexpected provider fields even when JSON is syntactically valid', () => {
    const proposal = { ...makeValidProposal(), databaseId: 'scene-123' };
    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), makeGenerationInput());
    expect(result.ok).toBe(false);
  });
});
