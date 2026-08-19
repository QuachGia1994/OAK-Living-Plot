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

  it('rejects near-recycled titles, summaries, choices, and consequences from recent history', () => {
    const input = makeGenerationInput();
    input.recentHistory = [{
      sceneNumber: 2,
      title: 'The Locked Door',
      summary: 'Linh follows the hidden caller into the old station and discovers that the warning came from inside her own family.',
      committedChoice: 'Follow the caller alone',
      choiceIntent: 'take the risk personally',
      consequence: 'Linh enters the abandoned station while An realizes the caller has been watching them both.',
      choiceLabels: ['Follow the caller alone', 'Call An for backup', 'Wait outside the station'],
    }];
    const proposal = makeValidProposal();
    proposal.title = 'The Locked Door';
    proposal.summary = 'Linh follows the hidden caller into the old station and discovers the warning came from inside her own family.';
    proposal.choices[0].label = 'Call An for backup';
    proposal.choices[1].consequence = 'Linh enters the abandoned station while An realizes the caller has been watching them both.';

    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const errors = result.error.join(' ');
      expect(errors).toContain('title is too similar');
      expect(errors).toContain('summary is too similar');
      expect(errors).toContain('recycling recent choices');
      expect(errors).toContain('repeating recent consequences');
    }
  });

  it('rejects a continuation choice intent that recycles a recent committed intent', () => {
    const input = makeGenerationInput();
    input.recentHistory = [{
      sceneNumber: 4,
      title: 'A Different Door',
      summary: 'Linh reaches a new location after the previous confrontation and learns the caller has another target.',
      committedChoice: 'Ask Linh to wait outside',
      choiceIntent: 'protect Linh by keeping her away from the confrontation',
      consequence: 'Linh stays outside while An enters alone and loses immediate contact with her.',
      choiceLabels: ['Ask Linh to wait outside', 'Enter together', 'Call for help'],
    }];
    const proposal = makeValidProposal();
    proposal.choices[0].intent = 'protect Linh by keeping her away from the confrontation';

    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), input);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.join(' ')).toContain('recycling recent choice intent');
  });

  it('rejects materially duplicated branch labels, intents, or consequences inside one scene', () => {
    const proposal = makeValidProposal();
    proposal.choices[0].label = 'Call Linh before entering the station';
    proposal.choices[1].label = 'Call Linh before entering the old station';
    proposal.choices[0].intent = 'warn Linh and ask her to stay safely outside';
    proposal.choices[1].intent = 'warn Linh and ask her to remain safely outside';
    proposal.choices[0].consequence = 'Linh stays outside while An enters alone and loses immediate contact with her.';
    proposal.choices[1].consequence = 'Linh remains outside while An enters alone and loses immediate contact with her.';

    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), makeGenerationInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const errors = result.error.join(' ');
      expect(errors).toContain('materially distinct actions');
      expect(errors).toContain('materially distinct intents');
      expect(errors).toContain('materially distinct consequences');
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
