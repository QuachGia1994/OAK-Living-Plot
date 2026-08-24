import type { Choice, Drama, Scene } from '@/features/drama/domain';
import type { DramaLocale, UiLocale } from '@/features/preferences/contracts';
import type {
  DramaDraft,
  DramaExperienceClient,
  DramaHistory,
  DramaSeedSuggestionBatch,
  DramaSeedSuggestionInput,
  DramaHistoryItem,
  DramaHomeSnapshot,
  DramaLibrarySnapshot,
  DramaSummary,
} from './contracts';
import { DramaClientError } from './contracts';
import { hasDraftErrors, normalizeDramaDraft, validateDramaDraft } from './setup';

const PREVIEW_SEED_DRAMA_ID = 'preview-midnight-message';

export class PreviewDramaState {
  readonly createdDramas = new Map<string, Drama>();
  readonly creationsByKey = new Map<string, { dramaId: string; fingerprint: string }>();
  readonly suggestionsByKey = new Map<string, { fingerprint: string; suggestions: DramaSeedSuggestionBatch }>();
  readonly seedDramas = new Map<DramaLocale, Drama>();
  readonly archivedDramaIds = new Set<string>();
  readonly histories = new Map<string, DramaHistoryItem[]>();
  readonly dramaLocales = new Map<string, DramaLocale>();
  createdDramaCount = 0;
}

export class PreviewDramaExperienceClient implements DramaExperienceClient {
  constructor(
    private readonly uiLocale: UiLocale = 'en',
    private readonly dramaLocale: DramaLocale = uiLocale === 'vi' ? 'vi-VN' : 'en-US',
    private readonly state = new PreviewDramaState(),
  ) {
    this.ensureSeedDrama();
  }

  async loadHome(): Promise<DramaHomeSnapshot> {
    const all = this.allDramas();
    const active = all.filter((drama) => !this.state.archivedDramaIds.has(drama.id));
    return {
      recentDramas: active.map((drama) => toSummary(drama, this.uiLocale)).reverse(),
      quota: {
        enforced: false,
        textEnforced: false,
        voiceEnforced: false,
        textRemaining: 49,
        textLimit: 50,
        voiceRemaining: 1,
        voiceLimit: 1,
        voiceBonusCredits: 0,
        resetLabel: this.uiLocale === 'vi' ? 'Đặt lại lúc 00:00 UTC' : 'Resets at 00:00 UTC',
      },
      retention: {
        currentStreakDays: 2,
        choicesMade: 4,
        activeDramas: active.length,
        dailyPrompt: previewDailyPrompt(this.dramaLocale, all.map((drama) => ({
          id: this.state.archivedDramaIds.has(drama.id) ? undefined : drama.id,
          premise: drama.premise,
        }))),
      },
    };
  }

  async loadLibrary(): Promise<DramaLibrarySnapshot> {
    const summaries = this.allDramas().map((drama) => toSummary(drama, this.uiLocale)).reverse();
    return {
      active: summaries.filter((drama) => !this.state.archivedDramaIds.has(drama.id)),
      archived: summaries.filter((drama) => this.state.archivedDramaIds.has(drama.id)),
    };
  }

