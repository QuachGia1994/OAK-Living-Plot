import { describe, expect, it } from 'vitest';
import { conceptFlowLabels, conceptFlowStep, conceptFlowSteps } from '../src/ui/concept-flow';

describe('concept flow', () => {
  it('keeps the approved six-stage order and stable numbering', () => {
    const steps = conceptFlowSteps('en');

    expect(steps.map((step) => step.id)).toEqual([
      'world',
      'scene',
      'choice',
      'consequence',
      'cast',
      'timeline',
    ]);
    expect(steps.map((step) => step.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(steps.map((step) => step.description)).size).toBe(6);
  });

  it('localizes labels without changing stage identity', () => {
    expect(conceptFlowLabels('vi')).toEqual([
      'Tạo thế giới',
      'Viết cảnh',
      'Lựa chọn',
      'Hệ quả',
      'Nhân vật sống',
      'Dòng lịch sử',
    ]);
    expect(conceptFlowStep('vi', 'cast')).toMatchObject({ id: 'cast', number: 5, kicker: 'NHÂN VẬT SỐNG' });
  });
});
