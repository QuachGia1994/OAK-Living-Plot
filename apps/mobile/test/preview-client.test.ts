import { describe, expect, it } from 'vitest';
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
});