  async createDrama(draft: DramaDraft, creationKey?: string): Promise<Drama> {
    const normalized = normalizeDramaDraft(draft);
    if (hasDraftErrors(validateDramaDraft(normalized, this.uiLocale))) {
      throw new DramaClientError('invalid_input', 'The drama setup is incomplete.');
    }
    const normalizedCreationKey = creationKey?.trim();
    const fingerprint = JSON.stringify(normalized);
    const existing = normalizedCreationKey ? this.state.creationsByKey.get(normalizedCreationKey) : undefined;
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new DramaClientError('choice_required', 'This creation request already belongs to a different drama setup.');
      }
      return cloneDrama(this.requireDrama(existing.dramaId));
    }

    this.state.createdDramaCount += 1;
    const dramaId = `preview-created-${this.state.createdDramaCount}`;
    const drama: Drama = {
      id: dramaId,
      title: titleFromPremise(normalized.premise),
      premise: normalized.premise,
      mood: normalized.mood,
      leadCharacter: { id: `${dramaId}-lead`, name: normalized.characterName, role: 'protagonist' },
      currentScene: buildFirstScene(dramaId, normalized, this.dramaLocale),
    };
    this.state.createdDramas.set(dramaId, drama);
    this.state.dramaLocales.set(dramaId, this.dramaLocale);
    this.state.histories.set(dramaId, [historyItem(drama.currentScene)]);
    if (normalizedCreationKey) this.state.creationsByKey.set(normalizedCreationKey, { dramaId, fingerprint });
    return cloneDrama(drama);
  }

  async suggestDramaSeeds(input: DramaSeedSuggestionInput, requestKey: string): Promise<DramaSeedSuggestionBatch> {
    const key = requestKey.normalize('NFKC').trim();
    if (!key) throw new DramaClientError('invalid_input', 'A suggestion request key is required.');
    const characterName = normalizeOptionalText(input.characterName);
    const inspiration = normalizeOptionalText(input.inspiration);
    const normalizedInput: DramaSeedSuggestionInput = {
      mood: input.mood,
      ...(characterName.length >= 2 && characterName.length <= 50 ? { characterName } : {}),
      ...(inspiration ? { inspiration } : {}),
    };
    const fingerprint = JSON.stringify(normalizedInput);
    const existing = this.state.suggestionsByKey.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new DramaClientError('suggestion_conflict', 'This suggestion request already belongs to different inspiration.');
      }
      return cloneSuggestionBatch(existing.suggestions);
    }

    const suggestions = previewSuggestionBatch(this.dramaLocale, normalizedInput, key);
    this.state.suggestionsByKey.set(key, { fingerprint, suggestions: cloneSuggestionBatch(suggestions) });
    return cloneSuggestionBatch(suggestions);
  }

  async loadDrama(dramaId: string): Promise<Drama> {
    return cloneDrama(this.requireDrama(dramaId));
  }

  async loadHistory(dramaId: string): Promise<DramaHistory> {
    const drama = this.requireDrama(dramaId);
    const items = this.state.histories.get(this.historyKey(dramaId)) ?? [historyItem(drama.currentScene)];
    return { dramaId, title: drama.title, items: items.map((item) => ({ ...item })) };
  }

  async archiveDrama(dramaId: string): Promise<DramaSummary> {
    const drama = this.requireDrama(dramaId);
    this.state.archivedDramaIds.add(dramaId);
    return toSummary(drama, this.uiLocale);
  }

  async restoreDrama(dramaId: string): Promise<DramaSummary> {
    const drama = this.requireDrama(dramaId);
    this.state.archivedDramaIds.delete(dramaId);
    return toSummary(drama, this.uiLocale);
  }

  async commitChoice(dramaId: string, sceneId: string, choiceId: string): Promise<Drama> {
    const drama = this.requireActiveDrama(dramaId);
    const scene = drama.currentScene;
    if (scene.id !== sceneId) throw new DramaClientError('not_found', 'This scene is no longer current.');

    if (scene.branch.state === 'committed') {
      if (scene.branch.choiceId === choiceId) return cloneDrama(drama);
      throw new DramaClientError('choice_conflict', 'Another choice is already committed for this scene.');
    }

    const choice = scene.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) throw new DramaClientError('not_found', 'That choice does not belong to this scene.');

    drama.currentScene = {
      ...scene,
      branch: { state: 'committed', choiceId: choice.id, consequence: choice.consequence },
    };
    this.replaceCurrentHistory(dramaId, historyItem(drama.currentScene));
    return cloneDrama(drama);
  }

  async requestNextScene(dramaId: string): Promise<Drama> {
    const drama = this.requireActiveDrama(dramaId);
    if (drama.currentScene.branch.state !== 'committed') {
      throw new DramaClientError('choice_required', 'Choose what happens before continuing.');
    }

    const previous = drama.currentScene;
    drama.currentScene = buildContinuationScene(drama, previous, this.dramaLocaleForDrama(dramaId));
    const key = this.historyKey(dramaId);
    const items = this.state.histories.get(key) ?? [];
    items.push(historyItem(drama.currentScene));
    this.state.histories.set(key, items);
    return cloneDrama(drama);
  }

  private replaceCurrentHistory(dramaId: string, item: DramaHistoryItem): void {
    const key = this.historyKey(dramaId);
    const items = this.state.histories.get(key) ?? [];
    if (items.length === 0) items.push(item);
    else items[items.length - 1] = item;
    this.state.histories.set(key, items);
  }

  private requireActiveDrama(dramaId: string): Drama {
    if (this.state.archivedDramaIds.has(dramaId)) throw new DramaClientError('not_found', 'Archived dramas are read-only until restored.');
    return this.requireDrama(dramaId);
  }

  private requireDrama(dramaId: string): Drama {
    const drama = dramaId === PREVIEW_SEED_DRAMA_ID
      ? this.state.seedDramas.get(this.dramaLocale)
      : this.state.createdDramas.get(dramaId);
    if (!drama) throw new DramaClientError('not_found', 'This drama could not be found.');
    return drama;
  }

  private allDramas(): Drama[] {
    const seed = this.state.seedDramas.get(this.dramaLocale);
    return [...this.state.createdDramas.values(), ...(seed ? [seed] : [])];
  }

  private ensureSeedDrama(): void {
    if (this.state.seedDramas.has(this.dramaLocale)) return;
    const seeded = createSeedDrama(this.dramaLocale);
    this.state.seedDramas.set(this.dramaLocale, seeded);
    this.state.histories.set(this.historyKey(seeded.id), [historyItem(seeded.currentScene)]);
  }

  private historyKey(dramaId: string): string {
    return dramaId === PREVIEW_SEED_DRAMA_ID ? `${this.dramaLocale}:${dramaId}` : dramaId;
  }

  private dramaLocaleForDrama(dramaId: string): DramaLocale {
    if (dramaId === PREVIEW_SEED_DRAMA_ID) return this.dramaLocale;
    return this.state.dramaLocales.get(dramaId) ?? this.dramaLocale;
  }
}

