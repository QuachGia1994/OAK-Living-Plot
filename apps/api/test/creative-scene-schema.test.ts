import { describe, expect, it } from 'vitest';
import {
  parseCreativeSceneProposal,
  validateCreativeSceneSemantics,
  type CreativeSceneProposal,
} from '../src/ai/creative-scene-schema';

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
      choice('A', 'Mở cửa', 'đối mặt', 'An nhìn thấy người lạ.', 'Người lạ đã nhìn thấy An trực tiếp.'),
      choice('B', 'Gọi bảo vệ', 'cầu viện', 'Bảo vệ khóa tầng.', 'Tầng căn hộ bị khóa bởi bảo vệ.'),
      choice('C', 'Rời lối sau', 'rút lui', 'Cả hai thoát xuống cầu thang.', 'An và Linh rời căn hộ qua lối sau.'),
    ],
  };
}

function choice(
  key: 'A' | 'B' | 'C',
  label: string,
  intent: string,
  consequence: string,
  durableFact: string,
) {
  return {
    key,
    label,
    intent,
    consequence,
    durableFact,
    factTextsToResolve: [],
    threadTitlesToResolve: [],
    threadsToOpen: [],
    nextTone: 'tense',
  };
}

describe('creative scene schema', () => {
  it('parses an ordered A/B/C creative proposal with model-authored durable facts', () => {
    const parsed = parseCreativeSceneProposal(JSON.stringify(creative()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.choices.map((item) => item.key)).toEqual(['A', 'B', 'C']);
    expect(parsed.value.choices[0].durableFact).toContain('Người lạ');
  });

  it('rejects missing durable branch facts', () => {
    const value = creative() as unknown as { choices: Array<Record<string, unknown>> };
    delete value.choices[1].durableFact;
    const parsed = parseCreativeSceneProposal(JSON.stringify(value));
    expect(parsed.ok).toBe(false);
  });

  it('rejects choices that are not ordered A/B/C exactly once', () => {
    const value = creative();
    value.choices[1] = { ...value.choices[1], key: 'A' };
    const parsed = parseCreativeSceneProposal(JSON.stringify(value));
    expect(parsed.ok).toBe(false);
  });

  it('rejects placeholder or consequence-unsupported durable facts before canonical compilation', () => {
    const placeholder = creative();
    placeholder.choices[0].durableFact = 'Branch A creates a distinct immediate consequence.';
    expect(validateCreativeSceneSemantics(placeholder)).toContain(
      'Choice A durableFact is too generic to become canonical story state.',
    );

    const unsupported = creative();
    unsupported.choices[1].durableFact = 'Một con tàu bí mật rời cảng lúc bình minh.';
    expect(validateCreativeSceneSemantics(unsupported)).toContain(
      'Choice B durableFact is not supported by its consequence.',
    );
  });
});
