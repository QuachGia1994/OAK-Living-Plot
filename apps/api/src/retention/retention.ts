import type { LiveStoryDailyPrompt, LiveStoryRetention } from '../live-story/contracts';

export interface RetentionActivityDay {
  utcDay: string;
  choicesMade: number;
}

const DAILY_PROMPTS: readonly LiveStoryDailyPrompt[] = [
  {
    label: 'A message at the wrong time',
    premise: 'A voice note arrives from someone who should have no way to contact you, and it contains one detail only you would recognize.',
    mood: 'mysterious',
    characterName: 'Mina',
  },
  {
    label: 'One seat left',
    premise: 'At a wedding dinner, the only empty seat is beside the person you promised yourself you would never speak to again.',
    mood: 'romantic',
    characterName: 'Kai',
  },
  {
    label: 'The favor comes due',
    premise: 'A friend who once saved your career asks for one favor that could destroy somebody else’s life.',
    mood: 'tense',
    characterName: 'Noah',
  },
  {
    label: 'The room behind the wall',
    premise: 'Renovation work reveals a sealed room in your childhood home, and your name is written on the inside of the door.',
    mood: 'mysterious',
    characterName: 'Linh',
  },
  {
    label: 'A second chance with a cost',
    premise: 'You are offered the exact opportunity you lost years ago, but accepting it means leaving one person behind tonight.',
    mood: 'hopeful',
    characterName: 'Ari',
  },
] as const;

export function buildRetentionSnapshot(
  days: readonly RetentionActivityDay[],
  activePlots: number,
  nowMs: number,
): LiveStoryRetention {
  const normalized = [...days]
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/u.test(day.utcDay) && Number.isInteger(day.choicesMade) && day.choicesMade > 0)
    .sort((left, right) => right.utcDay.localeCompare(left.utcDay));
  const utcDay = new Date(nowMs).toISOString().slice(0, 10);
  return {
    currentStreakDays: currentStreak(normalized.map((day) => day.utcDay), utcDay),
    choicesMade: normalized.reduce((total, day) => total + day.choicesMade, 0),
    activePlots,
    dailyPrompt: promptForUtcDay(utcDay),
  };
}

export function promptForUtcDay(utcDay: string): LiveStoryDailyPrompt {
  const index = hash(utcDay) % DAILY_PROMPTS.length;
  return DAILY_PROMPTS[index];
}

function currentStreak(days: readonly string[], today: string): number {
  if (days.length === 0) return 0;
  const unique = [...new Set(days)].sort((left, right) => right.localeCompare(left));
  const yesterday = addUtcDays(today, -1);
  if (unique[0] !== today && unique[0] !== yesterday) return 0;

  let expected = unique[0];
  let streak = 0;
  for (const day of unique) {
    if (day !== expected) break;
    streak += 1;
    expected = addUtcDays(expected, -1);
  }
  return streak;
}

function addUtcDays(utcDay: string, delta: number): string {
  const date = new Date(`${utcDay}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function hash(value: string): number {
  let result = 0;
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0;
  return result;
}
