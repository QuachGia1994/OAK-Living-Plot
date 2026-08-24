import { describe, expect, it } from 'vitest';
import { dailyPromptAction, dailyPromptPresentation } from '../src/features/drama/daily-prompt-action';
import type { DramaSummary } from '../src/features/drama/contracts';

const prompt = {
  label: 'Căn phòng sau bức tường',
  premise: 'Việc sửa nhà làm lộ một căn phòng bị niêm kín.',
  mood: 'mysterious' as const,
  characterName: 'Linh',
};

describe('daily prompt action', () => {
  it('resumes the canonical drama when the server resolved an existing prompt', () => {
    expect(dailyPromptAction({ ...prompt, resumeDramaId: 'drama-current' })).toEqual({
      kind: 'resume',
      dramaId: 'drama-current',
    });
  });

  it('opens a new setup only for an unused prompt', () => {
    expect(dailyPromptAction(prompt)).toEqual({
      kind: 'create',
      draft: { premise: prompt.premise, mood: prompt.mood, characterName: prompt.characterName },
    });
  });

  it('keeps hidden resume targets classified as resume presentation instead of new drama', () => {
    const hidden = dailyPromptPresentation({ ...prompt, resumeDramaId: 'drama-hidden' }, []);
    expect(hidden).toMatchObject({
      mode: 'resume-generic',
      action: { kind: 'resume', dramaId: 'drama-hidden' },
      drama: null,
    });

    const create = dailyPromptPresentation(prompt, []);
    expect(create).toMatchObject({ mode: 'create', action: { kind: 'create' }, drama: null });

    const knownDrama: DramaSummary = {
      id: 'drama-hidden',
      sceneId: 'scene-4',
      title: 'Known daily drama',
      premise: prompt.premise,
      mood: prompt.mood,
      characterName: prompt.characterName,
      updatedLabel: '1d ago',
      sceneNumber: 4,
      status: 'awaiting_choice',
      resumeLine: 'Previously: the sealed room opened.',
    };
    const known = dailyPromptPresentation({ ...prompt, resumeDramaId: knownDrama.id }, [knownDrama]);
    expect(known).toMatchObject({
      mode: 'resume-known',
      action: { kind: 'resume', dramaId: knownDrama.id },
      drama: knownDrama,
    });
  });
});
