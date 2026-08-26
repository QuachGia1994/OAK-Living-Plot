import { describe, expect, it } from 'vitest';
import {
  creativeSceneRepairResponseSchema,
  creativeSceneResponseSchema,
  parseCreativeSceneProposal,
  parseCreativeSceneRepair,
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
      choice('A', 'Mở cửa', 'đối mặt', 'An nhìn thấy người lạ.'),
      choice('B', 'Gọi bảo vệ', 'cầu viện', 'Bảo vệ khóa tầng.'),
      choice('C', 'Rời lối sau', 'rút lui', 'Cả hai thoát xuống cầu thang.'),
    ],
  };
}

function choice(key: 'A' | 'B' | 'C', label: string, intent: string, consequence: string) {
  return {
    key,
    label,
    intent,
    consequence,
    factTextsToResolve: [],
    threadTitlesToResolve: [],
    threadsToOpen: [],
    nextTone: 'tense',
  };
}

describe('creative scene schema', () => {
  it('parses an ordered A/B/C proposal with consequence as branch truth', () => {
    const parsed = parseCreativeSceneProposal(JSON.stringify(creative()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.choices.map((item) => item.key)).toEqual(['A', 'B', 'C']);
    expect(parsed.value.choices[0].consequence).toBe('An nhìn thấy người lạ.');
  });

  it('keeps duplicate durableFact out of primary and repair provider contracts', () => {
    expect(JSON.stringify(creativeSceneResponseSchema)).not.toContain('durableFact');
    expect(JSON.stringify(creativeSceneRepairResponseSchema)).not.toContain('durableFact');
    expect(creativeSceneResponseSchema.properties.script.minLength).toBe(500);
    expect(creativeSceneResponseSchema.properties.script.maxLength).toBe(2400);
  });

  it('parses the same consequence-only choice contract for targeted repair', () => {
    const { script: _script, ...repair } = creative();
    void _script;
    expect(parseCreativeSceneRepair(JSON.stringify(repair)).ok).toBe(true);
  });

  it('rejects choices that are not ordered A/B/C exactly once', () => {
    const value = creative();
    value.choices[1] = { ...value.choices[1], key: 'A' };
    expect(parseCreativeSceneProposal(JSON.stringify(value)).ok).toBe(false);
  });

  it('rejects an extra legacy durableFact instead of creating a second branch-truth source', () => {
    const value = creative() as unknown as { choices: Array<Record<string, unknown>> };
    value.choices[0].durableFact = 'A duplicate branch fact.';
    expect(parseCreativeSceneProposal(JSON.stringify(value)).ok).toBe(false);
  });
});
