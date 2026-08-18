import type { Choice, Drama, DramaMood, Scene } from '@/features/drama/domain';
import type { DramaLocale, UiLocale } from '@/features/preferences/contracts';
import type {
  DramaDraft,
  DramaExperienceClient,
  DramaHistory,
  DramaHomeSnapshot,
  DramaLibrarySnapshot,
  DramaSummary,
} from './contracts';
import { DramaClientError } from './contracts';
import { createIdempotencyKey } from '../../lib/idempotency-key';
import { AuthenticatedJsonTransport, HttpTransportError, type FetchLike, type TokenProvider } from '../../lib/http-transport';

export class HttpDramaExperienceClient implements DramaExperienceClient {
  private readonly createGenerationKeys = new Map<string, string>();
  private readonly nextGenerationKeys = new Map<string, string>();
  private readonly transport: AuthenticatedJsonTransport;

  constructor(
    apiBaseUrl: string,
    tokenProvider: TokenProvider,
    fetcher: FetchLike = fetch,
    private readonly locale: DramaLocale = 'en-US',
    private readonly uiLocale: UiLocale = 'en',
    private readonly clock: () => number = Date.now,
    timeoutMs = 12_000,
  ) {
    this.transport = new AuthenticatedJsonTransport(apiBaseUrl, tokenProvider, fetcher, timeoutMs);
  }

  async loadHome(): Promise<DramaHomeSnapshot> {
    const payload = await this.request('/v1/dramas/home', 'GET');
    if (!isRecord(payload) || !isRecord(payload.home)) throw invalidBackendResponse();
    return parseHome(payload.home, this.clock(), this.uiLocale);
  }

  async loadLibrary(): Promise<DramaLibrarySnapshot> {
    const payload = await this.request('/v1/dramas/library', 'GET');
    if (!isRecord(payload) || !isRecord(payload.library)) throw invalidBackendResponse();
    return parseLibrary(payload.library, this.clock(), this.uiLocale);
  }

  async createDrama(draft: DramaDraft, creationKey = createIdempotencyKey('creation')): Promise<Drama> {
    const generationKey = this.createGenerationKeys.get(creationKey) ?? createIdempotencyKey('generation');
    this.createGenerationKeys.set(creationKey, generationKey);
    try {
      const payload = await this.request('/v1/dramas', 'POST', {
        creationKey,
        generationKey,
        premise: draft.premise.trim(),
        mood: draft.mood,
        characterName: draft.characterName.trim(),
        locale: this.locale,
      });
      this.createGenerationKeys.delete(creationKey);
      return parseDramaEnvelope(payload);
    } catch (error) {
      if (error instanceof DramaClientError && error.code === 'invalid_input') this.createGenerationKeys.delete(creationKey);
      throw error;
    }
  }

  async loadDrama(dramaId: string): Promise<Drama> {
    return parseDramaEnvelope(await this.request(`/v1/dramas/${encodeURIComponent(dramaId)}`, 'GET'));
  }

  async loadHistory(dramaId: string): Promise<DramaHistory> {
    const payload = await this.request(`/v1/dramas/${encodeURIComponent(dramaId)}/history`, 'GET');
    if (!isRecord(payload) || !isRecord(payload.history)) throw invalidBackendResponse();
    return parseHistory(payload.history);
  }

  async archiveDrama(dramaId: string): Promise<DramaSummary> {
    return this.changeLifecycle(dramaId, 'archive');
  }

  async restoreDrama(dramaId: string): Promise<DramaSummary> {
    return this.changeLifecycle(dramaId, 'restore');
  }

  async commitChoice(dramaId: string, sceneId: string, choiceId: string): Promise<Drama> {
    const path = `/v1/dramas/${encodeURIComponent(dramaId)}/scenes/${encodeURIComponent(sceneId)}/choices/${encodeURIComponent(choiceId)}`;
    try {
      return parseDramaEnvelope(await this.request(path, 'POST'));
    } catch (error) {
      if (error instanceof DramaClientError && (error.code === 'choice_conflict' || error.code === 'choice_required')) {
        return this.loadDrama(dramaId);
      }
      throw error;
    }
  }

