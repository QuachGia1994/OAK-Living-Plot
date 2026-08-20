import type { DramaLibrarySnapshot, DramaSummary } from './contracts';

export type DramaLibraryFilter = 'continue' | 'all' | 'paused';

export interface DramaLibraryView {
  active: DramaSummary[];
  archived: DramaSummary[];
  total: number;
}

export function libraryView(snapshot: DramaLibrarySnapshot, filter: DramaLibraryFilter): DramaLibraryView {
  const active = filter === 'paused' ? [] : snapshot.active;
  const archived = filter === 'continue' ? [] : snapshot.archived;
  return { active, archived, total: active.length + archived.length };
}