export const previewDramaExperienceClient: DramaExperienceClient = new PreviewDramaExperienceClient();

function previewDailyPrompt(
  dramaLocale: DramaLocale,
  usedDramas: readonly { id?: string; premise: string }[] = [],
): DramaHomeSnapshot['retention']['dailyPrompt'] {
  const prompts = [
    {
      label: { en: 'A message at the wrong time', vi: 'Tin nhắn sai thời điểm' },
      premise: {
        en: 'A voice note arrives from someone who should have no way to contact you, and it contains one detail only you would recognize.',
        vi: 'Một tin nhắn thoại đến từ người lẽ ra không thể liên lạc với bạn, và nó chứa một chi tiết chỉ bạn mới nhận ra.',
      },
      mood: 'mysterious',
      characterName: 'Mina',
    },
    {
      label: { en: 'One seat left', vi: 'Chỉ còn một chỗ trống' },
      premise: {
        en: 'At a wedding dinner, the only empty seat is beside the person you promised yourself you would never speak to again.',
        vi: 'Trong bữa tiệc cưới, chỗ trống duy nhất nằm cạnh người mà bạn từng tự hứa sẽ không bao giờ nói chuyện lại.',
      },
      mood: 'romantic',
      characterName: 'Kai',
    },
    {
      label: { en: 'The favor comes due', vi: 'Đến lúc trả món nợ ân tình' },
      premise: {
        en: 'A friend who once saved your career asks for one favor that could destroy somebody else’s life.',
        vi: 'Một người bạn từng cứu sự nghiệp của bạn nhờ một việc có thể phá hủy cuộc đời của người khác.',
      },
      mood: 'tense',
      characterName: 'Noah',
    },
    {
      label: { en: 'The room behind the wall', vi: 'Căn phòng sau bức tường' },
      premise: {
        en: 'Renovation work reveals a sealed room in your childhood home, and your name is written on the inside of the door.',
        vi: 'Việc sửa nhà làm lộ một căn phòng bị niêm kín trong ngôi nhà thời thơ ấu, và tên bạn được viết ở mặt trong cánh cửa.',
      },
      mood: 'mysterious',
      characterName: 'Linh',
    },
    {
      label: { en: 'A second chance with a cost', vi: 'Cơ hội thứ hai có cái giá' },
      premise: {
        en: 'You are offered the exact opportunity you lost years ago, but accepting it means leaving one person behind tonight.',
        vi: 'Bạn được trao lại đúng cơ hội đã đánh mất nhiều năm trước, nhưng nhận nó đồng nghĩa phải bỏ lại một người ngay tối nay.',
      },
      mood: 'hopeful',
      characterName: 'Ari',
    },
  ] as const;
  const used = new Set(usedDramas.map((drama) => normalizePromptText(drama.premise)).filter(Boolean));
  const selected = prompts.find((candidate) =>
    !Object.values(candidate.premise).some((premise) => used.has(normalizePromptText(premise)))) ?? prompts[0];
  const localeKey = dramaLocale === 'vi-VN' ? 'vi' : 'en';
  const result: DramaHomeSnapshot['retention']['dailyPrompt'] = {
    label: selected.label[localeKey],
    premise: selected.premise[localeKey],
    mood: selected.mood,
    characterName: selected.characterName,
  };
  const allPromptsUsed = prompts.every((candidate) =>
    Object.values(candidate.premise).some((premise) => used.has(normalizePromptText(premise))));
  if (allPromptsUsed) {
    const selectedPremises = new Set(Object.values(selected.premise).map(normalizePromptText));
    const existing = usedDramas.find((drama) => drama.id && selectedPremises.has(normalizePromptText(drama.premise)));
    if (existing?.id) result.resumeDramaId = existing.id;
  }
  return result;
}

