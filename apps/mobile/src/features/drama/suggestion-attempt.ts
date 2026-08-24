import { createIdempotencyKey } from '../../lib/idempotency-key';

const DEVICE_STORAGE_KEY = 'living-plot.pending-drama-suggestion.v1';

export interface SuggestionAttemptStorage {
  load(): Promise<string | null>;
  save(value: string): Promise<void>;
  remove(): Promise<void>;
}

export interface SuggestionAttempt {
  fingerprint: string;
  key: string;
}

interface StoredSuggestionAttempt extends SuggestionAttempt {
  ownerId: string;
}

export class SuggestionAttemptCoordinator {
  private current: StoredSuggestionAttempt | null = null;
  private readonly completed = new Set<string>();

  constructor(
    private readonly storage: SuggestionAttemptStorage = deviceSuggestionAttemptStorage,
    private readonly keyFactory: () => string = () => createIdempotencyKey('suggestion'),
  ) {}

  async resolve(ownerId: string, fingerprint: string): Promise<SuggestionAttempt> {
    const owner = requiredValue(ownerId, 'Suggestion owner');
    const requestFingerprint = requiredValue(fingerprint, 'Suggestion fingerprint');
    const stored = this.current ?? await this.loadStored();
    if (stored && stored.ownerId === owner && stored.fingerprint === requestFingerprint) {
      this.current = stored;
      return toAttempt(stored);
    }

    const next: StoredSuggestionAttempt = { ownerId: owner, fingerprint: requestFingerprint, key: this.keyFactory() };
    this.current = next;
    await this.saveStored(next);
    return toAttempt(next);
  }

  async complete(ownerId: string, fingerprint: string, key: string): Promise<void> {
    const signature = recordSignature({ ownerId, fingerprint, key });
    const stored = this.current ?? await this.loadStored();
    if (!stored || recordSignature(stored) !== signature) return;

    this.current = null;
    this.completed.add(signature);
    try {
      await this.storage.remove();
    } catch {
      // The server response decides completion; stale device metadata is ignored in this process.
    }
  }

  private async loadStored(): Promise<StoredSuggestionAttempt | null> {
    try {
      const raw = await this.storage.load();
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredSuggestionAttempt(parsed) || this.completed.has(recordSignature(parsed))) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async saveStored(attempt: StoredSuggestionAttempt): Promise<void> {
    try {
      await this.storage.save(JSON.stringify(attempt));
    } catch {
      // In-memory ownership still prevents duplicate taps while this process remains mounted.
    }
  }
}

const deviceSuggestionAttemptStorage: SuggestionAttemptStorage = {
  async load() {
    const secureStore = await import('expo-secure-store');
    return secureStore.getItemAsync(DEVICE_STORAGE_KEY);
  },
  async save(value) {
    const secureStore = await import('expo-secure-store');
    await secureStore.setItemAsync(DEVICE_STORAGE_KEY, value);
  },
  async remove() {
    const secureStore = await import('expo-secure-store');
    await secureStore.deleteItemAsync(DEVICE_STORAGE_KEY);
  },
};

export const suggestionAttemptCoordinator = new SuggestionAttemptCoordinator();

function toAttempt(value: StoredSuggestionAttempt): SuggestionAttempt {
  return { fingerprint: value.fingerprint, key: value.key };
}

function requiredValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function recordSignature(value: StoredSuggestionAttempt): string {
  return JSON.stringify([value.ownerId, value.fingerprint, value.key]);
}

function isStoredSuggestionAttempt(value: unknown): value is StoredSuggestionAttempt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.ownerId === 'string' && Boolean(record.ownerId.trim())
    && typeof record.fingerprint === 'string' && Boolean(record.fingerprint.trim())
    && typeof record.key === 'string' && Boolean(record.key.trim());
}
