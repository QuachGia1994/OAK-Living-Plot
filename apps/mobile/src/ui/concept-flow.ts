export type ConceptFlowLocale = 'en' | 'vi';

export type ConceptFlowStepId =
  | 'world'
  | 'scene'
  | 'choice'
  | 'consequence'
  | 'cast'
  | 'timeline';

export interface ConceptFlowStep {
  id: ConceptFlowStepId;
  number: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  kicker: string;
  description: string;
}

const STEP_IDS: readonly ConceptFlowStepId[] = [
  'world',
  'scene',
  'choice',
  'consequence',
  'cast',
  'timeline',
];

const COPY: Record<ConceptFlowLocale, Record<ConceptFlowStepId, Omit<ConceptFlowStep, 'id' | 'number'>>> = {
  en: {
    world: {
      label: 'Create world',
      kicker: 'CREATE WORLD',
      description: 'Shape the spark, lead and dramatic mood.',
    },
    scene: {
      label: 'Write scene',
      kicker: 'WRITE SCENE',
      description: 'Turn the current canon into the next playable scene.',
    },
    choice: {
      label: 'Choose',
      kicker: 'CHOOSE',
      description: 'Direct the turn that becomes the canonical branch.',
    },
    consequence: {
      label: 'Consequence',
      kicker: 'SEE CONSEQUENCE',
      description: 'See the immediate fallout your committed choice created.',
    },
    cast: {
      label: 'Living cast',
      kicker: 'LIVING CAST',
      description: 'Watch the cast carry what the story now remembers.',
    },
    timeline: {
      label: 'Timeline',
      kicker: 'TIMELINE',
      description: 'Review the scenes, branches and consequences that led here.',
    },
  },
  vi: {
    world: {
      label: 'Tạo thế giới',
      kicker: 'TẠO THẾ GIỚI',
      description: 'Định hình mầm drama, nhân vật chính và không khí.',
    },
    scene: {
      label: 'Viết cảnh',
      kicker: 'VIẾT CẢNH',
      description: 'Biến trạng thái chuẩn hiện tại thành cảnh có thể tương tác tiếp theo.',
    },
    choice: {
      label: 'Lựa chọn',
      kicker: 'LỰA CHỌN',
      description: 'Chỉ đạo bước ngoặt sẽ trở thành nhánh chuẩn.',
    },
    consequence: {
      label: 'Hệ quả',
      kicker: 'XEM HỆ QUẢ',
      description: 'Xem hậu quả tức thời do lựa chọn đã chốt tạo ra.',
    },
    cast: {
      label: 'Nhân vật sống',
      kicker: 'NHÂN VẬT SỐNG',
      description: 'Xem dàn nhân vật mang theo những gì câu chuyện đang ghi nhớ.',
    },
    timeline: {
      label: 'Dòng lịch sử',
      kicker: 'DÒNG LỊCH SỬ',
      description: 'Xem lại các cảnh, nhánh và hệ quả đã dẫn đến đây.',
    },
  },
};

export function conceptFlowSteps(locale: ConceptFlowLocale): ConceptFlowStep[] {
  return STEP_IDS.map((id, index) => ({
    id,
    number: (index + 1) as ConceptFlowStep['number'],
    ...COPY[locale][id],
  }));
}

export function conceptFlowLabels(locale: ConceptFlowLocale): string[] {
  return conceptFlowSteps(locale).map((step) => step.label);
}

export function conceptFlowStep(locale: ConceptFlowLocale, id: ConceptFlowStepId): ConceptFlowStep {
  const index = STEP_IDS.indexOf(id);
  return {
    id,
    number: (index + 1) as ConceptFlowStep['number'],
    ...COPY[locale][id],
  };
}