function normalizePromptText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function createSeedDrama(dramaLocale: DramaLocale): Drama {
  const dramaId = PREVIEW_SEED_DRAMA_ID;
  const vi = dramaLocale === 'vi-VN';
  const sceneId = `${dramaId}-scene-1`;
  return {
    id: dramaId,
    title: vi ? 'Tin Nhắn Lúc Nửa Đêm' : 'The Midnight Message',
    premise: vi
      ? 'Mina nhận được tin nhắn thoại từ người chị mất tích ba năm sau ngày cô biến mất.'
      : 'Mina receives a voice note from her missing sister three years after she disappeared.',
    mood: 'mysterious',
    leadCharacter: { id: `${dramaId}-lead`, name: 'Mina', role: 'protagonist' },
    currentScene: {
      id: sceneId,
      number: 1,
      title: vi ? 'Giọng Nói Từ Ba Năm Trước' : 'A Voice From Three Years Ago',
      script: vi
        ? 'Lúc 0 giờ 07 phút, chiếc điện thoại đã hết pin của Mina tự sáng lên. Màn hình hiện một tin nhắn thoại mới từ Aya, người chị đã mất tích ba năm trước. Aya thì thầm biệt danh thời thơ ấu của Mina rồi nói cảnh sát đã tìm nhầm căn hộ. Phía sau đoạn ghi âm là tiếng chuông thang máy rất khẽ trong chính tòa nhà của Mina. Trước khi đoạn ghi âm kết thúc, Aya nói thêm một câu: “Đừng để hắn biết em đã nghe thấy.” Ngay lúc đó, có tiếng gõ cửa căn hộ.'
        : 'At 12:07 a.m., Mina’s dead phone lights up by itself. The screen shows one new voice note from Aya, her sister who vanished three years ago. Aya whispers Mina’s childhood nickname, then says the police searched the wrong apartment. Behind the message is the faint chime of the elevator in Mina’s own building. Before the recording ends, Aya says one more thing: “Do not let him know you heard this.” A knock lands on Mina’s front door.',
      summary: vi
        ? 'Mina nhận được một tin nhắn không thể tồn tại từ người chị mất tích, và ngay sau đó có người xuất hiện trước cửa.'
        : 'Mina receives an impossible message from her missing sister and someone immediately arrives at her door.',
      branch: { state: 'open' },
      choices: vi
        ? makeChoices(sceneId, [
          ['A', 'Mở cửa thật khẽ', 'đối mặt người bên ngoài', 'Mina mở cửa và phát hiện ai đó để lại một thẻ khóa ướt sũng trước ngưỡng cửa.'],
          ['B', 'Nghe lại đoạn ghi âm và tách tiếng nền', 'tìm manh mối', 'Mina tách được tiếng chuông thang máy và nhận ra nó thuộc về một tầng lẽ ra không tồn tại.'],
          ['C', 'Gọi cho thám tử từng khép lại vụ án của Aya', 'tìm trợ giúp', 'Viên thám tử bắt máy ngay lập tức và dường như đã biết về tin nhắn mới.'],
        ])
        : makeChoices(sceneId, [
          ['A', 'Open the door without making a sound', 'confront the visitor', 'Mina opens the door and discovers someone left a wet keycard outside.'],
          ['B', 'Replay the note and inspect the background noise', 'search for evidence', 'Mina isolates the elevator chime and identifies a floor that should not exist.'],
          ['C', 'Call the detective who closed Aya’s case', 'seek official help', 'The detective answers immediately and already knows about the new message.'],
        ]),
    },
  };
}