  async requestNextScene(dramaId: string): Promise<Drama> {
    const generationKey = this.nextGenerationKeys.get(dramaId) ?? createIdempotencyKey('generation');
    this.nextGenerationKeys.set(dramaId, generationKey);
    try {
      const drama = parseDramaEnvelope(await this.request(
        `/v1/dramas/${encodeURIComponent(dramaId)}/scenes`,
        'POST',
        { generationKey },
      ));
      this.nextGenerationKeys.delete(dramaId);
      return drama;
    } catch (error) {
      if (error instanceof DramaClientError && error.code === 'choice_required') {
        this.nextGenerationKeys.delete(dramaId);
        return this.loadDrama(dramaId);
      }
      if (error instanceof DramaClientError && error.code === 'invalid_input') this.nextGenerationKeys.delete(dramaId);
      throw error;
    }
  }

  private async changeLifecycle(dramaId: string, action: 'archive' | 'restore'): Promise<DramaSummary> {
    const payload = await this.request(`/v1/dramas/${encodeURIComponent(dramaId)}/${action}`, 'POST');
    if (!isRecord(payload) || !isRecord(payload.dramaSummary)) throw invalidBackendResponse();
    return parseDramaSummary(payload.dramaSummary, this.clock(), this.uiLocale);
  }

  private async request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    try {
      const response = await this.transport.request(path, method, body);
      if (!response.jsonValid && response.ok) throw invalidBackendResponse();
      if (!response.ok) throw mapHttpError(response.status, response.payload);
      return response.payload;
    } catch (error) {
      if (error instanceof DramaClientError) throw error;
      if (error instanceof HttpTransportError && error.code === 'auth_required') {
        throw new DramaClientError('auth_required', 'Sign in before using canonical Living Plot dramas.');
      }
      throw new DramaClientError(
        'backend_unavailable',
        error instanceof HttpTransportError && error.code === 'timeout'
          ? 'The Living Plot server took too long to respond.'
          : 'The Living Plot server could not be reached.',
      );
    }
  }
}

export class AuthRequiredDramaExperienceClient implements DramaExperienceClient {
  private fail(): never {
    throw new DramaClientError('auth_required', 'Sign in before using canonical Living Plot dramas.');
  }
  async loadHome(): Promise<DramaHomeSnapshot> { return this.fail(); }
  async loadLibrary(): Promise<DramaLibrarySnapshot> { return this.fail(); }
  async createDrama(): Promise<Drama> { return this.fail(); }
  async loadDrama(): Promise<Drama> { return this.fail(); }
  async loadHistory(): Promise<DramaHistory> { return this.fail(); }
  async archiveDrama(): Promise<DramaSummary> { return this.fail(); }
  async restoreDrama(): Promise<DramaSummary> { return this.fail(); }
  async commitChoice(): Promise<Drama> { return this.fail(); }
  async requestNextScene(): Promise<Drama> { return this.fail(); }
}

function parseDramaEnvelope(payload: unknown): Drama {
  if (!isRecord(payload) || !isRecord(payload.drama)) throw invalidBackendResponse();
  return parseDrama(payload.drama);
}

function parseDrama(value: Record<string, unknown>): Drama {
  if (
    typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.premise !== 'string' ||
    !isMood(value.mood) || !isRecord(value.leadCharacter) || !isRecord(value.currentScene)
  ) throw invalidBackendResponse();
  const lead = value.leadCharacter;
  if (typeof lead.id !== 'string' || typeof lead.name !== 'string' || lead.role !== 'protagonist') throw invalidBackendResponse();
  return {
    id: value.id,
    title: value.title,
    premise: value.premise,
    mood: value.mood,
    leadCharacter: { id: lead.id, name: lead.name, role: 'protagonist' },
    currentScene: parseScene(value.currentScene),
  };
}

