import { describe, expect, it } from 'vitest';
import { NARRATIVE_FIXTURES } from '../evals/narrative-fixtures';
import { evaluateNarrative } from '../src/evals/narrative-evaluator';

describe('narrative quality eval suite', () => {
  it.each(NARRATIVE_FIXTURES)('$id passes the deterministic narrative baseline', ({ input, proposal }) => {
    const report = evaluateNarrative(input, proposal);

    expect(report.passed, JSON.stringify(report.findings)).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(Object.values(report.dimensions).every((score) => score >= 60)).toBe(true);
  });

  it('rejects choices that are structurally distinct strings but semantically near-duplicates', () => {
    const fixture = structuredClone(NARRATIVE_FIXTURES[0]);
    fixture.proposal.choices[0].label = 'Tell Linh the full truth now';
    fixture.proposal.choices[1].label = 'Tell Linh the full truth now please';
    fixture.proposal.choices[0].intent = 'reveal every hidden fact immediately';
    fixture.proposal.choices[1].intent = 'reveal every hidden fact immediately now';

    const report = evaluateNarrative(fixture.input, fixture.proposal);

    expect(report.passed).toBe(false);
    expect(report.findings.some((finding) => finding.code === 'CHOICES_SEMANTICALLY_NEAR_DUPLICATE')).toBe(true);
    expect(report.findings.some((finding) => finding.message.includes('too similar'))).toBe(true);
  });

  it('rejects an episode that ignores the prior committed consequence in its opening', () => {
    const fixture = structuredClone(NARRATIVE_FIXTURES[1]);
    fixture.proposal.script = unrelatedScript();
    fixture.proposal.summary = 'Maya and Theo spend the evening discussing ordinary repairs to the family house.';

    const report = evaluateNarrative(fixture.input, fixture.proposal);

    expect(report.passed).toBe(false);
    expect(report.dimensions.continuity).toBeLessThan(60);
    expect(report.findings.some((finding) => finding.code === 'PREVIOUS_CONSEQUENCE_NOT_VISIBLE_EARLY')).toBe(true);
  });

  it('fails through the canonical validation layer when a fixture mutates an unknown thread key', () => {
    const fixture = structuredClone(NARRATIVE_FIXTURES[0]);
    fixture.proposal.choices[0].stateDelta.threadKeysToResolve = ['thread-not-canonical'];

    const report = evaluateNarrative(fixture.input, fixture.proposal);

    expect(report.passed).toBe(false);
    expect(report.score).toBe(0);
    expect(report.findings[0]?.dimension).toBe('structure');
  });

  it('rejects generic branch consequences even when the provider schema accepts them', () => {
    const fixture = structuredClone(NARRATIVE_FIXTURES[2]);
    fixture.proposal.choices[0].consequence = 'Something happens.';
    fixture.proposal.choices[1].consequence = 'Something else happens.';

    const report = evaluateNarrative(fixture.input, fixture.proposal);

    expect(report.passed).toBe(false);
    expect(report.findings.some((finding) => finding.code === 'CONSEQUENCE_TOO_GENERIC')).toBe(true);
  });

  it('rejects a structurally valid but excessively repetitive script', () => {
    const fixture = structuredClone(NARRATIVE_FIXTURES[2]);
    fixture.proposal.script = Array.from(
      { length: 22 },
      () => 'The hallway stays silent while everyone waits for another answer.',
    ).join(' ');

    const report = evaluateNarrative(fixture.input, fixture.proposal);

    expect(report.passed).toBe(false);
    expect(report.dimensions.repetitionControl).toBeLessThan(60);
    expect(report.findings.some((finding) => finding.code === 'SCRIPT_EXCESSIVELY_REPETITIVE')).toBe(true);
  });

  it('rejects a scene that drops the canonical protagonist from the visible scene', () => {
    const fixture = structuredClone(NARRATIVE_FIXTURES[1]);
    const protagonist = fixture.input.characters[0]?.name ?? '';
    const removeName = (value: string) => value.replaceAll(protagonist, 'Someone');
    fixture.proposal.script = removeName(fixture.proposal.script);
    fixture.proposal.summary = removeName(fixture.proposal.summary);
    fixture.proposal.choices.forEach((choice) => {
      choice.label = removeName(choice.label);
      choice.consequence = removeName(choice.consequence);
    });

    const report = evaluateNarrative(fixture.input, fixture.proposal);

    expect(report.passed).toBe(false);
    expect(report.dimensions.characterConsistency).toBeLessThan(60);
    expect(report.findings.some((finding) => finding.code === 'PROTAGONIST_NOT_ANCHORED')).toBe(true);
  });

  it('rejects English output for a Vietnamese drama locale', () => {
    const fixture = structuredClone(NARRATIVE_FIXTURES.find((item) => item.input.locale.startsWith('vi')) ?? NARRATIVE_FIXTURES[0]);
    fixture.proposal.script = unrelatedScript();
    fixture.proposal.summary = 'The protagonist receives new information and must decide who to trust before the situation escalates.';
    fixture.proposal.choices.forEach((choice, index) => {
      choice.label = ['Confront the witness now', 'Investigate the hidden evidence', 'Ask an ally for help'][index] ?? choice.label;
      choice.consequence = ['The confrontation exposes a new risk immediately.', 'The investigation reveals a clue that changes the timeline.', 'The ally agrees to help but demands a difficult favor.'][index] ?? choice.consequence;
    });

    const report = evaluateNarrative(fixture.input, fixture.proposal);

    expect(report.passed).toBe(false);
    expect(report.dimensions.localeAlignment).toBeLessThan(60);
    expect(report.findings.some((finding) => finding.code === 'VIETNAMESE_OUTPUT_NOT_VISIBLE')).toBe(true);
  });

  it('rejects a scene that creates no durable canonical progression before branching', () => {
    const fixture = structuredClone(NARRATIVE_FIXTURES[2]);
    fixture.proposal.establishedFacts = [];
    fixture.proposal.threadChanges = { open: [], resolve: [] };

    const report = evaluateNarrative(fixture.input, fixture.proposal);

    expect(report.passed).toBe(false);
    expect(report.dimensions.sceneProgression).toBeLessThan(60);
    expect(report.findings.some((finding) => finding.code === 'SCENE_ADDS_NO_CANONICAL_PROGRESS')).toBe(true);
  });
});

function unrelatedScript(): string {
  return [
    'Maya opens the windows and starts sorting old paint cans from the basement shelves while Theo checks a loose hinge on the kitchen door.',
    'They compare hardware-store prices, write measurements on scrap paper, and argue mildly about whether the hallway needs a warmer color.',
    'A neighbor drops off a borrowed ladder and stays long enough to recommend a carpenter who repaired the porch across the street.',
    'Theo sweeps dust from the steps, then finds a box of family photographs that neither sibling has opened since moving into the house.',
    'Maya labels the photographs by year and places damaged frames in a separate pile for later repair.',
    'They order inexpensive dinner, move chairs away from the wall, and make a list of small jobs they can finish before morning.',
    'The conversation shifts to school schedules, grocery shopping, and which room should hold the spare desk.',
    'Theo replaces a burned-out bulb while Maya cleans old tape from the window trim with a plastic scraper.',
    'Nothing outside interrupts them, and neither sibling checks a phone for most of the evening.',
    'By midnight the kitchen looks cleaner, several shelves are organized, and the repair list is shorter than it was at sunset.',
  ].join(' ');
}