function buildFirstScene(dramaId: string, draft: DramaDraft, dramaLocale: DramaLocale): Scene {
  const sceneId = `${dramaId}-scene-1`;
  const vi = dramaLocale === 'vi-VN';
  return {
    id: sceneId,
    number: 1,
    title: vi ? 'Bước Ngoặt Đầu Tiên' : 'The First Turn',
    script: vi
      ? `${draft.characterName} tưởng đây sẽ là một đêm bình thường. Nhưng rồi, ${lowercaseFirst(draft.premise)} Chi tiết đầu tiên có gì đó sai sai nhỏ đến mức có thể bỏ qua, nhưng lại quá riêng tư để ${draft.characterName} làm ngơ. Khi căn phòng im bặt, không còn lựa chọn nào thực sự trung lập.`
      : `${draft.characterName} thought this would be an ordinary night. Instead, ${lowercaseFirst(draft.premise)} The first detail that feels wrong is small enough to ignore, but personal enough that ${draft.characterName} cannot. By the time the room goes quiet, there is no neutral option left.`,
    summary: vi
      ? `${draft.characterName} bị kéo vào xung đột trung tâm và phải quyết định cách phản ứng.`
      : `${draft.characterName} is pulled into the central conflict and must decide how to respond.`,
    branch: { state: 'open' },
    choices: vi
      ? makeChoices(sceneId, [
        ['A', 'Đối mặt vấn đề ngay lập tức', 'hành động trực diện', `${draft.characterName} buộc xung đột lộ ra trước khi bất kỳ ai kịp chuẩn bị.`],
        ['B', 'Chờ thêm một manh mối', 'điều tra trước', `${draft.characterName} phát hiện một chi tiết làm thay đổi hoàn toàn người đáng tin.`],
        ['C', 'Kéo một người khác vào bí mật', 'tìm đồng minh', `${draft.characterName} chia sẻ rủi ro và tạo ra một liên minh mới với cái giá chưa lộ rõ.`],
      ])
      : makeChoices(sceneId, [
        ['A', 'Confront the problem immediately', 'act directly', `${draft.characterName} forces the conflict into the open before anyone is ready.`],
        ['B', 'Wait and gather one more clue', 'investigate first', `${draft.characterName} learns one detail that changes who seems trustworthy.`],
        ['C', 'Bring someone else into the secret', 'seek an ally', `${draft.characterName} shares the risk, creating a new alliance with a hidden cost.`],
      ]),
  };
}

