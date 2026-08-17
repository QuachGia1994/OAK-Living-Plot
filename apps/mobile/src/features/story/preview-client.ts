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
import { hasDraftErrors, normalizePlotDraft, validatePlotDraft } from './draft';

export class PreviewStoryExperienceClient implements StoryExperienceClient {
  private readonly plots = new Map<string, StoryPlotSession>();
  private readonly archivedPlotIds = new Set<string>();
  private readonly histories = new Map<string, StoryHistoryItem[]>();
  private createdPlotCount = 0;

  constructor() {
    const seeded = createSeedPlot();
    this.plots.set(seeded.id, seeded);
    this.histories.set(seeded.id, [historyItem(seeded.episode)]);
  }

  async loadHome(): Promise<StoryHomeSnapshot> {
    const active = [...this.plots.values()].filter((plot) => !this.archivedPlotIds.has(plot.id));
    return {
      recentPlots: active.map(toSummary).reverse(),
      quota: {
        textRemaining: 2,
        textLimit: 3,
        voiceRemaining: 1,
        voiceLimit: 1,
        resetLabel: 'Resets at 00:00 UTC',
      },
      retention: {
        currentStreakDays: 2,
        choicesMade: 4,
        activePlots: active.length,
        dailyPrompt: {
          label: 'A message at the wrong time',
          premise: 'A voice note arrives from someone who should have no way to contact you, and it contains one detail only you would recognize.',
          mood: 'mysterious',
          characterName: 'Mina',
        },
      },
    };
  }

  async loadLibrary(): Promise<StoryLibrarySnapshot> {
    const summaries = [...this.plots.values()].map(toSummary).reverse();
    return {
      active: summaries.filter((plot) => !this.archivedPlotIds.has(plot.id)),
      archived: summaries.filter((plot) => this.archivedPlotIds.has(plot.id)),
    };
  }

  async createPlot(draft: PlotDraft): Promise<StoryPlotSession> {
    const normalized = normalizePlotDraft(draft);
    if (hasDraftErrors(validatePlotDraft(normalized))) {
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
      episode: buildFirstEpisode(plotId, normalized),
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
    return toSummary(plot);
  }

  async restorePlot(plotId: string): Promise<StoryPlotSummary> {
    const plot = this.requirePlot(plotId);
    this.archivedPlotIds.delete(plotId);
    return toSummary(plot);
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
    plot.episode = buildContinuationEpisode(plot, previous);
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

function createSeedPlot(): StoryPlotSession {
  const plotId = 'preview-midnight-message';
  return {
    id: plotId,
    title: 'The Midnight Message',
    premise: 'Mina receives a voice note from her missing sister three years after she disappeared.',
    mood: 'mysterious',
    characterName: 'Mina',
    episode: {
      id: `${plotId}-episode-1`,
      number: 1,
      title: 'A Voice From Three Years Ago',
      body:
        'At 12:07 a.m., Mina’s dead phone lights up by itself. The screen shows one new voice note from Aya, her sister who vanished three years ago. Aya whispers Mina’s childhood nickname, then says the police searched the wrong apartment. Behind the message is the faint chime of the elevator in Mina’s own building. Before the recording ends, Aya says one more thing: “Do not let him know you heard this.” A knock lands on Mina’s front door.',
      summary: 'Mina receives an impossible message from her missing sister and someone immediately arrives at her door.',
      status: 'awaiting_choice',
      choices: makeChoices(`${plotId}-episode-1`, [
        ['A', 'Open the door without making a sound', 'confront the visitor', 'Mina opens the door and discovers someone left a wet keycard outside.'],
        ['B', 'Replay the note and inspect the background noise', 'search for evidence', 'Mina isolates the elevator chime and identifies a floor that should not exist.'],
        ['C', 'Call the detective who closed Aya’s case', 'seek official help', 'The detective answers immediately and already knows about the new message.'],
      ]),
    },
  };
}

function buildFirstEpisode(plotId: string, draft: PlotDraft): StoryEpisode {
  const episodeId = `${plotId}-episode-1`;
  return {
    id: episodeId,
    number: 1,
    title: 'The First Turn',
    body: `${draft.characterName} thought this would be an ordinary night. Instead, ${lowercaseFirst(draft.premise)} The first detail that feels wrong is small enough to ignore, but personal enough that ${draft.characterName} cannot. By the time the room goes quiet, there is no neutral option left.`,
    summary: `${draft.characterName} is pulled into the central conflict and must decide how to respond.`,
    status: 'awaiting_choice',
    choices: makeChoices(episodeId, [
      ['A', 'Confront the problem immediately', 'act directly', `${draft.characterName} forces the conflict into the open before anyone is ready.`],
      ['B', 'Wait and gather one more clue', 'investigate first', `${draft.characterName} learns one detail that changes who seems trustworthy.`],
      ['C', 'Bring someone else into the secret', 'seek an ally', `${draft.characterName} shares the risk, creating a new alliance with a hidden cost.`],
    ]),
  };
}

function buildContinuationEpisode(plot: StoryPlotSession, previous: StoryEpisode): StoryEpisode {
  const number = previous.number + 1;
  const episodeId = `${plot.id}-episode-${number}`;
  const consequence = previous.committedConsequence ?? 'The previous decision changes what happens next.';
  return {
    id: episodeId,
    number,
    title: number === 2 ? 'The Consequence Arrives' : `The Story Turns Again`,
    body: `${consequence} ${plot.characterName} has no time to reset. The choice changes the balance of trust immediately, and a new detail from the original situation—${lowercaseFirst(plot.premise)}—now means something different. Before ${plot.characterName} can settle on an explanation, another person acts first and forces the next decision.`,
    summary: `Episode ${number} visibly follows the previously committed choice and creates a new decision point.`,
    status: 'awaiting_choice',
    choices: makeChoices(episodeId, [
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

function toSummary(plot: StoryPlotSession): StoryPlotSummary {
  return {
    id: plot.id,
    title: plot.title,
    premise: plot.premise,
    mood: plot.mood,
    characterName: plot.characterName,
    updatedLabel: 'Just now',
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
