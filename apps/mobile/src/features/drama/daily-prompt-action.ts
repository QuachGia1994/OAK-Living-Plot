import type { DailyDramaPrompt, DramaDraft, DramaSummary } from './contracts';

export type DailyPromptAction =
  | { kind: 'resume'; dramaId: string }
  | { kind: 'create'; draft: DramaDraft };

export function dailyPromptAction(prompt: DailyDramaPrompt): DailyPromptAction {
  if (prompt.resumeDramaId) return { kind: 'resume', dramaId: prompt.resumeDramaId };
  return {
    kind: 'create',
    draft: { premise: prompt.premise, mood: prompt.mood, characterName: prompt.characterName },
  };
}

export type DailyPromptPresentation = {
  action: DailyPromptAction;
  mode: 'create' | 'resume-generic' | 'resume-known';
  drama: DramaSummary | null;
};

export function dailyPromptPresentation(
  prompt: DailyDramaPrompt,
  recentDramas: readonly DramaSummary[],
): DailyPromptPresentation {
  const action = dailyPromptAction(prompt);
  if (action.kind === 'create') return { action, mode: 'create', drama: null };
  const drama = recentDramas.find((candidate) => candidate.id === action.dramaId) ?? null;
  return { action, mode: drama ? 'resume-known' : 'resume-generic', drama };
}
