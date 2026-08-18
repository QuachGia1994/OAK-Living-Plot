import type {
  PlotDraft,
  StoryChoice,
  StoryEpisode,
  StoryExperienceClient,
  StoryHistoryItem,
  StoryHistorySnapshot,
  StoryHomeSnapshot,
  StoryLibrarySnapshot,
  StoryPlotSession,
  StoryPlotSummary,
} from './contracts';
import { StoryClientError } from './contracts';
import type { StoryLocale, UiLocale } from '@/features/preferences/contracts';
import { hasDraftErrors, normalizePlotDraft, validatePlotDraft } from './draft';

export class PreviewStoryExperienceClient implements StoryExperienceClient {
  private readonly plots = new Map<string, StoryPlotSession>();
  private readonly archivedPlotIds = new Set<string>();
  private readonly histories = new Map<string, StoryHistoryItem[]>();
  private createdPlotCount = 0;

  constructor(
    private readonly uiLocale: UiLocale = 'en',
    private readonly storyLocale: StoryLocale = uiLocale === 'vi' ? 'vi-VN' : 'en-US',
  ) {
    const seeded = createSeedPlot(storyLocale);
    this.plots.set(seeded.id, seeded);
    this.histories.set(seeded.id, [historyItem(seeded.episode)]);
  }

  async loadHome(): Promise<StoryHomeSnapshot> {
    const active = [...this.plots.values()].filter((plot) => !this.archivedPlotIds.has(plot.id));
    return {
      recentPlots: active.map((plot) => toSummary(plot, this.uiLocale)).reverse(),
      quota: {
        textRemaining: 2,
        textLimit: 3,
        voiceRemaining: 1,
        voiceLimit: 1,
        resetLabel: this.uiLocale === 'vi' ? 'Đặt lại lúc 00:00 UTC' : 'Resets at 00:00 UTC',
      },
      retention: {
        currentStreakDays: 2,
        choicesMade: 4,
        activePlots: active.length,
        dailyPrompt: previewDailyPrompt(this.storyLocale),
      },
    };
  }

  async loadLibrary(): Promise<StoryLibrarySnapshot> {
    const summaries = [...this.plots.values()].map((plot) => toSummary(plot, this.uiLocale)).reverse();
    return {
      active: summaries.filter((plot) => !this.archivedPlotIds.has(plot.id)),
      archived: summaries.filter((plot) => this.archivedPlotIds.has(plot.id)),
    };
  }

  async createPlot(draft: PlotDraft): Promise<StoryPlotSession> {
    const normalized = normalizePlotDraft(draft);
    if (hasDraftErrors(validatePlotDraft(normalized, this.uiLocale))) {
      throw new StoryClientError('invalid_input', 'The plot setup is incomplete.');
    }

    this.createdPlotCount += 1;
    const plotId = `preview-created-${this.createdPlotCount}`;
    const session: StoryPlotSession = {
      id: plotId,
      title: titleFromPremise(normalized.premise),
      premise: normalized.premise,
      mood: normalized.mood,
      characterName: normalized.characterName,
      episode: buildFirstEpisode(plotId, normalized, this.storyLocale),
    };
    this.plots.set(plotId, session);
    this.histories.set(plotId, [historyItem(session.episode)]);
    return cloneSession(session);
  }

  async loadPlot(plotId: string): Promise<StoryPlotSession> {
    return cloneSession(this.requirePlot(plotId));
  }

  async loadHistory(plotId: string): Promise<StoryHistorySnapshot> {
    const plot = this.requirePlot(plotId);
    const items = this.histories.get(plotId) ?? [historyItem(plot.episode)];
    return { plotId, title: plot.title, items: items.map((item) => ({ ...item })) };
  }

  async archivePlot(plotId: string): Promise<StoryPlotSummary> {
    const plot = this.requirePlot(plotId);
    this.archivedPlotIds.add(plotId);
    return toSummary(plot, this.uiLocale);
  }

  async restorePlot(plotId: string): Promise<StoryPlotSummary> {
    const plot = this.requirePlot(plotId);
    this.archivedPlotIds.delete(plotId);
    return toSummary(plot, this.uiLocale);
  }

  async commitChoice(plotId: string, episodeId: string, choiceId: string): Promise<StoryPlotSession> {
    const plot = this.requireActivePlot(plotId);
    const episode = plot.episode;
    if (episode.id !== episodeId) throw new StoryClientError('not_found', 'This episode is no longer current.');

    if (episode.status === 'choice_committed') {
      if (episode.committedChoiceId === choiceId) return cloneSession(plot);
      throw new StoryClientError('choice_conflict', 'Another choice is already committed for this episode.');
    }

    const choice = episode.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) throw new StoryClientError('not_found', 'That choice does not belong to this episode.');

