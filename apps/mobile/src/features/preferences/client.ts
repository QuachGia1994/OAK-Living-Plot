import { AuthenticatedJsonTransport, type FetchLike, type TokenProvider } from '../../lib/http-transport';
import type { NarratorVariant, PreferencesClient, StoryLocale, UiLocale, UserPreferences } from './contracts';
import { defaultUserPreferences } from './contracts';

export class HttpPreferencesClient implements PreferencesClient {
  readonly configured = true;
  private readonly transport: AuthenticatedJsonTransport;

  constructor(apiBaseUrl: string, tokenProvider: TokenProvider, fetcher: FetchLike = fetch) {
    this.transport = new AuthenticatedJsonTransport(apiBaseUrl, tokenProvider, fetcher);
  }

  async load(): Promise<UserPreferences> {
    return parseEnvelope(await this.transport.request('/v1/preferences', 'GET'));
  }

  async save(preferences: Omit<UserPreferences, 'updatedAt'>): Promise<UserPreferences> {
    return parseEnvelope(await this.transport.request('/v1/preferences', 'POST', preferences));
  }
}

export class PreviewPreferencesClient implements PreferencesClient {
  readonly configured = false;
  private value: UserPreferences;

  constructor(seed: UserPreferences = defaultFromDevice()) {
    this.value = { ...seed };
  }

  async load(): Promise<UserPreferences> { return { ...this.value }; }

  async save(preferences: Omit<UserPreferences, 'updatedAt'>): Promise<UserPreferences> {
    this.value = { ...preferences, updatedAt: Date.now() };
    return { ...this.value };
  }
}

function parseEnvelope(response: { ok: boolean; status: number; payload: unknown; jsonValid: boolean }): UserPreferences {
  if (!response.ok || !response.jsonValid || !isRecord(response.payload) || !isRecord(response.payload.preferences)) {
    throw new Error('Preferences response is unavailable.');
  }
  const value = response.payload.preferences;
  if (!isUiLocale(value.uiLocale) || !isStoryLocale(value.storyLocale) || !isNarratorVariant(value.narratorVariant)) {
    throw new Error('Preferences response is invalid.');
  }
  if (value.updatedAt !== null && !Number.isInteger(value.updatedAt)) throw new Error('Preferences timestamp is invalid.');
  return {
    uiLocale: value.uiLocale,
    storyLocale: value.storyLocale,
    narratorVariant: value.narratorVariant,
    updatedAt: value.updatedAt === null ? null : Number(value.updatedAt),
  };
}

function defaultFromDevice(): UserPreferences {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale?.toLowerCase() ?? 'en-us';
  if (locale.startsWith('vi')) {
    return { uiLocale: 'vi', storyLocale: 'vi-VN', narratorVariant: 'vi-narrator-female', updatedAt: null };
  }
  return { ...defaultUserPreferences };
}

function isUiLocale(value: unknown): value is UiLocale { return value === 'en' || value === 'vi'; }
function isStoryLocale(value: unknown): value is StoryLocale { return value === 'en-US' || value === 'vi-VN'; }
function isNarratorVariant(value: unknown): value is NarratorVariant {
  return value === 'en-narrator-female' || value === 'vi-narrator-female';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
