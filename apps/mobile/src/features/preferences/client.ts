import { AuthenticatedJsonTransport, type FetchLike, type TokenProvider } from '../../lib/http-transport';
import type { DramaLocale, NarratorVariant, PreferencesClient, UiLocale, UserPreferences } from './contracts';
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

const PREVIEW_PREFERENCES_KEY = 'living-plot.preview-preferences.v1';

export class PreviewPreferencesClient implements PreferencesClient {
  readonly configured = false;
  private value: UserPreferences;
  private readonly persistToDevice: boolean;

  constructor(seed?: UserPreferences) {
    this.value = { ...(seed ?? defaultFromDevice()) };
    this.persistToDevice = seed === undefined;
  }

  async load(): Promise<UserPreferences> {
    if (this.persistToDevice) {
      const stored = await loadPreviewPreferencesFromDevice();
      if (stored) this.value = stored;
    }
    return { ...this.value };
  }

  async save(preferences: Omit<UserPreferences, 'updatedAt'>): Promise<UserPreferences> {
    this.value = { ...preferences, updatedAt: Date.now() };
    if (this.persistToDevice) await savePreviewPreferencesToDevice(this.value);
    return { ...this.value };
  }
}

function parseEnvelope(response: { ok: boolean; status: number; payload: unknown; jsonValid: boolean }): UserPreferences {
  if (!response.ok || !response.jsonValid || !isRecord(response.payload) || !isRecord(response.payload.preferences)) {
    throw new Error('Preferences response is unavailable.');
  }
  const value = response.payload.preferences;
  if (!isUiLocale(value.uiLocale) || !isDramaLocale(value.dramaLocale) || !isNarratorVariant(value.narratorVariant)) {
    throw new Error('Preferences response is invalid.');
  }
  if (value.updatedAt !== null && !Number.isInteger(value.updatedAt)) throw new Error('Preferences timestamp is invalid.');
  return {
    uiLocale: value.uiLocale,
    dramaLocale: value.dramaLocale,
    narratorVariant: value.narratorVariant,
    updatedAt: value.updatedAt === null ? null : Number(value.updatedAt),
  };
}

async function loadPreviewPreferencesFromDevice(): Promise<UserPreferences | null> {
  try {
    const secureStore = await import('expo-secure-store');
    const raw = await secureStore.getItemAsync(PREVIEW_PREFERENCES_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isUiLocale(parsed.uiLocale) || !isNarratorVariant(parsed.narratorVariant)) return null;
    const dramaLocale = isDramaLocale(parsed.dramaLocale)
      ? parsed.dramaLocale
      : isDramaLocale(parsed.storyLocale) ? parsed.storyLocale : null;
    if (!dramaLocale) return null;
    return {
      uiLocale: parsed.uiLocale,
      dramaLocale,
      narratorVariant: parsed.narratorVariant,
      updatedAt: typeof parsed.updatedAt === 'number' && Number.isInteger(parsed.updatedAt) ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
}

async function savePreviewPreferencesToDevice(preferences: UserPreferences): Promise<void> {
  try {
    const secureStore = await import('expo-secure-store');
    await secureStore.setItemAsync(PREVIEW_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preview persistence is best-effort; the in-memory preference remains authoritative for this session.
  }
}

function defaultFromDevice(): UserPreferences {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale?.toLowerCase() ?? 'en-us';
  if (locale.startsWith('vi')) {
    return { uiLocale: 'vi', dramaLocale: 'vi-VN', narratorVariant: 'vi-narrator-female', updatedAt: null };
  }
  return { ...defaultUserPreferences };
}

function isUiLocale(value: unknown): value is UiLocale { return value === 'en' || value === 'vi'; }
function isDramaLocale(value: unknown): value is DramaLocale { return value === 'en-US' || value === 'vi-VN'; }
function isNarratorVariant(value: unknown): value is NarratorVariant {
  return value === 'en-narrator-female' || value === 'vi-narrator-female';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
