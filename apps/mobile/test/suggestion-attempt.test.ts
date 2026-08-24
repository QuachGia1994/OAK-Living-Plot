import { describe, expect, it } from 'vitest';
import { SuggestionAttemptCoordinator, type SuggestionAttemptStorage } from '../src/features/drama/suggestion-attempt';

class MemoryStorage implements SuggestionAttemptStorage {
  value: string | null = null;
  async load() { return this.value; }
  async save(value: string) { this.value = value; }
  async remove() { this.value = null; }
}

describe('suggestion attempt coordinator', () => {
  it('reuses the same request key across remounts for an uncertain retry', async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const first = new SuggestionAttemptCoordinator(storage, () => `suggestion-${++sequence}`);
    const attempt = await first.resolve('owner-1', 'fingerprint-a');
    const remounted = new SuggestionAttemptCoordinator(storage, () => `suggestion-${++sequence}`);
    expect(await remounted.resolve('owner-1', 'fingerprint-a')).toEqual(attempt);
    expect(sequence).toBe(1);
  });

  it('does not share a request key across owners or fingerprints', async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const coordinator = new SuggestionAttemptCoordinator(storage, () => `suggestion-${++sequence}`);
    const first = await coordinator.resolve('owner-1', 'fingerprint-a');
    const changedDraft = await coordinator.resolve('owner-1', 'fingerprint-b');
    const changedOwner = await coordinator.resolve('owner-2', 'fingerprint-b');
    expect(new Set([first.key, changedDraft.key, changedOwner.key]).size).toBe(3);
  });

  it('clears a successful batch so Suggest more gets a fresh key without touching Scene creation metadata', async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const coordinator = new SuggestionAttemptCoordinator(storage, () => `suggestion-${++sequence}`);
    const first = await coordinator.resolve('owner-1', 'fingerprint-a');
    await coordinator.complete('owner-1', 'fingerprint-a', first.key);
    const more = await coordinator.resolve('owner-1', 'fingerprint-a');
    expect(more.key).toBe('suggestion-2');
  });
});
