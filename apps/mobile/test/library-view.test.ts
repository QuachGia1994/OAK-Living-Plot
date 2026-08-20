import { describe, expect, it } from 'vitest';
import { libraryView } from '../src/features/drama/library-view';
import type { DramaLibrarySnapshot, DramaSummary } from '../src/features/drama/contracts';

const active = [summary('active-1')];
const archived = [summary('archived-1'), summary('archived-2')];
const snapshot: DramaLibrarySnapshot = { active, archived };

describe('library concept filters', () => {
  it('shows only resumable dramas in Continue', () => {
    expect(libraryView(snapshot, 'continue')).toEqual({ active, archived: [], total: 1 });
  });

  it('shows both active and paused dramas in All', () => {
    expect(libraryView(snapshot, 'all')).toEqual({ active, archived, total: 3 });
  });

  it('shows only paused dramas in Paused', () => {
    expect(libraryView(snapshot, 'paused')).toEqual({ active: [], archived, total: 2 });
  });
});

function summary(id: string): DramaSummary {
  return {
    id,
    title: id,
    premise: 'A sufficiently specific premise.',
    mood: 'mysterious',
    characterName: 'Mina',
    updatedLabel: 'Just now',
    sceneNumber: 2,
    status: 'awaiting_choice',
    resumeLine: 'Continue here.',
  };
}