    plot.episode = {
      ...episode,
      status: 'choice_committed',
      committedChoiceId: choice.id,
      committedConsequence: choice.consequence,
    };
    this.replaceCurrentHistory(plotId, historyItem(plot.episode));
    return cloneSession(plot);
  }

  async requestNextEpisode(plotId: string): Promise<StoryPlotSession> {
    const plot = this.requireActivePlot(plotId);
    if (plot.episode.status !== 'choice_committed' || !plot.episode.committedConsequence) {
      throw new StoryClientError('choice_required', 'Choose what happens before continuing.');
    }

    const previous = plot.episode;
    plot.episode = buildContinuationEpisode(plot, previous, this.storyLocale);
    const items = this.histories.get(plotId) ?? [];
    items.push(historyItem(plot.episode));
    this.histories.set(plotId, items);
    return cloneSession(plot);
  }

  private replaceCurrentHistory(plotId: string, item: StoryHistoryItem): void {
    const items = this.histories.get(plotId) ?? [];
    if (items.length === 0) items.push(item);
    else items[items.length - 1] = item;
    this.histories.set(plotId, items);
  }

  private requireActivePlot(plotId: string): StoryPlotSession {
    if (this.archivedPlotIds.has(plotId)) throw new StoryClientError('not_found', 'Archived stories are read-only until restored.');
    return this.requirePlot(plotId);
  }

  private requirePlot(plotId: string): StoryPlotSession {
    const plot = this.plots.get(plotId);
    if (!plot) throw new StoryClientError('not_found', 'This story could not be found.');
    return plot;
  }
}

export const storyExperienceClient: StoryExperienceClient = new PreviewStoryExperienceClient();

function previewDailyPrompt(storyLocale: StoryLocale): StoryHomeSnapshot['retention']['dailyPrompt'] {
  const vi = storyLocale === 'vi-VN';
  return {
    label: vi ? 'Tin nhắn sai thời điểm' : 'A message at the wrong time',
    premise: vi
      ? 'Một tin nhắn thoại đến từ người lẽ ra không thể liên lạc với bạn, và nó chứa một chi tiết chỉ bạn mới nhận ra.'
      : 'A voice note arrives from someone who should have no way to contact you, and it contains one detail only you would recognize.',
    mood: 'mysterious',
    characterName: 'Mina',
  };
}

function createSeedPlot(storyLocale: StoryLocale): StoryPlotSession {
  const plotId = 'preview-midnight-message';
  const vi = storyLocale === 'vi-VN';
  const episodeId = `${plotId}-episode-1`;
  return {
    id: plotId,
    title: vi ? 'Tin Nhắn Lúc Nửa Đêm' : 'The Midnight Message',
    premise: vi
      ? 'Mina nhận được tin nhắn thoại từ người chị mất tích ba năm sau ngày cô biến mất.'
      : 'Mina receives a voice note from her missing sister three years after she disappeared.',
    mood: 'mysterious',
    characterName: 'Mina',
    episode: {
      id: episodeId,
      number: 1,
      title: vi ? 'Giọng Nói Từ Ba Năm Trước' : 'A Voice From Three Years Ago',
      body: vi
        ? 'Lúc 0 giờ 07 phút, chiếc điện thoại đã hết pin của Mina tự sáng lên. Màn hình hiện một tin nhắn thoại mới từ Aya, người chị đã mất tích ba năm trước. Aya thì thầm biệt danh thời thơ ấu của Mina rồi nói cảnh sát đã tìm nhầm căn hộ. Phía sau đoạn ghi âm là tiếng chuông thang máy rất khẽ trong chính tòa nhà của Mina. Trước khi đoạn ghi âm kết thúc, Aya nói thêm một câu: “Đừng để hắn biết em đã nghe thấy.” Ngay lúc đó, có tiếng gõ cửa căn hộ.'
        : 'At 12:07 a.m., Mina’s dead phone lights up by itself. The screen shows one new voice note from Aya, her sister who vanished three years ago. Aya whispers Mina’s childhood nickname, then says the police searched the wrong apartment. Behind the message is the faint chime of the elevator in Mina’s own building. Before the recording ends, Aya says one more thing: “Do not let him know you heard this.” A knock lands on Mina’s front door.',
      summary: vi
        ? 'Mina nhận được một tin nhắn không thể tồn tại từ người chị mất tích, và ngay sau đó có người xuất hiện trước cửa.'
        : 'Mina receives an impossible message from her missing sister and someone immediately arrives at her door.',
      status: 'awaiting_choice',
      choices: vi
        ? makeChoices(episodeId, [
          ['A', 'Mở cửa thật khẽ', 'đối mặt người bên ngoài', 'Mina mở cửa và phát hiện ai đó để lại một thẻ khóa ướt sũng trước ngưỡng cửa.'],
          ['B', 'Nghe lại đoạn ghi âm và tách tiếng nền', 'tìm manh mối', 'Mina tách được tiếng chuông thang máy và nhận ra nó thuộc về một tầng lẽ ra không tồn tại.'],
          ['C', 'Gọi cho thám tử từng khép lại vụ án của Aya', 'tìm trợ giúp', 'Viên thám tử bắt máy ngay lập tức và dường như đã biết về tin nhắn mới.'],
        ])
        : makeChoices(episodeId, [
          ['A', 'Open the door without making a sound', 'confront the visitor', 'Mina opens the door and discovers someone left a wet keycard outside.'],
          ['B', 'Replay the note and inspect the background noise', 'search for evidence', 'Mina isolates the elevator chime and identifies a floor that should not exist.'],
          ['C', 'Call the detective who closed Aya’s case', 'seek official help', 'The detective answers immediately and already knows about the new message.'],
        ]),
    },
  };
}

