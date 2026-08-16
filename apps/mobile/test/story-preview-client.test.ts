import { describe, expect, it } from 'vitest';
import { PreviewStoryExperienceClient } from '../src/features/story/preview-client';

describe('PreviewStoryExperienceClient', () => {
  it('exposes a resumable recent plot with exactly three choices', async () => {
    const client = new PreviewStoryExperienceClient();
    const home = await client.loadHome();
    const recent = home.recentPlots[0];
    const plot = await client.loadPlot(recent.id);

    expect(plot.episode.status).toBe('awaiting_choice');
    expect(plot.episode.choices).toHaveLength(3);
    expect(plot.episode.choices.map((choice) => choice.key)).toEqual(['A', 'B', 'C']);
  });

  it('creates episode one from the minimal setup with exactly three actions', async () => {
    const client = new PreviewStoryExperienceClient();
    const plot = await client.createPlot({
      premise: 'A photographer sees the same stranger in every photo taken ten years apart.',
      mood: 'mysterious',
      characterName: 'Mai',
    });

    expect(plot.episode.number).toBe(1);
    expect(plot.episode.status).toBe('awaiting_choice');
    expect(plot.episode.choices).toHaveLength(3);
    expect(new Set(plot.episode.choices.map((choice) => choice.intent)).size).toBe(3);
  });

  it('requires a committed choice before the next episode', async () => {
    const client = new PreviewStoryExperienceClient();
    const plot = await client.createPlot({
      premise: 'A journalist receives a correction for an article she has not published yet.',
      mood: 'tense',
      characterName: 'Linh',
    });

    await expect(client.requestNextEpisode(plot.id)).rejects.toMatchObject({
      code: 'choice_required',
    });
  });

  it('replays the same committed choice idempotently and rejects a conflicting choice', async () => {
    const client = new PreviewStoryExperienceClient();
    const plot = await client.createPlot({
      premise: 'A violinist hears a melody that only plays before someone disappears.',
      mood: 'mysterious',
      characterName: 'An',
    });
    const [firstChoice, secondChoice] = plot.episode.choices;

    const firstCommit = await client.commitChoice(plot.id, plot.episode.id, firstChoice.id);
    const replay = await client.commitChoice(plot.id, plot.episode.id, firstChoice.id);

    expect(replay.episode.committedChoiceId).toBe(firstCommit.episode.committedChoiceId);
    expect(replay.episode.committedConsequence).toBe(firstCommit.episode.committedConsequence);
    await expect(client.commitChoice(plot.id, plot.episode.id, secondChoice.id)).rejects.toMatchObject({
      code: 'choice_conflict',
    });
  });

  it('makes episode two visibly reflect the committed consequence', async () => {
    const client = new PreviewStoryExperienceClient();
    const plot = await client.createPlot({
      premise: 'A doctor finds a patient file bearing her own name and tomorrow’s date.',
      mood: 'tense',
      characterName: 'Vy',
    });
    const selected = plot.episode.choices[1];
    const committed = await client.commitChoice(plot.id, plot.episode.id, selected.id);
    const next = await client.requestNextEpisode(plot.id);

    expect(committed.episode.committedConsequence).toBe(selected.consequence);
    expect(next.episode.number).toBe(2);
    expect(next.episode.body).toContain(selected.consequence);
    expect(next.episode.choices).toHaveLength(3);
  });

  it('resume returns the current unresolved episode unchanged', async () => {
    const client = new PreviewStoryExperienceClient();
    const home = await client.loadHome();
    const plotId = home.recentPlots[0].id;

    const first = await client.loadPlot(plotId);
    const resumed = await client.loadPlot(plotId);

    expect(resumed.episode.id).toBe(first.episode.id);
    expect(resumed.episode.status).toBe('awaiting_choice');
    expect(resumed.episode.choices).toEqual(first.episode.choices);
  });
});
