import type { SceneGenerationInput, SceneProposal } from '../src/ai/contracts';

/** Shared fixtures for generator/schema tests. Must pass evaluateNarrative when history is empty. */
export function makeGenerationInput(): SceneGenerationInput {
  return {
    locale: 'vi-VN',
    targetSpokenSeconds: 75,
    contentRating: 'teen',
    drama: {
      premise: 'An giấu một tin nhắn khiến tình bạn với Linh rạn nứt.',
      mood: 'tense',
      summary: 'Linh đã phát hiện tin nhắn và buộc An phải đối diện với sự thật.',
      stateVersion: 4,
    },
    characters: [
      { key: 'hero', name: 'An', role: 'protagonist', traits: 'thận trọng', goal: 'giữ Linh an toàn', secret: 'đã giấu tin nhắn' },
      { key: 'linh', name: 'Linh', role: 'best friend', traits: 'tinh ý', goal: 'biết toàn bộ sự thật', secret: '' },
    ],
    relationships: [
      { fromKey: 'hero', toKey: 'linh', affinity: 40, trust: 35, tension: 45, status: 'strained' },
    ],
    activeFacts: [{ key: 'fact-hidden-message', text: 'An cố tình giấu một tin nhắn khỏi Linh.' }],
    openThreads: [{ key: 'thread-trust', title: 'Linh nghi ngờ sự thành thật của An.', urgency: 85 }],
    recentHistory: [],
    previous: {
      sceneSummary: 'Linh tìm thấy tin nhắn đã bị giấu.',
      chosenAction: 'An thừa nhận đã giấu tin nhắn.',
      choiceIntent: 'thú nhận một phần',
      consequence: 'Linh yêu cầu An nói toàn bộ sự thật ngay lập tức.',
    },
  };
}

export function makeValidProposal(): SceneProposal {
  return {
    title: 'Phần Còn Lại',
    beat: 'revelation',
    pacingRole: 'payoff',
    script: [
      'Linh yêu cầu An nói toàn bộ sự thật ngay lập tức, và An thừa nhận đã giấu tin nhắn vì sợ cô bị kéo vào chuyện nguy hiểm.',
      'Không khí trong căn bếp chật hẹp nặng đến mức tiếng mưa ngoài cửa sổ nghe như một chiếc đồng hồ đếm ngược.',
      'Linh không nổi giận ngay; cô hỏi chính xác ai đã gửi tin và vì sao An nghĩ mình có quyền quyết định thay cô.',
      'An kể về cuộc gọi nặc danh tối qua, về lời cảnh báo nhắc đúng tên Linh, rồi đặt điện thoại lên bàn để cô tự đọc mọi thứ.',
      'Sự im lặng sau đó không còn là né tránh mà là khoảng trống của hai người đang tính lại mức độ họ còn có thể tin nhau.',
      'Linh chỉ ra rằng việc bảo vệ cô bằng cách nói dối vẫn là một cách tước lựa chọn khỏi cô.',
      'An nhận lỗi, nhưng cũng cảnh báo người gửi tin có thể đang theo dõi phản ứng của họ.',
      'Một chiếc xe đỗ đối diện bật đèn rồi tắt ngay khi Linh nhìn ra cửa sổ.',
      'Linh kéo rèm lại và nói vấn đề giữa họ chưa được giải quyết, nhưng mối đe dọa bên ngoài đã trở nên thật hơn.',
      'An đề nghị họ quyết định bước tiếp theo cùng nhau thay vì tiếp tục tự hành động.',
      'Linh đồng ý với một điều kiện: từ giờ mọi thông tin liên quan đến cô phải được chia sẻ ngay khi xuất hiện.',
      'Cả hai nhìn màn hình điện thoại khi một tin nhắn mới hiện lên, cho thấy người lạ biết họ đang ở cùng nhau.',
    ].join(' '),
    summary: 'An thừa nhận đã giấu tin nhắn để bảo vệ Linh; Linh đặt điều kiện mới cho lòng tin khi mối đe dọa bên ngoài trở nên rõ ràng.',
    establishedFacts: ['Người gửi tin nặc danh biết vị trí hiện tại của An và Linh.'],
    threadChanges: { open: [{ title: 'Ai đang theo dõi An và Linh?', urgency: 92 }], resolve: ['thread-trust'] },
    choices: [
      makeChoice(
        'A',
        'Cùng Linh đối chất người gửi tin',
        'đối diện mối đe dọa như đồng minh',
        'Linh thấy An giữ lời chia sẻ quyền quyết định, nhưng cả hai tự đặt mình gần nguy hiểm hơn.',
        3,
        8,
        12,
        'defiant',
      ),
      makeChoice(
        'B',
        'Đưa điện thoại cho cảnh sát',
        'chuyển quyền xử lý cho người có thẩm quyền',
        'Linh cảm thấy an toàn hơn, nhưng người gửi tin có thể biến mất trước khi họ biết động cơ thật sự.',
        1,
        5,
        -5,
        'cautious',
      ),
      makeChoice(
        'C',
        'Tắt máy và rời khỏi căn hộ',
        'ưu tiên thoát khỏi theo dõi trước khi điều tra',
        'Linh chấp nhận rút lui tạm thời, nhưng nghi ngờ An vẫn đang giữ lại một phần thông tin.',
        -2,
        -4,
        6,
        'uneasy',
      ),
    ],
  };
}

function makeChoice(
  key: 'A' | 'B' | 'C',
  label: string,
  intent: string,
  consequence: string,
  affinityDelta: number,
  trustDelta: number,
  tensionDelta: number,
  nextTone: string,
) {
  return {
    key,
    label,
    intent,
    consequence,
    stateDelta: {
      relationships: [
        {
          fromKey: 'hero',
          toKey: 'linh',
          affinityDelta,
          trustDelta,
          tensionDelta,
          statusText: nextTone,
        },
      ],
      factsToAdd: [`Branch ${key} creates a distinct immediate consequence.`],
      factKeysToResolve: [],
      threadsToOpen: [],
      threadKeysToResolve: [],
      nextTone,
    },
  };
}