function buildContinuationScene(drama: Drama, previous: Scene, dramaLocale: DramaLocale): Scene {
  const number = previous.number + 1;
  const sceneId = `${drama.id}-scene-${number}`;
  const vi = dramaLocale === 'vi-VN';
  const consequence = previous.branch.state === 'committed'
    ? previous.branch.consequence
    : vi ? 'Lựa chọn trước đó đã thay đổi điều sắp xảy ra.' : 'The previous decision changes what happens next.';
  const leadName = drama.leadCharacter.name;
  return {
    id: sceneId,
    number,
    title: vi ? (number === 2 ? 'Hậu Quả Ập Đến' : 'Câu Chuyện Lại Rẽ Hướng') : (number === 2 ? 'The Consequence Arrives' : 'The Story Turns Again'),
    script: vi
      ? `${consequence} ${leadName} không có thời gian để lấy lại nhịp. Lựa chọn vừa rồi lập tức thay đổi cán cân tin tưởng, và một chi tiết trong tình huống ban đầu — ${lowercaseFirst(drama.premise)} — giờ mang ý nghĩa khác. Trước khi ${leadName} kịp ghép mọi thứ lại, một người khác hành động trước và buộc cảnh tiếp theo phải rẽ hướng.`
      : `${consequence} ${leadName} has no time to reset. The choice changes the balance of trust immediately, and a new detail from the original situation—${lowercaseFirst(drama.premise)}—now means something different. Before ${leadName} can settle on an explanation, another person acts first and forces the next decision.`,
    summary: vi
      ? `Cảnh ${number} tiếp nối trực tiếp hậu quả của lựa chọn đã chốt và mở ra một điểm quyết định mới.`
      : `Scene ${number} visibly follows the previously committed choice and creates a new decision point.`,
    branch: { state: 'open' },
    choices: vi
      ? makeChoices(sceneId, [
        ['A', 'Đẩy mạnh khi lợi thế còn mới', 'leo thang', `${leadName} giành thêm lợi thế nhưng để lộ nhiều hơn về kế hoạch.`],
        ['B', 'Đổi hướng trước khi người khác thích nghi', 'xoay hướng', `${leadName} tránh được cái bẫy rõ ràng nhưng tạo ra một bất định mới.`],
        ['C', 'Bảo vệ mối quan hệ thay vì kế hoạch', 'ưu tiên niềm tin', `${leadName} giữ được niềm tin nhưng đánh đổi quyền kiểm soát tức thời.`],
      ])
      : makeChoices(sceneId, [
        ['A', 'Push harder while the advantage is fresh', 'escalate', `${leadName} gains leverage but exposes more of the plan.`],
        ['B', 'Change direction before anyone adapts', 'pivot', `${leadName} avoids the obvious trap but creates a new uncertainty.`],
        ['C', 'Protect the relationship instead of the plan', 'prioritize trust', `${leadName} preserves trust at the cost of losing immediate control.`],
      ]),
  };
}

function makeChoices(
  sceneId: string,
  definitions: readonly [
    readonly ['A', string, string, string],
    readonly ['B', string, string, string],
    readonly ['C', string, string, string],
  ],
): [Choice, Choice, Choice] {
  return definitions.map(([key, label, intent, consequence]) => ({
    id: `${sceneId}-choice-${key}`,
    key,
    label,
    intent,
    consequence,
  })) as [Choice, Choice, Choice];
}

