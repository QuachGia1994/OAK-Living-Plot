import { describe, expect, it } from 'vitest';
import { buildRetentionSnapshot, promptForUtcDay } from '../src/retention/retention';

describe('retention snapshot', () => {
  const now = Date.parse('2026-08-17T01:00:00.000Z');

  it('counts a streak that includes today and yesterday', () => {
    const snapshot = buildRetentionSnapshot([
      { utcDay: '2026-08-17', choicesMade: 2 },
      { utcDay: '2026-08-16', choicesMade: 1 },
      { utcDay: '2026-08-15', choicesMade: 3 },
    ], 4, now);

    expect(snapshot.currentStreakDays).toBe(3);
    expect(snapshot.choicesMade).toBe(6);
    expect(snapshot.activeDramas).toBe(4);
  });

  it('keeps a yesterday streak alive but resets after a gap', () => {
    expect(buildRetentionSnapshot([{ utcDay: '2026-08-16', choicesMade: 1 }], 1, now).currentStreakDays).toBe(1);
    expect(buildRetentionSnapshot([{ utcDay: '2026-08-15', choicesMade: 1 }], 1, now).currentStreakDays).toBe(0);
  });

  it('uses a deterministic UTC daily prompt in the requested UI locale', () => {
    expect(promptForUtcDay('2026-08-17')).toEqual(promptForUtcDay('2026-08-17'));
    expect(promptForUtcDay('2026-08-17').premise.length).toBeGreaterThan(20);
    expect(promptForUtcDay('2026-08-17', 'vi').label).not.toBe(promptForUtcDay('2026-08-17', 'en').label);
    expect(buildRetentionSnapshot([], 0, now, 'vi').dailyPrompt).toEqual(promptForUtcDay('2026-08-17', 'vi'));
  });

  it('rotates past a recent matching daily drama even when the UI locale changed', () => {
    const originalEn = promptForUtcDay('2026-08-17', 'en');
    const originalVi = promptForUtcDay('2026-08-17', 'vi');
    const rotated = promptForUtcDay('2026-08-17', 'vi', [originalEn.premise]);

    expect(rotated.premise).not.toBe(originalVi.premise);
    expect(buildRetentionSnapshot([], 1, now, 'vi', [originalEn.premise]).dailyPrompt).toEqual(rotated);
  });

  it('resolves the newest canonical drama after every catalog prompt has been used', () => {
    const used: Array<{ id: string; premise: string }> = [];
    for (let index = 0; index < 10; index += 1) {
      const prompt = promptForUtcDay('2026-08-17', 'en', used);
      if (used.some((drama) => drama.premise === prompt.premise)) break;
      used.push({ id: `drama-${index}`, premise: prompt.premise });
    }

    const repeated = promptForUtcDay('2026-08-17', 'en', used);
    const original = used.find((drama) => drama.premise === repeated.premise)!;
    const newest = { id: 'drama-newest', premise: original.premise };

    expect(promptForUtcDay('2026-08-17', 'vi', [newest, ...used]).resumeDramaId).toBe(newest.id);
  });
});
