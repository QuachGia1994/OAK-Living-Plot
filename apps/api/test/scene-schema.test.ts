import { describe, expect, it } from 'vitest';
import { parseAndValidateSceneProposal } from '../src/ai/scene-schema';
import { makeGenerationInput, makeValidProposal } from './drama-fixtures';

describe('scene proposal validation', () => {
  it('accepts a valid provider-neutral proposal', () => {
    expect(parseAndValidateSceneProposal(JSON.stringify(makeValidProposal()), makeGenerationInput()).ok).toBe(true);
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

  it('does not classify repeated continuation prose as canonical corruption', () => {
    const input = makeGenerationInput();
    const proposal = makeValidProposal();
    proposal.summary = `${input.previous!.sceneSummary} Then the same setup continues.`;
    proposal.choices[0].label = input.previous!.chosenAction;
    expect(parseAndValidateSceneProposal(JSON.stringify(proposal), input).ok).toBe(true);
  });

  it('does not make recent-history novelty an invalid-generation gate', () => {
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
    proposal.summary = input.recentHistory[0]!.summary;
    proposal.choices[0].label = 'Call An for backup';
    proposal.choices[0].intent = input.recentHistory[0]!.choiceIntent!;
    proposal.choices[1].consequence = input.recentHistory[0]!.consequence!;
    expect(parseAndValidateSceneProposal(JSON.stringify(proposal), input).ok).toBe(true);
  });

  it('does not classify similar A/B/C wording as canonical corruption', () => {
    const proposal = makeValidProposal();
    proposal.choices[0].label = 'Call Linh before entering the station';
    proposal.choices[1].label = 'Call Linh before entering the old station';
    proposal.choices[0].intent = 'warn Linh and ask her to stay safely outside';
    proposal.choices[1].intent = 'warn Linh and ask her to remain safely outside';
    proposal.choices[0].consequence = 'Linh stays outside while An enters alone and loses immediate contact with her.';
    proposal.choices[1].consequence = 'Linh remains outside while An enters alone and loses immediate contact with her.';
    expect(parseAndValidateSceneProposal(JSON.stringify(proposal), makeGenerationInput()).ok).toBe(true);
  });

  it('rejects relationship mutations that escape canonical bounds', () => {
    const input = makeGenerationInput();
    input.relationships[0]!.tension = 95;
    const proposal = makeValidProposal();
    proposal.choices[0].stateDelta.relationships[0]!.tensionDelta = 10;
    const result = parseAndValidateSceneProposal(JSON.stringify(proposal), input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.join(' ')).toContain('outside canonical bounds');
  });

  it('rejects unexpected provider fields even when JSON is syntactically valid', () => {
    const proposal = { ...makeValidProposal(), databaseId: 'scene-123' };
    expect(parseAndValidateSceneProposal(JSON.stringify(proposal), makeGenerationInput()).ok).toBe(false);
  });
});
