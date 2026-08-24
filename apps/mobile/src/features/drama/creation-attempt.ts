import { createIdempotencyKey } from '../../lib/idempotency-key';

const DEVICE_STORAGE_KEY = 'living-plot.pending-drama-creation.v1';

export interface CreationAttemptStorage {
  load(): Promise<string | null>;
  save(value: string): Promise<void>;
  remove(): Promise<void>;
}

export interface CreationAttempt {
  fingerprint: string;
  key: string;
  generationKey: string;
}

interface StoredCreationAttempt extends CreationAttempt {
  ownerId: string;
}

interface LegacyStoredCreationAttempt {
  ownerId: string;
  fingerprint: string;
  key: string;
}

export class CreationAttemptCoordinator {
  private current: StoredCreationAttempt | null = null;
  private readonly completed = new Set<string>();

  constructor(
    private readonly storage: CreationAttemptStorage = deviceCreationAttemptStorage,
    private readonly keyFactory: () => string = () => createIdempotencyKey('creation'),
    private readonly generationKeyFactory: () => string = () => createIdempotencyKey('generation'),
  ) {}

  async resolve(ownerId: string, fingerprint: string): Promise<CreationAttempt> {
    const owner = requiredValue(ownerId, 'Creation owner');
    const draft = requiredValue(fingerprint, 'Creation fingerprint');
    const stored = this.current ?? await this.loadStored();
    if (stored && stored.ownerId === owner && stored.fingerprint === draft) {
      const resolved: StoredCreationAttempt = hasGenerationKey(stored)
        ? stored
        : { ...stored, generationKey: this.generationKeyFactory() };
      this.current = resolved;
      if (!hasGenerationKey(stored)) await this.saveStored(resolved);
      return toAttempt(resolved);
    }

    const next: StoredCreationAttempt = {
      ownerId: owner,
      fingerprint: draft,
      key: this.keyFactory(),
      generationKey: this.generationKeyFactory(),
    };
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
      // The successful canonical response is authoritative; stale local retry metadata is ignored in this process.
    }
  }

  private async loadStored(): Promise<StoredCreationAttempt | LegacyStoredCreationAttempt | null> {
    try {
      const raw = await this.storage.load();
      if (!raw) return null;
      const parsed = parseStoredCreationAttempt(JSON.parse(raw));
      if (!parsed || this.completed.has(recordSignature(parsed))) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async saveStored(attempt: StoredCreationAttempt): Promise<void> {
    try {
      await this.storage.save(JSON.stringify(attempt));
    } catch {
      // Device persistence is best-effort; this coordinator still preserves retries for the mounted process.
    }
  }
}

const deviceCreationAttemptStorage: CreationAttemptStorage = {
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

export const creationAttemptCoordinator = new CreationAttemptCoordinator();

function toAttempt(value: StoredCreationAttempt): CreationAttempt {
  return { fingerprint: value.fingerprint, key: value.key, generationKey: value.generationKey };
}

function requiredValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function recordSignature(value: LegacyStoredCreationAttempt): string {
  return JSON.stringify([value.ownerId, value.fingerprint, value.key]);
}

function hasGenerationKey(
  value: StoredCreationAttempt | LegacyStoredCreationAttempt,
): value is StoredCreationAttempt {
  return 'generationKey' in value && typeof value.generationKey === 'string';
}

function parseStoredCreationAttempt(value: unknown): StoredCreationAttempt | LegacyStoredCreationAttempt | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.ownerId !== 'string' || !record.ownerId.trim()
    || typeof record.fingerprint !== 'string' || !record.fingerprint.trim()
    || typeof record.key !== 'string' || !record.key.trim()
  ) return null;
  const legacy: LegacyStoredCreationAttempt = {
    ownerId: record.ownerId,
    fingerprint: record.fingerprint,
    key: record.key,
  };
  if (record.generationKey === undefined) return legacy;
  if (typeof record.generationKey !== 'string' || !record.generationKey.trim()) return null;
  return { ...legacy, generationKey: record.generationKey };
}