function toSummary(drama: Drama, uiLocale: UiLocale): DramaSummary {
  const scene = drama.currentScene;
  return {
    id: drama.id,
    sceneId: scene.id,
    title: drama.title,
    premise: drama.premise,
    mood: drama.mood,
    characterName: drama.leadCharacter.name,
    updatedLabel: uiLocale === 'vi' ? 'Vừa xong' : 'Just now',
    sceneNumber: scene.number,
    status: scene.branch.state === 'open' ? 'awaiting_choice' : 'ready_for_next_scene',
    resumeLine: scene.branch.state === 'committed' ? scene.branch.consequence : scene.summary,
  };
}

function historyItem(scene: Scene): DramaHistoryItem {
  const item: DramaHistoryItem = {
    sceneId: scene.id,
    sceneNumber: scene.number,
    title: scene.title,
    summary: scene.summary,
    branchState: scene.branch.state,
  };
  const branch = scene.branch;
  if (branch.state === 'committed') {
    const choice = scene.choices.find((candidate) => candidate.id === branch.choiceId);
    if (choice) {
      item.choiceKey = choice.key;
      item.choiceLabel = choice.label;
    }
    item.consequence = branch.consequence;
  }
  return item;
}

function titleFromPremise(premise: string): string {
  const words = premise.split(' ').slice(0, 6).join(' ');
  return words.length > 42 ? `${words.slice(0, 39).trim()}…` : words;
}

function lowercaseFirst(value: string): string {
  if (!value) return value;
  return `${value[0].toLocaleLowerCase()}${value.slice(1)}`;
}