function buildFirstEpisode(plotId: string, draft: PlotDraft, storyLocale: StoryLocale): StoryEpisode {
  const episodeId = `${plotId}-episode-1`;
  const vi = storyLocale === 'vi-VN';
  return {
    id: episodeId,
    number: 1,
    title: vi ? 'Bước Ngoặt Đầu Tiên' : 'The First Turn',
    body: vi
      ? `${draft.characterName} tưởng đây sẽ là một đêm bình thường. Nhưng rồi, ${lowercaseFirst(draft.premise)} Chi tiết đầu tiên có gì đó sai sai nhỏ đến mức có thể bỏ qua, nhưng lại quá riêng tư để ${draft.characterName} làm ngơ. Khi căn phòng im bặt, không còn lựa chọn nào thực sự trung lập.`
      : `${draft.characterName} thought this would be an ordinary night. Instead, ${lowercaseFirst(draft.premise)} The first detail that feels wrong is small enough to ignore, but personal enough that ${draft.characterName} cannot. By the time the room goes quiet, there is no neutral option left.`,
    summary: vi
      ? `${draft.characterName} bị kéo vào xung đột trung tâm và phải quyết định cách phản ứng.`
      : `${draft.characterName} is pulled into the central conflict and must decide how to respond.`,
    status: 'awaiting_choice',
    choices: vi
      ? makeChoices(episodeId, [
        ['A', 'Đối mặt vấn đề ngay lập tức', 'hành động trực diện', `${draft.characterName} buộc xung đột lộ ra trước khi bất kỳ ai kịp chuẩn bị.`],
        ['B', 'Chờ thêm một manh mối', 'điều tra trước', `${draft.characterName} phát hiện một chi tiết làm thay đổi hoàn toàn người đáng tin.`],
        ['C', 'Kéo một người khác vào bí mật', 'tìm đồng minh', `${draft.characterName} chia sẻ rủi ro và tạo ra một liên minh mới với cái giá chưa lộ rõ.`],
      ])
      : makeChoices(episodeId, [
        ['A', 'Confront the problem immediately', 'act directly', `${draft.characterName} forces the conflict into the open before anyone is ready.`],
        ['B', 'Wait and gather one more clue', 'investigate first', `${draft.characterName} learns one detail that changes who seems trustworthy.`],
        ['C', 'Bring someone else into the secret', 'seek an ally', `${draft.characterName} shares the risk, creating a new alliance with a hidden cost.`],
      ]),
  };
}

