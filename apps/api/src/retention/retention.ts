import type { DramaDailyPrompt, DramaRetention } from '../drama-runtime/contracts';
import type { UiLocale } from '../preferences/contracts';

export interface RetentionActivityDay {
  utcDay: string;
  choicesMade: number;
}

interface LocalizedDailyPrompt {
  label: Record<UiLocale, string>;
  premise: Record<UiLocale, string>;
  mood: DramaDailyPrompt['mood'];
  characterName: string;
}

const DAILY_PROMPTS: readonly LocalizedDailyPrompt[] = [
  {
    label: { en: 'A message at the wrong time', vi: 'Tin nhắn sai thời điểm' },
    premise: {
      en: 'A voice note arrives from someone who should have no way to contact you, and it contains one detail only you would recognize.',
      vi: 'Một tin nhắn thoại đến từ người lẽ ra không thể liên lạc với bạn, và nó chứa một chi tiết chỉ bạn mới nhận ra.',
    },
    mood: 'mysterious',
    characterName: 'Mina',
  },
  {
    label: { en: 'One seat left', vi: 'Chỉ còn một chỗ trống' },
    premise: {
      en: 'At a wedding dinner, the only empty seat is beside the person you promised yourself you would never speak to again.',
      vi: 'Trong bữa tiệc cưới, chỗ trống duy nhất nằm cạnh người mà bạn từng tự hứa sẽ không bao giờ nói chuyện lại.',
    },
    mood: 'romantic',
    characterName: 'Kai',
  },
  {
    label: { en: 'The favor comes due', vi: 'Đến lúc trả món nợ ân tình' },
    premise: {
      en: 'A friend who once saved your career asks for one favor that could destroy somebody else’s life.',
      vi: 'Một người bạn từng cứu sự nghiệp của bạn nhờ một việc có thể phá hủy cuộc đời của người khác.',
    },
    mood: 'tense',
    characterName: 'Noah',
  },
  {
    label: { en: 'The room behind the wall', vi: 'Căn phòng sau bức tường' },
    premise: {
      en: 'Renovation work reveals a sealed room in your childhood home, and your name is written on the inside of the door.',
      vi: 'Việc sửa nhà làm lộ một căn phòng bị niêm kín trong ngôi nhà thời thơ ấu, và tên bạn được viết ở mặt trong cánh cửa.',
    },
    mood: 'mysterious',
    characterName: 'Linh',
  },
  {
    label: { en: 'A second chance with a cost', vi: 'Cơ hội thứ hai có cái giá' },
    premise: {
      en: 'You are offered the exact opportunity you lost years ago, but accepting it means leaving one person behind tonight.',
      vi: 'Bạn được trao lại đúng cơ hội đã đánh mất nhiều năm trước, nhưng nhận nó đồng nghĩa phải bỏ lại một người ngay tối nay.',
    },
    mood: 'hopeful',
    characterName: 'Ari',
  },
] as const;

export function buildRetentionSnapshot(
  days: readonly RetentionActivityDay[],
  activeDramas: number,
  nowMs: number,
  uiLocale: UiLocale = 'en',
  usedPremises: readonly string[] = [],
): DramaRetention {
  const normalized = [...days]
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/u.test(day.utcDay) && Number.isInteger(day.choicesMade) && day.choicesMade > 0)
    .sort((left, right) => right.utcDay.localeCompare(left.utcDay));
  const utcDay = new Date(nowMs).toISOString().slice(0, 10);
  return {
    currentStreakDays: currentStreak(normalized.map((day) => day.utcDay), utcDay),
    choicesMade: normalized.reduce((total, day) => total + day.choicesMade, 0),
    activeDramas,
    dailyPrompt: promptForUtcDay(utcDay, uiLocale, usedPremises),
  };
}

export function promptForUtcDay(
  utcDay: string,
  uiLocale: UiLocale = 'en',
  usedPremises: readonly string[] = [],
): DramaDailyPrompt {
  const startIndex = hash(utcDay) % DAILY_PROMPTS.length;
  const used = new Set(usedPremises.map(normalizePromptText).filter(Boolean));
  let prompt = DAILY_PROMPTS[startIndex]!;
  for (let offset = 0; offset < DAILY_PROMPTS.length; offset += 1) {
    const candidate = DAILY_PROMPTS[(startIndex + offset) % DAILY_PROMPTS.length]!;
    const alreadyUsed = Object.values(candidate.premise).some((premise) => used.has(normalizePromptText(premise)));
    if (!alreadyUsed) {
      prompt = candidate;
      break;
    }
  }
  return {
    label: prompt.label[uiLocale],
    premise: prompt.premise[uiLocale],
    mood: prompt.mood,
    characterName: prompt.characterName,
  };
}

function normalizePromptText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
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
