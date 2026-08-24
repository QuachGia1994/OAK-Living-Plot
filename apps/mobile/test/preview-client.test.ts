import { describe, expect, it } from 'vitest';
import type { DramaExperienceClient } from '../src/features/drama/contracts';
import { PreviewDramaExperienceClient, PreviewDramaState } from '../src/features/drama/preview-client';

describe('preview drama client', () => {
  it('rotates the suggested new drama after that premise has already been created', async () => {
    const state = new PreviewDramaState();
    const client = new PreviewDramaExperienceClient('vi', 'vi-VN', state);
    const firstHome = await client.loadHome();
    const prompt = firstHome.retention.dailyPrompt;

    const created = await client.createDrama({
      premise: prompt.premise,
      mood: prompt.mood,
      characterName: prompt.characterName,
    });
    await client.archiveDrama(created.id);

    const nextHome = await client.loadHome();
    expect(nextHome.retention.dailyPrompt.premise).not.toBe(prompt.premise);
  });

  it('replays the same preview creation key without creating a duplicate drama', async () => {
    const state = new PreviewDramaState();
    const client: DramaExperienceClient = new PreviewDramaExperienceClient('vi', 'vi-VN', state);
    const draft = { premise: 'Một bí mật gia đình buộc Linh phải chọn giữa sự thật và lòng trung thành.', mood: 'tense' as const, characterName: 'Linh' };

    const first = await client.createDrama(draft, 'creation-stable');
    const replay = await client.createDrama(draft, 'creation-stable');

    expect(replay.id).toBe(first.id);
    expect((await client.loadLibrary()).active.filter((drama) => drama.premise === draft.premise)).toHaveLength(1);
  });

  it('returns the existing canonical preview drama after all daily prompts are used', async () => {
    const state = new PreviewDramaState();
    const client: DramaExperienceClient = new PreviewDramaExperienceClient('vi', 'vi-VN', state);
    const promptDramaIds = new Map<string, string>();

    for (let index = 0; index < 10; index += 1) {
      const prompt = (await client.loadHome()).retention.dailyPrompt;
      if (promptDramaIds.has(prompt.premise)) break;
      const drama = await client.createDrama(prompt, `creation-daily-${index}`);
      promptDramaIds.set(prompt.premise, drama.id);
    }

    const repeated = (await client.loadHome()).retention.dailyPrompt;
    expect(repeated.resumeDramaId).toBe(promptDramaIds.get(repeated.premise));
  });

  it('replays preview suggestions by request key without creating or mutating canonical drama state', async () => {
    const state = new PreviewDramaState();
    const client: DramaExperienceClient = new PreviewDramaExperienceClient('vi', 'vi-VN', state);
    const beforeHome = await client.loadHome();
    const beforeLibrary = await client.loadLibrary();
    const beforeCount = state.createdDramaCount;

    const input = { mood: 'mysterious' as const, characterName: 'Mina', inspiration: 'Một cuộc gọi đến từ người đã biến mất.' };
    const first = await client.suggestDramaSeeds(input, 'suggestion-preview-001');
    const replay = await client.suggestDramaSeeds(input, 'suggestion-preview-001');

    expect(first).toHaveLength(3);
    expect(replay).toEqual(first);
    expect(state.createdDramaCount).toBe(beforeCount);
    expect(await client.loadLibrary()).toEqual(beforeLibrary);
    expect((await client.loadHome()).recentDramas).toEqual(beforeHome.recentDramas);
    expect(first.every((suggestion) => suggestion.premise.includes('?'))).toBe(true);
  });

  it('keeps suggestion request-key fingerprints isolated from changed inputs', async () => {
    const client: DramaExperienceClient = new PreviewDramaExperienceClient('en', 'en-US', new PreviewDramaState());
    await client.suggestDramaSeeds({ mood: 'tense', inspiration: 'A family secret surfaces.' }, 'suggestion-preview-conflict');
    await expect(client.suggestDramaSeeds({ mood: 'hopeful', inspiration: 'A second chance arrives.' }, 'suggestion-preview-conflict'))
      .rejects.toMatchObject({ code: 'suggestion_conflict' });
  });

  it('ignores a one-character partial input name and still returns valid 2–50 character names', async () => {
    const client: DramaExperienceClient = new PreviewDramaExperienceClient('en', 'en-US', new PreviewDramaState());
    const suggestions = await client.suggestDramaSeeds({ mood: 'mysterious', characterName: 'M' }, 'suggestion-preview-short-name');
    expect(suggestions.every((suggestion) => suggestion.characterName.length >= 2 && suggestion.characterName.length <= 50)).toBe(true);
  });

  it('uses the saved story locale for preview suggestion content', async () => {
    const client: DramaExperienceClient = new PreviewDramaExperienceClient('en', 'vi-VN', new PreviewDramaState());
    const suggestions = await client.suggestDramaSeeds({ mood: 'romantic' }, 'suggestion-preview-vi');
    expect(suggestions[0].premise).toContain('phải');
    expect(suggestions[0].label).toMatch(/[À-ỹ]|Cuộc|Lời|Căn/u);
  });

  it('truncates preview inspiration by Unicode code point without splitting emoji', async () => {
    const client: DramaExperienceClient = new PreviewDramaExperienceClient('en', 'en-US', new PreviewDramaState());
    const longInspiration = `${'a'.repeat(68)}😀${'b'.repeat(10)}`;
    const longBatch = await client.suggestDramaSeeds(
      { mood: 'mysterious', inspiration: longInspiration },
      'suggestion-preview-unicode-long',
    );
    const longPremise = longBatch[0].premise;

    expect(longPremise).toContain(`Building from “${'a'.repeat(68)}😀…”,`);
    expect(Array.from(longPremise).some((character) => {
      const code = character.codePointAt(0)!;
      return character.length === 1 && code >= 0xD800 && code <= 0xDFFF;
    })).toBe(false);

    const shortInspiration = 'short 😀 seed';
    const shortBatch = await client.suggestDramaSeeds(
      { mood: 'hopeful', inspiration: shortInspiration },
      'suggestion-preview-unicode-short',
    );
    expect(shortBatch[0].premise).toContain(`Building from “${shortInspiration}”,`);
  });
});