function buildContinuationEpisode(plot: StoryPlotSession, previous: StoryEpisode, storyLocale: StoryLocale): StoryEpisode {
  const number = previous.number + 1;
  const episodeId = `${plot.id}-episode-${number}`;
  const vi = storyLocale === 'vi-VN';
  const consequence = previous.committedConsequence ?? (vi ? 'Lựa chọn trước đó đã thay đổi điều sắp xảy ra.' : 'The previous decision changes what happens next.');
  return {
    id: episodeId,
    number,
    title: vi ? (number === 2 ? 'Hậu Quả Ập Đến' : 'Câu Chuyện Lại Rẽ Hướng') : (number === 2 ? 'The Consequence Arrives' : 'The Story Turns Again'),
    body: vi
      ? `${consequence} ${plot.characterName} không có thời gian để lấy lại nhịp. Lựa chọn vừa rồi lập tức thay đổi cán cân tin tưởng, và một chi tiết trong tình huống ban đầu — ${lowercaseFirst(plot.premise)} — giờ mang ý nghĩa khác. Trước khi ${plot.characterName} kịp ghép mọi thứ lại, một người khác hành động trước và buộc cảnh tiếp theo phải rẽ hướng.`
      : `${consequence} ${plot.characterName} has no time to reset. The choice changes the balance of trust immediately, and a new detail from the original situation—${lowercaseFirst(plot.premise)}—now means something different. Before ${plot.characterName} can settle on an explanation, another person acts first and forces the next decision.`,
    summary: vi
      ? `Tập ${number} tiếp nối trực tiếp hậu quả của lựa chọn đã chốt và mở ra một điểm quyết định mới.`
      : `Episode ${number} visibly follows the previously committed choice and creates a new decision point.`,
    status: 'awaiting_choice',
    choices: vi
      ? makeChoices(episodeId, [
        ['A', 'Đẩy mạnh khi lợi thế còn mới', 'leo thang', `${plot.characterName} giành thêm lợi thế nhưng để lộ nhiều hơn về kế hoạch.`],
        ['B', 'Đổi hướng trước khi người khác thích nghi', 'xoay hướng', `${plot.characterName} tránh được cái bẫy rõ ràng nhưng tạo ra một bất định mới.`],
        ['C', 'Bảo vệ mối quan hệ thay vì kế hoạch', 'ưu tiên niềm tin', `${plot.characterName} giữ được niềm tin nhưng đánh đổi quyền kiểm soát tức thời.`],
      ])
      : makeChoices(episodeId, [
        ['A', 'Push harder while the advantage is fresh', 'escalate', `${plot.characterName} gains leverage but exposes more of the plan.`],
        ['B', 'Change direction before anyone adapts', 'pivot', `${plot.characterName} avoids the obvious trap but creates a new uncertainty.`],
        ['C', 'Protect the relationship instead of the plan', 'prioritize trust', `${plot.characterName} preserves trust at the cost of losing immediate control.`],
      ]),
  };
}

function makeChoices(
  episodeId: string,
  definitions: readonly [
    readonly ['A', string, string, string],
    readonly ['B', string, string, string],
    readonly ['C', string, string, string],
  ],
): [StoryChoice, StoryChoice, StoryChoice] {
  return definitions.map(([key, label, intent, consequence]) => ({
    id: `${episodeId}-choice-${key}`,
    key,
    label,
    intent,
    consequence,
  })) as [StoryChoice, StoryChoice, StoryChoice];
}

function toSummary(plot: StoryPlotSession, uiLocale: UiLocale): StoryPlotSummary {
  return {
    id: plot.id,
    title: plot.title,
    premise: plot.premise,
    mood: plot.mood,
    characterName: plot.characterName,
    updatedLabel: uiLocale === 'vi' ? 'Vừa xong' : 'Just now',
    episodeNumber: plot.episode.number,
    status: plot.episode.status === 'awaiting_choice' ? 'awaiting_choice' : 'ready_for_next',
    resumeLine: plot.episode.status === 'choice_committed'
      ? plot.episode.committedConsequence ?? plot.episode.summary
      : plot.episode.summary,
  };
}

function historyItem(episode: StoryEpisode): StoryHistoryItem {
  const item: StoryHistoryItem = {
    episodeId: episode.id,
    episodeNumber: episode.number,
    title: episode.title,
    summary: episode.summary,
    status: episode.status,
  };
  if (episode.committedChoiceId) {
    const choice = episode.choices.find((candidate) => candidate.id === episode.committedChoiceId);
    if (choice) {
      item.choiceKey = choice.key;
      item.choiceLabel = choice.label;
    }
  }
  if (episode.committedConsequence) item.consequence = episode.committedConsequence;
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

function cloneSession(session: StoryPlotSession): StoryPlotSession {
  return {
    ...session,
    episode: {
      ...session.episode,
      choices: session.episode.choices.map((choice) => ({ ...choice })) as [StoryChoice, StoryChoice, StoryChoice],
    },
  };
}
