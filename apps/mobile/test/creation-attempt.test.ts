import { describe, expect, it } from 'vitest';
import { CreationAttemptCoordinator, type CreationAttemptStorage } from '../src/features/drama/creation-attempt';

class MemoryStorage implements CreationAttemptStorage {
  value: string | null = null;

  async load(): Promise<string | null> { return this.value; }
  async save(value: string): Promise<void> { this.value = value; }
  async remove(): Promise<void> { this.value = null; }
}

describe('creation attempt coordinator', () => {
  it('reuses an uncertain creation key across coordinator remounts', async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const first = new CreationAttemptCoordinator(storage, () => `creation-${++sequence}`);
    const attempt = await first.resolve('user-1', 'draft-a');

    const remounted = new CreationAttemptCoordinator(storage, () => `creation-${++sequence}`);
    const replay = await remounted.resolve('user-1', 'draft-a');

    expect(replay).toEqual(attempt);
    expect(sequence).toBe(1);
  });

  it('persists the first Scene generation key across coordinator remounts', async () => {
    const storage = new MemoryStorage();
    let creationSequence = 0;
    let generationSequence = 0;
    const first = new CreationAttemptCoordinator(
      storage,
      () => `creation-${++creationSequence}`,
      () => `generation-${++generationSequence}`,
    );
    const attempt = await first.resolve('user-1', 'draft-a');

    const remounted = new CreationAttemptCoordinator(
      storage,
      () => `creation-${++creationSequence}`,
      () => `generation-${++generationSequence}`,
    );
    const replay = await remounted.resolve('user-1', 'draft-a');

    expect(attempt).toMatchObject({ key: 'creation-1', generationKey: 'generation-1' });
    expect(replay).toEqual(attempt);
    expect(creationSequence).toBe(1);
    expect(generationSequence).toBe(1);
  });

  it('upgrades a legacy v1 pending record without replacing its creation key', async () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify({ ownerId: 'user-1', fingerprint: 'draft-a', key: 'creation-legacy' });
    let creationCalls = 0;
    let generationCalls = 0;
    const first = new CreationAttemptCoordinator(
      storage,
      () => `creation-new-${++creationCalls}`,
      () => `generation-upgrade-${++generationCalls}`,
    );

    const upgraded = await first.resolve('user-1', 'draft-a');
    expect(upgraded).toEqual({ fingerprint: 'draft-a', key: 'creation-legacy', generationKey: 'generation-upgrade-1' });
    expect(JSON.parse(storage.value!)).toEqual({
      ownerId: 'user-1',
      fingerprint: 'draft-a',
      key: 'creation-legacy',
      generationKey: 'generation-upgrade-1',
    });

    const remounted = new CreationAttemptCoordinator(
      storage,
      () => `creation-new-${++creationCalls}`,
      () => `generation-upgrade-${++generationCalls}`,
    );
    expect(await remounted.resolve('user-1', 'draft-a')).toEqual(upgraded);
    expect(creationCalls).toBe(0);
    expect(generationCalls).toBe(1);
  });

  it('does not share a pending creation key across owners or changed drafts', async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const coordinator = new CreationAttemptCoordinator(storage, () => `creation-${++sequence}`);

    const first = await coordinator.resolve('user-1', 'draft-a');
    const changedDraft = await coordinator.resolve('user-1', 'draft-b');
    const changedOwner = await coordinator.resolve('user-2', 'draft-b');

    expect(new Set([first.key, changedDraft.key, changedOwner.key]).size).toBe(3);
  });

  it('clears only the exact completed attempt so a deliberate later creation gets a fresh key', async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const coordinator = new CreationAttemptCoordinator(storage, () => `creation-${++sequence}`);
    const attempt = await coordinator.resolve('user-1', 'draft-a');

    await coordinator.complete('user-1', 'draft-a', 'different-key');
    expect(await coordinator.resolve('user-1', 'draft-a')).toEqual(attempt);

    await coordinator.complete('user-1', 'draft-a', attempt.key);
    expect((await coordinator.resolve('user-1', 'draft-a')).key).toBe('creation-2');
  });

  it('keeps in-memory idempotency when device persistence is unavailable', async () => {
    const unavailable: CreationAttemptStorage = {
      async load() { throw new Error('storage unavailable'); },
      async save() { throw new Error('storage unavailable'); },
      async remove() { throw new Error('storage unavailable'); },
    };
    let sequence = 0;
    const coordinator = new CreationAttemptCoordinator(unavailable, () => `creation-${++sequence}`);

    const first = await coordinator.resolve('user-1', 'draft-a');
    const replay = await coordinator.resolve('user-1', 'draft-a');

    expect(replay).toEqual(first);
    expect(sequence).toBe(1);
  });
});
