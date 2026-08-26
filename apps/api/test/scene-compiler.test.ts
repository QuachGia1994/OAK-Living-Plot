import { describe, expect, it } from 'vitest';
import type { CreativeSceneProposal } from '../src/ai/creative-scene-schema';
import { compileCreativeScene } from '../src/ai/scene-compiler';
import { makeGenerationInput } from './drama-fixtures';

function creative(): CreativeSceneProposal {
  return {
    title: 'Cánh cửa thứ hai',
    script: Array.from({ length: 135 }, (_, index) => `từ${index + 1}`).join(' '),
    summary: 'An và Linh nhận ra người gửi tin đang ở gần hơn họ tưởng.',
    beat: 'discovery',
    pacingRole: 'build',
    establishedFacts: ['Người gửi tin biết căn hộ hiện tại.'],
    threadsToOpen: [{ title: 'Ai đang đứng ngoài hành lang?', urgency: 90 }],
    threadTitlesToResolve: ['Linh nghi ngờ sự thành thật của An.'],
    choices: [
      choice('A', 'Người lạ đã nhìn thấy An trực tiếp.'),
      choice('B', 'Bảo vệ đã khóa tầng căn hộ.'),
      choice('C', 'An và Linh đã rời căn hộ qua lối sau.'),
    ],
  };
}

function choice(key: 'A' | 'B' | 'C', consequence: string) {
  return {
    key,
    label: `Lựa chọn ${key}`,
    intent: `ý định ${key}`,
    consequence,
    factTextsToResolve: ['An cố tình giấu một tin nhắn khỏi Linh.'],
    threadTitlesToResolve: ['Linh nghi ngờ sự thành thật của An.'],
    threadsToOpen: [],
    nextTone: 'tense',
  };
}

describe('compileCreativeScene', () => {
  it('uses consequence as the single durable branch fact and never invents relationship deltas', () => {
    const compiled = compileCreativeScene(makeGenerationInput(), creative());
    expect(compiled.choices.map((item) => item.stateDelta.factsToAdd)).toEqual([
      ['Người lạ đã nhìn thấy An trực tiếp.'],
      ['Bảo vệ đã khóa tầng căn hộ.'],
      ['An và Linh đã rời căn hộ qua lối sau.'],
    ]);
    expect(compiled.choices.every((item) => item.stateDelta.relationships.length === 0)).toBe(true);
  });

  it('maps fact and thread resolutions only by exact normalized text/title', () => {
    const compiled = compileCreativeScene(makeGenerationInput(), creative());
    expect(compiled.threadChanges.resolve).toEqual(['thread-trust']);
    for (const item of compiled.choices) {
      expect(item.stateDelta.factKeysToResolve).toEqual(['fact-hidden-message']);
      expect(item.stateDelta.threadKeysToResolve).toEqual(['thread-trust']);
    }
  });

  it('ignores unknown resolution hints instead of guessing canonical keys', () => {
    const proposal = creative();
    proposal.threadTitlesToResolve = ['Một bí ẩn hoàn toàn khác'];
    proposal.choices[0].factTextsToResolve = ['Một sự thật chưa từng tồn tại'];
    proposal.choices[0].threadTitlesToResolve = ['Một luồng chưa từng tồn tại'];
    const compiled = compileCreativeScene(makeGenerationInput(), proposal);
    expect(compiled.threadChanges.resolve).toEqual([]);
    expect(compiled.choices[0].stateDelta.factKeysToResolve).toEqual([]);
    expect(compiled.choices[0].stateDelta.threadKeysToResolve).toEqual([]);
  });

  it('drops ambiguous exact references instead of selecting an arbitrary canonical key', () => {
    const input = makeGenerationInput();
    input.activeFacts.push({ key: 'fact-hidden-message-duplicate', text: input.activeFacts[0]!.text });
    input.openThreads.push({ key: 'thread-trust-duplicate', title: input.openThreads[0]!.title, urgency: 50 });
    const compiled = compileCreativeScene(input, creative());
    expect(compiled.threadChanges.resolve).toEqual([]);
    expect(compiled.choices[0].stateDelta.factKeysToResolve).toEqual([]);
    expect(compiled.choices[0].stateDelta.threadKeysToResolve).toEqual([]);
  });

  it('keeps one-character branches durable using provider-authored consequences', () => {
    const input = makeGenerationInput();
    input.characters = [input.characters[0]!];
    input.relationships = [];
    const compiled = compileCreativeScene(input, creative());
    expect(compiled.choices.every((item) => item.stateDelta.relationships.length === 0)).toBe(true);
    expect(compiled.choices.every((item) => item.stateDelta.factsToAdd.length === 1)).toBe(true);
  });

  it('blocks exact resolved fact/thread resurrection from derived tombstone memory', () => {
    const input = makeGenerationInput();
    input.resolvedMemory = {
      facts: ['Người lạ đã nhìn thấy An trực tiếp.'],
      threads: ['Ai đang đứng ngoài hành lang?'],
    };
    const proposal = creative();
    proposal.establishedFacts = ['Người lạ đã nhìn thấy An trực tiếp.'];
    proposal.choices[0].threadsToOpen = [{ title: 'Ai đang đứng ngoài hành lang?', urgency: 95 }];
    const compiled = compileCreativeScene(input, proposal);
    expect(compiled.establishedFacts).toEqual([]);
    expect(compiled.threadChanges.open).toEqual([]);
    expect(compiled.choices[0].stateDelta.factsToAdd).toEqual([]);
    expect(compiled.choices[0].stateDelta.threadsToOpen).toEqual([]);
  });
});