function parseScene(value: Record<string, unknown>): Scene {
  if (
    typeof value.id !== 'string' || !Number.isInteger(value.number) || typeof value.title !== 'string' ||
    typeof value.script !== 'string' || typeof value.summary !== 'string' || !Array.isArray(value.choices) || !isRecord(value.branch)
  ) throw invalidBackendResponse();
  const choices = value.choices.map(parseChoice);
  if (choices.length !== 3 || choices.map((choice) => choice.key).join(',') !== 'A,B,C') throw invalidBackendResponse();
  const branch = value.branch;
  if (branch.state !== 'open' && branch.state !== 'committed') throw invalidBackendResponse();
  if (branch.state === 'committed' && (typeof branch.choiceId !== 'string' || typeof branch.consequence !== 'string')) {
    throw invalidBackendResponse();
  }
  return {
    id: value.id,
    number: Number(value.number),
    title: value.title,
    script: value.script,
    summary: value.summary,
    choices: choices as [Choice, Choice, Choice],
    branch: branch.state === 'open'
      ? { state: 'open' }
      : { state: 'committed', choiceId: branch.choiceId as string, consequence: branch.consequence as string },
  };
}

function parseChoice(value: unknown): Choice {
  if (!isRecord(value) || typeof value.id !== 'string' || !isChoiceKey(value.key) || typeof value.label !== 'string' || typeof value.intent !== 'string' || typeof value.consequence !== 'string') {
    throw invalidBackendResponse();
  }
  return { id: value.id, key: value.key, label: value.label, intent: value.intent, consequence: value.consequence };
}

function parseHome(value: Record<string, unknown>, nowMs: number, uiLocale: UiLocale): DramaHomeSnapshot {
  if (!Array.isArray(value.recentDramas) || !isRecord(value.quota)) throw invalidBackendResponse();
  const quota = value.quota;
  if (![quota.textRemaining, quota.textLimit, quota.voiceRemaining, quota.voiceLimit].every(Number.isInteger) || typeof quota.resetAt !== 'string') {
    throw invalidBackendResponse();
  }
  return {
    recentDramas: value.recentDramas.map((drama) => parseDramaSummary(drama, nowMs, uiLocale)),
    quota: {
      textRemaining: Number(quota.textRemaining),
      textLimit: Number(quota.textLimit),
      voiceRemaining: Number(quota.voiceRemaining),
      voiceLimit: Number(quota.voiceLimit),
      resetLabel: resetLabel(quota.resetAt, uiLocale),
    },
    retention: parseRetention(value.retention),
  };
}

function parseLibrary(value: Record<string, unknown>, nowMs: number, uiLocale: UiLocale): DramaLibrarySnapshot {
  if (!Array.isArray(value.active) || !Array.isArray(value.archived)) throw invalidBackendResponse();
  return {
    active: value.active.map((drama) => parseDramaSummary(drama, nowMs, uiLocale)),
    archived: value.archived.map((drama) => parseDramaSummary(drama, nowMs, uiLocale)),
  };
}

function parseHistory(value: Record<string, unknown>): DramaHistory {
  if (typeof value.dramaId !== 'string' || typeof value.title !== 'string' || !Array.isArray(value.items)) throw invalidBackendResponse();
  return {
    dramaId: value.dramaId,
    title: value.title,
    items: value.items.map((item) => {
      if (
        !isRecord(item) || typeof item.sceneId !== 'string' || !Number.isInteger(item.sceneNumber) ||
        typeof item.title !== 'string' || typeof item.summary !== 'string' ||
        (item.branchState !== 'open' && item.branchState !== 'committed')
      ) throw invalidBackendResponse();
      const parsed: DramaHistory['items'][number] = {
        sceneId: item.sceneId,
        sceneNumber: Number(item.sceneNumber),
        title: item.title,
        summary: item.summary,
        branchState: item.branchState,
      };
      if (item.choiceKey !== undefined) {
        if (!isChoiceKey(item.choiceKey)) throw invalidBackendResponse();
        parsed.choiceKey = item.choiceKey;
      }
      if (item.choiceLabel !== undefined) {
        if (typeof item.choiceLabel !== 'string') throw invalidBackendResponse();
        parsed.choiceLabel = item.choiceLabel;
      }
      if (item.consequence !== undefined) {
        if (typeof item.consequence !== 'string') throw invalidBackendResponse();
        parsed.consequence = item.consequence;
      }
      return parsed;
    }),
  };
}

