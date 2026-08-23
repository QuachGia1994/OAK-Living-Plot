import { describe, expect, it } from 'vitest';
import {
  creativeSceneRepairResponseSchema,
  creativeSceneResponseSchema,
  parseCreativeSceneProposal,
  parseCreativeSceneRepair,
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

  it('keeps durableFact required in both provider schemas', () => {
    const primaryText = JSON.stringify(creativeSceneResponseSchema);
    const repairText = JSON.stringify(creativeSceneRepairResponseSchema);
    expect(primaryText).toContain('"durableFact"');
    expect(repairText).toContain('"durableFact"');
    const primaryChoice = creativeSceneResponseSchema.properties.choices.items;
    const repairChoice = creativeSceneRepairResponseSchema.properties.choices.items;
    expect(primaryChoice.required).toContain('durableFact');
    expect(repairChoice.required).toContain('durableFact');
    expect(primaryChoice.properties.durableFact.minLength).toBe(1);
    expect(repairChoice.properties.durableFact.minLength).toBe(1);
    expect(creativeSceneResponseSchema.properties.script.minLength).toBe(500);
    expect(creativeSceneResponseSchema.properties.script.maxLength).toBe(2400);
  });

  it('tolerates a missing primary durable fact only as an incomplete repairable draft and never invents one', () => {
    const value = creative() as unknown as { choices: Array<Record<string, unknown>> };
    delete value.choices[1].durableFact;
    const parsed = parseCreativeSceneProposal(JSON.stringify(value));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.choices[1].durableFact).toBe('');
    expect(validateCreativeSceneSemantics(parsed.value)).toContain(
      'Choice B durableFact is missing provider-authored story material.',
    );
  });

  it('requires provider-authored durable facts in targeted repair responses', () => {
    const value = creative() as unknown as { script?: string; choices: Array<Record<string, unknown>> };
    delete value.script;
    delete value.choices[1].durableFact;
    expect(parseCreativeSceneRepair(JSON.stringify(value)).ok).toBe(false);
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

  it('rejects duplicate branch facts instead of rewriting them from labels or consequences', () => {
    const value = creative();
    value.choices[2].durableFact = value.choices[0].durableFact;
    expect(validateCreativeSceneSemantics(value)).toContain(
      'Creative durable facts must be branch-specific and distinct.',
    );
  });

  it('allows shared character/topic context when branch predicates remain materially different', () => {
    const value = creative();
    value.choices[0].consequence = 'An tiết lộ toàn bộ sự thật về tin nhắn.';
    value.choices[0].durableFact = 'An đã nói rõ về tin nhắn mà An đã giấu.';
    value.choices[1].consequence = 'An từ chối nói toàn bộ sự thật về tin nhắn.';
    value.choices[1].durableFact = 'An đã từ chối nói rõ về tin nhắn mà An đã giấu.';
    value.choices[2].consequence = 'An đề nghị Linh tìm hiểu thêm về tin nhắn.';
    value.choices[2].durableFact = 'An đã đề nghị Linh tìm hiểu thêm về tin nhắn.';

    expect(validateCreativeSceneSemantics(value)).toEqual([]);
  });
});
