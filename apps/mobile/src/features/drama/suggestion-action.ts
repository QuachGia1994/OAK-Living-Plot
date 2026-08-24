import { DramaClientError, type DramaDraft, type DramaSeedSuggestion, type DramaSeedSuggestionBatch, type DramaSeedSuggestionInput } from './contracts';

export interface SuggestionPanelState {
  requestId: number | null;
  loading: boolean;
  suggestions: DramaSeedSuggestionBatch | null;
  error: string | null;
}

export const initialSuggestionPanelState: SuggestionPanelState = {
  requestId: null,
  loading: false,
  suggestions: null,
  error: null,
};

export class SuggestionSingleFlight {
  private running = false;

  get active(): boolean { return this.running; }

  tryBegin(): boolean {
    if (this.running) return false;
    this.running = true;
    return true;
  }

  end(): void {
    this.running = false;
  }
}

export function beginSuggestionRequest(state: SuggestionPanelState, requestId: number): SuggestionPanelState {
  return { ...state, requestId, loading: true, error: null };
}

export function completeSuggestionRequest(
  state: SuggestionPanelState,
  requestId: number,
  suggestions: DramaSeedSuggestionBatch,
): SuggestionPanelState {
  if (state.requestId !== requestId) return state;
  return { requestId, loading: false, suggestions, error: null };
}

export function failSuggestionRequest(state: SuggestionPanelState, requestId: number, error: string): SuggestionPanelState {
  if (state.requestId !== requestId) return state;
  return { ...state, loading: false, error };
}

export function applyDramaSeedSuggestion(_current: DramaDraft, suggestion: DramaSeedSuggestion): DramaDraft {
  return {
    premise: suggestion.premise,
    mood: suggestion.mood,
    characterName: suggestion.characterName,
  };
}

export function buildSuggestionInput(draft: DramaDraft): DramaSeedSuggestionInput {
  const inspiration = normalizeOptional(draft.premise);
  const characterName = normalizeOptional(draft.characterName);
  return {
    mood: draft.mood,
    ...(characterName.length >= 2 && characterName.length <= 50 ? { characterName } : {}),
    ...(inspiration ? { inspiration } : {}),
  };
}

export function suggestionInputFingerprint(input: DramaSeedSuggestionInput): string {
  return JSON.stringify({
    mood: input.mood,
    characterName: normalizeOptional(input.characterName ?? '') || null,
    inspiration: normalizeOptional(input.inspiration ?? '') || null,
  });
}

export function shouldClearSuggestionAttempt(error: unknown): boolean {
  return error instanceof DramaClientError
    && (error.code === 'invalid_input' || error.code === 'suggestion_conflict' || error.code === 'invalid_suggestion_response');
}

export function suggestionErrorMessage(error: unknown, locale: 'en' | 'vi'): string {
  const vi = locale === 'vi';
  if (!(error instanceof DramaClientError)) {
    return vi
      ? 'Không thể lấy gợi ý lúc này. Mầm drama hiện tại vẫn được giữ nguyên.'
      : 'Suggestions are unavailable right now. Your current drama spark is unchanged.';
  }
  if (error.code === 'auth_required') return vi ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để dùng gợi ý AI.' : 'Your session expired. Sign in again to use AI suggestions.';
  if (error.code === 'suggestion_unavailable') return vi ? 'Máy chủ này chưa hỗ trợ gợi ý AI. Bạn vẫn có thể tự nhập mầm drama.' : 'This server does not support AI suggestions yet. You can still enter a drama spark yourself.';
  if (error.code === 'suggestion_in_progress') return vi ? 'Ba gợi ý đang được chuẩn bị. Thử lại để tiếp tục cùng yêu cầu.' : 'Your three suggestions are still being prepared. Retry to continue the same request.';
  if (error.code === 'suggestion_rate_limited') return vi ? 'Bạn đã dùng hết 12 lượt gợi ý AI hôm nay. Bạn vẫn có thể tự nhập mầm drama.' : 'You have used today’s 12 AI suggestion batches. You can still enter a drama spark yourself.';
  if (error.code === 'suggestion_conflict') return vi ? 'Yêu cầu gợi ý này không còn khớp với nội dung hiện tại. Hãy thử lại để tạo một lượt mới.' : 'This suggestion request no longer matches the current input. Try again to start a fresh batch.';
  if (error.code === 'invalid_suggestion_response') return vi ? 'Ba gợi ý nhận được chưa hợp lệ. Mầm drama hiện tại không bị thay đổi; hãy thử lại.' : 'The returned suggestions were not valid. Your current drama spark is unchanged; try again.';
  if (error.code === 'provider_unavailable') return vi ? 'Bộ máy gợi ý AI tạm thời không khả dụng. Mầm drama hiện tại vẫn được giữ nguyên.' : 'The AI suggestion service is temporarily unavailable. Your current drama spark is unchanged.';
  if (error.code === 'backend_unavailable') {
    return error.message.includes('too long')
      ? (vi ? 'Gợi ý AI phản hồi quá chậm. Hãy thử lại để tiếp tục cùng yêu cầu an toàn.' : 'AI suggestions took too long to respond. Retry to safely continue the same request.')
      : (vi ? 'Không thể kết nối dịch vụ gợi ý AI. Hãy thử lại; mầm drama hiện tại vẫn còn nguyên.' : 'The AI suggestion service could not be reached. Retry; your current drama spark is unchanged.');
  }
  if (error.code === 'invalid_input') return vi ? 'Nội dung dùng để gợi ý chưa hợp lệ. Hãy chỉnh mầm drama hoặc tên nhân vật rồi thử lại.' : 'The suggestion input is invalid. Edit the drama spark or character name and try again.';
  return vi ? 'Không thể lấy gợi ý lúc này. Mầm drama hiện tại vẫn được giữ nguyên.' : 'Suggestions are unavailable right now. Your current drama spark is unchanged.';
}

function normalizeOptional(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}