function previewSuggestionBatch(
  dramaLocale: DramaLocale,
  input: DramaSeedSuggestionInput,
  requestKey: string,
): DramaSeedSuggestionBatch {
  const vi = dramaLocale === 'vi-VN';
  const defaultName = vi ? 'Linh' : 'Mina';
  const characterName = normalizeOptionalText(input.characterName) || defaultName;
  const inspiration = normalizeOptionalText(input.inspiration);
  const context = inspiration
    ? (vi ? `Từ mầm “${trimPreviewInspiration(inspiration)}”, ` : `Building from “${trimPreviewInspiration(inspiration)}”, `)
    : '';
  const catalog = vi ? [
    {
      label: 'Cuộc gọi bị xóa',
      premise: `${context}${characterName} nhận cuộc gọi trực tiếp từ người đã biến mất nhiều năm, nhưng nhật ký điện thoại tự xóa sau mỗi phút. Nếu giữ bí mật, ${characterName} có thể mất cơ hội cứu người đó; nếu báo cảnh sát, một bí mật gia đình sẽ lộ ra. Điện thoại chỉ còn đủ pin cho một cuộc gọi trả lời nên ${characterName} phải chọn ngay. Ai thực sự đang ở đầu dây bên kia?`,
      mood: 'mysterious' as const,
    },
    {
      label: 'Lời hứa mang tên mình',
      premise: `${context}${characterName} phát hiện người bạn thân đã dùng tên mình để ký một lời hứa có thể phá hủy sự nghiệp của cả hai. Im lặng sẽ giữ tình bạn nhưng biến ${characterName} thành người chịu trách nhiệm; công khai sự thật sẽ làm mọi thứ sụp đổ ngay tối nay. Cuộc họp quyết định bắt đầu trong một giờ nên ${characterName} phải chọn cách đối mặt. Vì sao người bạn cần danh tính của ${characterName} đến vậy?`,
      mood: 'tense' as const,
    },
    {
      label: 'Căn phòng có tên mình',
      premise: `${context}${characterName} tìm thấy một căn phòng bị niêm kín trong ngôi nhà tuổi thơ, với tên mình viết ở mặt trong cánh cửa. Bước vào có thể chứng minh ký ức gia đình là giả nhưng cũng có thể phá vỡ mối quan hệ cuối cùng còn đáng tin. Ngôi nhà sẽ bị phá lúc bình minh nên ${characterName} không thể trì hoãn. Điều gì đã xảy ra trong căn phòng khiến mọi người cùng im lặng?`,
      mood: 'hopeful' as const,
    },
    {
      label: 'Đám cưới sai người',
      premise: `${context}${characterName} đến một đám cưới và nhận ra cô dâu hoặc chú rể đang dùng câu chuyện tình từng thuộc về chính mình. Nếu lên tiếng, ${characterName} có thể cứu một người khỏi lời nói dối nhưng cũng phơi bày điều đã cố quên. Lời thề sắp bắt đầu nên chỉ còn vài phút để hành động. Ai đã viết lại quá khứ của ${characterName}, và để làm gì?`,
      mood: 'romantic' as const,
    },
  ] : [
    {
      label: 'The erased call',
      premise: `${context}${characterName} receives a live call from someone who vanished years ago, but the call log erases itself every minute. Keeping quiet may cost the only chance to save them; involving police will expose a family secret. The phone has power for one reply, so ${characterName} must choose now. Who is really on the other end?`,
      mood: 'mysterious' as const,
    },
    {
      label: 'A promise in your name',
      premise: `${context}${characterName} learns a closest friend used their name to sign a promise that could destroy both careers. Silence protects the friendship but makes ${characterName} responsible; exposing the truth detonates everything tonight. A deciding meeting starts in one hour, forcing ${characterName} to act. Why did the friend need ${characterName}’s identity so badly?`,
      mood: 'tense' as const,
    },
    {
      label: 'The room with your name',
      premise: `${context}${characterName} finds a sealed room in the childhood home with their name written inside the door. Entering could prove the family story is false but destroy the last relationship ${characterName} still trusts. The house will be demolished at dawn, so there is no time to wait. What happened in that room that made everyone agree to stay silent?`,
      mood: 'hopeful' as const,
    },
    {
      label: 'The wrong wedding story',
      premise: `${context}${characterName} attends a wedding and realizes the couple is repeating a love story that once belonged to ${characterName}. Speaking up might save someone from a lie but expose the past ${characterName} worked to bury. The vows begin in minutes, leaving one chance to intervene. Who rewrote ${characterName}’s past, and why?`,
      mood: 'romantic' as const,
    },
  ];
  const offset = stablePreviewOffset(requestKey, catalog.length);
  const selected = [catalog[offset], catalog[(offset + 1) % catalog.length], catalog[(offset + 2) % catalog.length]];
  return selected.map((item, index) => ({
    label: item.label,
    premise: item.premise,
    mood: index === 0 ? input.mood : item.mood,
    characterName,
  })) as DramaSeedSuggestionBatch;
}

function normalizeOptionalText(value: string | undefined): string {
  return value?.normalize('NFKC').trim().replace(/\s+/gu, ' ') ?? '';
}

function trimPreviewInspiration(value: string): string {
  const codePoints = Array.from(value);
  return codePoints.length <= 72 ? value : `${codePoints.slice(0, 69).join('').trim()}…`;
}

function stablePreviewOffset(value: string, modulo: number): number {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.codePointAt(0)!) >>> 0;
  return hash % modulo;
}

function cloneSuggestionBatch(batch: DramaSeedSuggestionBatch): DramaSeedSuggestionBatch {
  return batch.map((suggestion) => ({ ...suggestion })) as DramaSeedSuggestionBatch;
}

function cloneDrama(drama: Drama): Drama {
  return {
    ...drama,
    leadCharacter: { ...drama.leadCharacter },
    currentScene: {
      ...drama.currentScene,
      branch: { ...drama.currentScene.branch },
      choices: drama.currentScene.choices.map((choice) => ({ ...choice })) as [Choice, Choice, Choice],
    },
  };
}
