import type {
  PlotDraft,
  StoryChoice,
  StoryEpisode,
  StoryExperienceClient,
  StoryHomeSnapshot,
  StoryMood,
  StoryPlotSession,
  StoryPlotSummary,
} from './contracts';
import { StoryClientError } from './contracts';
import { createStoryRequestKey } from './request-key';

type TokenProvider = () => Promise<string | null>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class HttpStoryExperienceClient implements StoryExperienceClient {
  private readonly createGenerationKeys = new Map<string, string>();
  private readonly nextGenerationKeys = new Map<string, string>();

  constructor(
    private readonly apiBaseUrl: string,
    private readonly tokenProvider: TokenProvider,
    private readonly fetcher: FetchLike = fetch,
    private readonly locale = 'en-US',
    private readonly clock: () => number = Date.now,
  ) {}

  async loadHome(): Promise<StoryHomeSnapshot> {
    const payload = await this.request('/v1/story/home', 'GET');
    if (!isRecord(payload) || !isRecord(payload.home)) throw invalidBackendResponse();
    return parseHome(payload.home, this.clock());
  }

  async createPlot(draft: PlotDraft, creationKey = createStoryRequestKey('creation')): Promise<StoryPlotSession> {
    const generationKey = this.createGenerationKeys.get(creationKey) ?? createStoryRequestKey('generation');
    this.createGenerationKeys.set(creationKey, generationKey);
    try {
      const payload = await this.request('/v1/story/plots', 'POST', {
        creationKey,
        generationKey,
        premise: draft.premise.trim(),
        mood: draft.mood,
        characterName: draft.characterName.trim(),
        locale: this.locale,
      });
      this.createGenerationKeys.delete(creationKey);
      return parseStoryEnvelope(payload);
    } catch (error) {
      if (error instanceof StoryClientError && error.code === 'invalid_input') this.createGenerationKeys.delete(creationKey);
      throw error;
    }
  }

  async loadPlot(plotId: string): Promise<StoryPlotSession> {
    return parseStoryEnvelope(await this.request(`/v1/story/plots/${encodeURIComponent(plotId)}`, 'GET'));
  }

  async commitChoice(plotId: string, episodeId: string, choiceId: string): Promise<StoryPlotSession> {
    const path = `/v1/story/plots/${encodeURIComponent(plotId)}/episodes/${encodeURIComponent(episodeId)}/choices/${encodeURIComponent(choiceId)}`;
    try {
      return parseStoryEnvelope(await this.request(path, 'POST'));
    } catch (error) {
      if (error instanceof StoryClientError && (error.code === 'choice_conflict' || error.code === 'choice_required')) {
        return this.loadPlot(plotId);
      }
      throw error;
    }
  }

  async requestNextEpisode(plotId: string): Promise<StoryPlotSession> {
    const generationKey = this.nextGenerationKeys.get(plotId) ?? createStoryRequestKey('generation');
    this.nextGenerationKeys.set(plotId, generationKey);
    try {
      const story = parseStoryEnvelope(await this.request(
        `/v1/story/plots/${encodeURIComponent(plotId)}/episodes`,
        'POST',
        { generationKey },
      ));
      this.nextGenerationKeys.delete(plotId);
      return story;
    } catch (error) {
      if (error instanceof StoryClientError && error.code === 'choice_required') {
        this.nextGenerationKeys.delete(plotId);
        return this.loadPlot(plotId);
      }
      if (error instanceof StoryClientError && error.code === 'invalid_input') this.nextGenerationKeys.delete(plotId);
      throw error;
    }
  }

  private async request(path: string, method: string, body?: unknown): Promise<unknown> {
    const base = this.apiBaseUrl.trim().replace(/\/$/, '');
    if (!base) throw new StoryClientError('backend_unavailable', 'Living Plot API URL is not configured.');
    const token = await this.tokenProvider();
    if (!token) throw new StoryClientError('auth_required', 'Sign in before using canonical Living Plot stories.');

    let response: Response;
    try {
      response = await this.fetcher(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new StoryClientError('backend_unavailable', 'The Living Plot server could not be reached.');
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      if (response.ok) throw invalidBackendResponse();
    }
    if (!response.ok) throw mapHttpError(response.status, payload);
    return payload;
  }
}

export class AuthRequiredStoryExperienceClient implements StoryExperienceClient {
  private fail(): never {
    throw new StoryClientError('auth_required', 'Sign in before using canonical Living Plot stories.');
  }
  async loadHome(): Promise<StoryHomeSnapshot> { return this.fail(); }
  async createPlot(): Promise<StoryPlotSession> { return this.fail(); }
  async loadPlot(): Promise<StoryPlotSession> { return this.fail(); }
  async commitChoice(): Promise<StoryPlotSession> { return this.fail(); }
  async requestNextEpisode(): Promise<StoryPlotSession> { return this.fail(); }
}

function parseStoryEnvelope(payload: unknown): StoryPlotSession {
  if (!isRecord(payload) || !isRecord(payload.story)) throw invalidBackendResponse();
  return parseStory(payload.story);
}

function parseStory(value: Record<string, unknown>): StoryPlotSession {
  if (
    typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.premise !== 'string' ||
    !isMood(value.mood) || typeof value.characterName !== 'string' || !isRecord(value.episode)
  ) throw invalidBackendResponse();
  return {
    id: value.id,
    title: value.title,
    premise: value.premise,
    mood: value.mood,
    characterName: value.characterName,
    episode: parseEpisode(value.episode),
  };
}

function parseEpisode(value: Record<string, unknown>): StoryEpisode {
  if (
    typeof value.id !== 'string' || !Number.isInteger(value.number) || typeof value.title !== 'string' ||
    typeof value.body !== 'string' || typeof value.summary !== 'string' ||
    (value.status !== 'awaiting_choice' && value.status !== 'choice_committed') || !Array.isArray(value.choices)
  ) throw invalidBackendResponse();
  const choices = value.choices.map(parseChoice);
  if (choices.length !== 3 || choices.map((choice) => choice.key).join(',') !== 'A,B,C') throw invalidBackendResponse();
  const episode: StoryEpisode = {
    id: value.id,
    number: Number(value.number),
    title: value.title,
    body: value.body,
    summary: value.summary,
    status: value.status,
    choices: choices as [StoryChoice, StoryChoice, StoryChoice],
  };
  if (typeof value.committedChoiceId === 'string') episode.committedChoiceId = value.committedChoiceId;
  if (typeof value.committedConsequence === 'string') episode.committedConsequence = value.committedConsequence;
  return episode;
}

function parseChoice(value: unknown): StoryChoice {
  if (!isRecord(value) || typeof value.id !== 'string' || !isChoiceKey(value.key) || typeof value.label !== 'string' || typeof value.intent !== 'string' || typeof value.consequence !== 'string') {
    throw invalidBackendResponse();
  }
  return { id: value.id, key: value.key, label: value.label, intent: value.intent, consequence: value.consequence };
}

function parseHome(value: Record<string, unknown>, nowMs: number): StoryHomeSnapshot {
  if (!Array.isArray(value.recentPlots) || !isRecord(value.quota)) throw invalidBackendResponse();
  const quota = value.quota;
  if (![quota.textRemaining, quota.textLimit, quota.voiceRemaining, quota.voiceLimit].every(Number.isInteger) || typeof quota.resetAt !== 'string') {
    throw invalidBackendResponse();
  }
  return {
    recentPlots: value.recentPlots.map((plot) => parsePlotSummary(plot, nowMs)),
    quota: {
      textRemaining: Number(quota.textRemaining),
      textLimit: Number(quota.textLimit),
      voiceRemaining: Number(quota.voiceRemaining),
      voiceLimit: Number(quota.voiceLimit),
      resetLabel: resetLabel(quota.resetAt),
    },
    retention: parseRetention(value.retention),
  };
}

function parsePlotSummary(value: unknown, nowMs: number): StoryPlotSummary {
  if (
    !isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.premise !== 'string' ||
    !isMood(value.mood) || typeof value.characterName !== 'string' || !Number.isInteger(value.updatedAt) ||
    !Number.isInteger(value.episodeNumber) || (value.status !== 'awaiting_choice' && value.status !== 'ready_for_next') ||
    typeof value.resumeLine !== 'string'
  ) throw invalidBackendResponse();
  return {
    id: value.id,
    title: value.title,
    premise: value.premise,
    mood: value.mood,
    characterName: value.characterName,
    updatedLabel: relativeUpdatedLabel(Number(value.updatedAt), nowMs),
    episodeNumber: Number(value.episodeNumber),
    status: value.status,
    resumeLine: value.resumeLine,
  };
}

function parseRetention(value: unknown): StoryHomeSnapshot['retention'] {
  if (
    !isRecord(value) || !Number.isInteger(value.currentStreakDays) || !Number.isInteger(value.choicesMade) ||
    !Number.isInteger(value.activePlots) || !isRecord(value.dailyPrompt)
  ) throw invalidBackendResponse();
  const prompt = value.dailyPrompt;
  if (
    typeof prompt.label !== 'string' || typeof prompt.premise !== 'string' ||
    !isMood(prompt.mood) || typeof prompt.characterName !== 'string'
  ) throw invalidBackendResponse();
  return {
    currentStreakDays: Number(value.currentStreakDays),
    choicesMade: Number(value.choicesMade),
    activePlots: Number(value.activePlots),
    dailyPrompt: {
      label: prompt.label,
      premise: prompt.premise,
      mood: prompt.mood,
      characterName: prompt.characterName,
    },
  };
}

function mapHttpError(status: number, payload: unknown): StoryClientError {
  const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
  if (status === 401) return new StoryClientError('auth_required', 'Your session expired. Sign in again.');
  if (status === 404 || code === 'not_found') return new StoryClientError('not_found', 'This story could not be found.');
  if (code === 'choice_conflict') return new StoryClientError('choice_conflict', 'Another choice is already canonical for this episode.');
  if (code === 'choice_required' || code === 'stale_state' || code === 'creation_conflict') return new StoryClientError('choice_required', 'The story changed on the server. Reload before continuing.');
  if (status === 429 || code === 'quota_exceeded') return new StoryClientError('quota_exceeded', 'Today’s story generation allowance is exhausted.');
  if (status === 503 || code === 'provider_unavailable') return new StoryClientError('provider_unavailable', 'Story generation is temporarily unavailable.');
  if (status === 400 || code === 'invalid_input') return new StoryClientError('invalid_input', 'The story request is invalid.');
  return new StoryClientError('backend_unavailable', 'The Living Plot server could not complete the request.');
}

function resetLabel(resetAt: string): string {
  return Number.isFinite(Date.parse(resetAt)) ? 'Resets at 00:00 UTC' : 'UTC daily reset';
}

function relativeUpdatedLabel(updatedAt: number, nowMs: number): string {
  const deltaMinutes = Math.max(0, Math.floor((nowMs - updatedAt) / 60_000));
  if (deltaMinutes < 2) return 'Just now';
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${Math.min(days, 99)}d ago`;
}

function invalidBackendResponse(): StoryClientError {
  return new StoryClientError('backend_unavailable', 'The Living Plot server returned an invalid response.');
}

function isMood(value: unknown): value is StoryMood {
  return value === 'tense' || value === 'romantic' || value === 'mysterious' || value === 'hopeful';
}

function isChoiceKey(value: unknown): value is 'A' | 'B' | 'C' {
  return value === 'A' || value === 'B' || value === 'C';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
