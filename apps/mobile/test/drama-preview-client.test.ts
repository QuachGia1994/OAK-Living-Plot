import { describe, expect, it } from 'vitest';
import { PreviewDramaExperienceClient, PreviewDramaState } from '../src/features/drama/preview-client';

describe('PreviewDramaExperienceClient', () => {
  it('exposes a resumable drama with one open branch and exactly three choices', async () => {
    const client = new PreviewDramaExperienceClient();
    const home = await client.loadHome();
    const drama = await client.loadDrama(home.recentDramas[0].id);

    expect(drama.currentScene.branch).toEqual({ state: 'open' });
    expect(drama.currentScene.choices.map((choice) => choice.key)).toEqual(['A', 'B', 'C']);
    expect(drama.leadCharacter).toMatchObject({ name: 'Mina', role: 'protagonist' });
  });

  it('creates scene one from the minimal setup', async () => {
    const client = new PreviewDramaExperienceClient();
    const drama = await client.createDrama({
      premise: 'A photographer sees the same stranger in every photo taken ten years apart.',
      mood: 'mysterious',
      characterName: 'Mai',
    });

    expect(drama.currentScene.number).toBe(1);
    expect(drama.currentScene.branch.state).toBe('open');
    expect(new Set(drama.currentScene.choices.map((choice) => choice.intent)).size).toBe(3);
  });

  it('requires a committed branch before the next scene', async () => {
    const client = new PreviewDramaExperienceClient();
    const drama = await client.createDrama({
      premise: 'A journalist receives a correction for an article she has not published yet.',
      mood: 'tense',
      characterName: 'Linh',
    });
    await expect(client.requestNextScene(drama.id)).rejects.toMatchObject({ code: 'choice_required' });
  });

  it('commits one branch idempotently and rejects a conflicting choice', async () => {
    const client = new PreviewDramaExperienceClient();
    const drama = await client.createDrama({
      premise: 'A violinist hears a melody that only plays before someone disappears.',
      mood: 'mysterious',
      characterName: 'An',
    });
    const [firstChoice, secondChoice] = drama.currentScene.choices;
    const firstCommit = await client.commitChoice(drama.id, drama.currentScene.id, firstChoice.id);
    const replay = await client.commitChoice(drama.id, drama.currentScene.id, firstChoice.id);

    expect(replay.currentScene.branch).toEqual(firstCommit.currentScene.branch);
    await expect(client.commitChoice(drama.id, drama.currentScene.id, secondChoice.id)).rejects.toMatchObject({ code: 'choice_conflict' });
  });

  it('makes the next scene start from the committed consequence', async () => {
    const client = new PreviewDramaExperienceClient();
    const drama = await client.createDrama({
      premise: 'A doctor finds a patient file bearing her own name and tomorrow’s date.',
      mood: 'tense',
      characterName: 'Vy',
    });
    const selected = drama.currentScene.choices[1];
    const committed = await client.commitChoice(drama.id, drama.currentScene.id, selected.id);
    const branch = committed.currentScene.branch;
    expect(branch.state).toBe('committed');
    if (branch.state !== 'committed') throw new Error('Expected committed branch.');

    const next = await client.requestNextScene(drama.id);
    expect(next.currentScene.number).toBe(2);
    expect(next.currentScene.script).toContain(branch.consequence);
    expect(next.currentScene.branch).toEqual({ state: 'open' });
  });

  it('archives dramas reversibly without mutating canonical history', async () => {
    const client = new PreviewDramaExperienceClient();
    const drama = await client.createDrama({
      premise: 'A stage actor receives tomorrow’s review before opening night begins.',
      mood: 'tense',
      characterName: 'Nhi',
    });
    const choice = drama.currentScene.choices[0];
    await client.commitChoice(drama.id, drama.currentScene.id, choice.id);
    await client.requestNextScene(drama.id);

    const history = await client.loadHistory(drama.id);
    expect(history.items[0]).toMatchObject({ branchState: 'committed', choiceKey: choice.key, consequence: choice.consequence });
    expect(history.items[1]).toMatchObject({ branchState: 'open' });

    await client.archiveDrama(drama.id);
    expect((await client.loadLibrary()).archived.some((item) => item.id === drama.id)).toBe(true);
    await expect(client.commitChoice(drama.id, (await client.loadDrama(drama.id)).currentScene.id, choice.id)).rejects.toMatchObject({ code: 'not_found' });

    await client.restoreDrama(drama.id);
    expect((await client.loadLibrary()).active.some((item) => item.id === drama.id)).toBe(true);
  });

  it('restores the current unresolved scene unchanged', async () => {
    const client = new PreviewDramaExperienceClient();
    const dramaId = (await client.loadHome()).recentDramas[0].id;
    const first = await client.loadDrama(dramaId);
    const resumed = await client.loadDrama(dramaId);
    expect(resumed.currentScene).toEqual(first.currentScene);
  });

  it('keeps the seeded drama fully Vietnamese for vi-VN', async () => {
    const client = new PreviewDramaExperienceClient('vi', 'vi-VN');
    const home = await client.loadHome();
    const drama = await client.loadDrama(home.recentDramas[0].id);
    expect(home.recentDramas[0]).toMatchObject({ title: 'Tin Nhắn Lúc Nửa Đêm', updatedLabel: 'Vừa xong' });
    expect(drama.currentScene.title).toBe('Giọng Nói Từ Ba Năm Trước');
    expect(drama.currentScene.choices[0].label).toContain('Mở cửa');
  });

  it('generates Vietnamese scenes and consequences when story locale is vi-VN', async () => {
    const client = new PreviewDramaExperienceClient('vi', 'vi-VN');
    const drama = await client.createDrama({
      premise: 'Một nhiếp ảnh gia nhìn thấy cùng một người lạ trong những bức ảnh cách nhau mười năm.',
      mood: 'mysterious',
      characterName: 'Mai',
    });
    expect(drama.currentScene.title).toBe('Bước Ngoặt Đầu Tiên');
    expect(drama.currentScene.choices[1].intent).toBe('điều tra trước');

    const committed = await client.commitChoice(drama.id, drama.currentScene.id, drama.currentScene.choices[1].id);
    const branch = committed.currentScene.branch;
    if (branch.state !== 'committed') throw new Error('Expected committed branch.');
    const next = await client.requestNextScene(drama.id);
    expect(next.currentScene.title).toBe('Hậu Quả Ập Đến');
    expect(next.currentScene.script).toContain(branch.consequence);
    expect(next.currentScene.summary).toContain('Cảnh 2');
  });

  it('preserves existing dramas and their original story locale across UI preference switches', async () => {
    const state = new PreviewDramaState();
    const english = new PreviewDramaExperienceClient('en', 'en-US', state);
    const created = await english.createDrama({
      premise: 'A singer hears tomorrow’s apology hidden inside tonight’s rehearsal recording.',
      mood: 'mysterious',
      characterName: 'June',
    });
    await english.commitChoice(created.id, created.currentScene.id, created.currentScene.choices[0].id);

    const vietnameseUi = new PreviewDramaExperienceClient('vi', 'vi-VN', state);
    expect((await vietnameseUi.loadHome()).recentDramas.some((drama) => drama.id === created.id)).toBe(true);
    const next = await vietnameseUi.requestNextScene(created.id);
    expect(next.currentScene.title).toBe('The Consequence Arrives');
    expect(next.currentScene.summary).toContain('Scene 2');
  });
});
