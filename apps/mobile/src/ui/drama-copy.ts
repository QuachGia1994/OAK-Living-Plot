import type { UiLocale } from '@/features/preferences/contracts';

export interface DramaVisualCopy {
  emptyKicker: string;
  composerLead: string;
  composerFallbackScene: string;
  sceneAdvanceHint: string;
  sceneFinalHint: string;
  sceneAdvanceCue: string;
  sceneEndCue: string;
  generationKicker: string;
  loadingDefaultDetail: string;
  consequenceKicker: string;
  consequenceHeadline: string;
  sceneProgress: (current: number, total: number) => string;
  choiceAccessibility: (key: string, label: string) => string;
}

export function dramaVisualCopyFor(locale: UiLocale): DramaVisualCopy {
  if (locale === 'vi') {
    return {
      emptyKicker: 'CẢNH TIẾP THEO CỦA BẠN',
      composerLead: 'NHÂN VẬT CỦA BẠN',
      composerFallbackScene: 'Một khoảnh khắc căng thẳng trước lựa chọn đầu tiên.',
      sceneAdvanceHint: 'Chuyển sang nhịp phụ đề tiếp theo',
      sceneFinalHint: 'Đây là nhịp phụ đề cuối của cảnh',
    sceneAdvanceCue: 'CHẠM CẢNH ĐỂ TIẾP TỤC',
    sceneEndCue: 'HẾT CẢNH',
    generationKicker: 'ĐANG DỰNG DRAMA CỦA BẠN',
      loadingDefaultDetail: 'Đang dựng lại cảnh mới nhất và lựa chọn gần nhất của bạn.',
      consequenceKicker: 'CỐT TRUYỆN RẼ HƯỚNG',
      consequenceHeadline: 'Lựa chọn của bạn đã thay đổi cảnh tiếp theo.',
      sceneProgress: (current, total) => `Nhịp cảnh ${current} trên ${total}`,
      choiceAccessibility: (key, label) => `Lựa chọn ${key}: ${label}`,
    };
  }

  return {
    emptyKicker: 'YOUR NEXT SCENE',
    composerLead: 'YOUR LEAD',
    composerFallbackScene: 'A charged moment before the first choice.',
    sceneAdvanceHint: 'Advances to the next subtitle beat',
    sceneFinalHint: 'This is the final subtitle beat',
    sceneAdvanceCue: 'TAP SCENE TO ADVANCE',
    sceneEndCue: 'END OF SCENE',
    generationKicker: 'DIRECTING YOUR DRAMA',
    loadingDefaultDetail: 'Framing the latest scene and restoring your last decision.',
    consequenceKicker: 'THE STORY BENDS',
    consequenceHeadline: 'Your choice changed the next scene.',
    sceneProgress: (current, total) => `Scene beat ${current} of ${total}`,
    choiceAccessibility: (key, label) => `Choice ${key}: ${label}`,
  };
}