function parseDramaSummary(value: unknown, nowMs: number, uiLocale: UiLocale): DramaSummary {
  if (
    !isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.premise !== 'string' ||
    !isMood(value.mood) || typeof value.characterName !== 'string' || !Number.isInteger(value.updatedAt) ||
    !Number.isInteger(value.sceneNumber) || (value.status !== 'awaiting_choice' && value.status !== 'ready_for_next_scene') ||
    typeof value.resumeLine !== 'string'
  ) throw invalidBackendResponse();
  return {
    id: value.id,
    title: value.title,
    premise: value.premise,
    mood: value.mood,
    characterName: value.characterName,
    updatedLabel: relativeUpdatedLabel(Number(value.updatedAt), nowMs, uiLocale),
    sceneNumber: Number(value.sceneNumber),
    status: value.status,
    resumeLine: value.resumeLine,
  };
}

function parseRetention(value: unknown): DramaHomeSnapshot['retention'] {
  if (
    !isRecord(value) || !Number.isInteger(value.currentStreakDays) || !Number.isInteger(value.choicesMade) ||
    !Number.isInteger(value.activeDramas) || !isRecord(value.dailyPrompt)
  ) throw invalidBackendResponse();
  const prompt = value.dailyPrompt;
  if (typeof prompt.label !== 'string' || typeof prompt.premise !== 'string' || !isMood(prompt.mood) || typeof prompt.characterName !== 'string') {
    throw invalidBackendResponse();
  }
  return {
    currentStreakDays: Number(value.currentStreakDays),
    choicesMade: Number(value.choicesMade),
    activeDramas: Number(value.activeDramas),
    dailyPrompt: { label: prompt.label, premise: prompt.premise, mood: prompt.mood, characterName: prompt.characterName },
  };
}

function mapHttpError(status: number, payload: unknown): DramaClientError {
  const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
  if (status === 401) return new DramaClientError('auth_required', 'Your session expired. Sign in again.');
  if (status === 404 || code === 'not_found') return new DramaClientError('not_found', 'This drama could not be found.');
  if (code === 'choice_conflict') return new DramaClientError('choice_conflict', 'Another choice is already canonical for this scene.');
  if (code === 'choice_required' || code === 'stale_state' || code === 'creation_conflict') return new DramaClientError('choice_required', 'The drama changed on the server. Reload before continuing.');
  if (status === 429 || code === 'quota_exceeded') return new DramaClientError('quota_exceeded', 'Today’s drama generation allowance is exhausted.');
  if (status === 503 || code === 'provider_unavailable') return new DramaClientError('provider_unavailable', 'Drama generation is temporarily unavailable.');
  if (status === 502 || code === 'invalid_generation') return new DramaClientError('invalid_generation', 'The generated scene did not satisfy the canonical drama contract.');
  if (status === 400 || code === 'invalid_input') return new DramaClientError('invalid_input', 'The drama request is invalid.');
  return new DramaClientError('backend_unavailable', 'The Living Plot server could not complete the request.');
}

function resetLabel(resetAt: string, uiLocale: UiLocale): string {
  if (!Number.isFinite(Date.parse(resetAt))) return uiLocale === 'vi' ? 'Đặt lại hằng ngày theo UTC' : 'UTC daily reset';
  return uiLocale === 'vi' ? 'Đặt lại lúc 00:00 UTC' : 'Resets at 00:00 UTC';
}

function relativeUpdatedLabel(updatedAt: number, nowMs: number, uiLocale: UiLocale): string {
  const deltaMinutes = Math.max(0, Math.floor((nowMs - updatedAt) / 60_000));
  if (deltaMinutes < 2) return uiLocale === 'vi' ? 'Vừa xong' : 'Just now';
  if (deltaMinutes < 60) return uiLocale === 'vi' ? `${deltaMinutes} phút trước` : `${deltaMinutes}m ago`;
  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) return uiLocale === 'vi' ? `${hours} giờ trước` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return uiLocale === 'vi' ? 'Hôm qua' : 'Yesterday';
  return uiLocale === 'vi' ? `${Math.min(days, 99)} ngày trước` : `${Math.min(days, 99)}d ago`;
}

function invalidBackendResponse(): DramaClientError {
  return new DramaClientError('backend_unavailable', 'The Living Plot server returned an invalid response.');
}

function isMood(value: unknown): value is DramaMood {
  return value === 'tense' || value === 'romantic' || value === 'mysterious' || value === 'hopeful';
}

function isChoiceKey(value: unknown): value is 'A' | 'B' | 'C' {
  return value === 'A' || value === 'B' || value === 'C';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
