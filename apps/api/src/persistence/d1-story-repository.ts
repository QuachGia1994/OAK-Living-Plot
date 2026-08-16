import {
  parseStructuredPlotState,
  type CharacterContract,
  type PlotMemorySnapshot,
  type PlotStatus,
} from '../domain/story';

interface PlotRow {
  id: string;
  user_id: string;
  status: PlotStatus;
  summary: string;
  version: number;
  next_episode_number: number;
  state_json: string;
}

interface CharacterRow {
  id: string;
  name: string;
  role: string;
  traits_json: string;
}

export class D1StoryRepository {
  constructor(private readonly db: D1Database) {}

  async loadOwnedPlotMemory(userId: string, plotId: string): Promise<PlotMemorySnapshot | null> {
    const plot = await this.db
      .prepare(
        'SELECT id, user_id, status, summary, version, next_episode_number, state_json FROM plots WHERE id = ? AND user_id = ?',
      )
      .bind(plotId, userId)
      .first<PlotRow>();
    if (!plot) return null;

    const characters = await this.loadCharacters(plotId);
    return {
      id: plot.id,
      userId: plot.user_id,
      status: plot.status,
      summary: plot.summary,
      version: plot.version,
      nextEpisodeNumber: plot.next_episode_number,
      state: parseStructuredPlotState(plot.state_json),
      characters,
    };
  }

  private async loadCharacters(plotId: string): Promise<CharacterContract[]> {
    const result = await this.db
      .prepare('SELECT id, name, role, traits_json FROM characters WHERE plot_id = ? ORDER BY created_at, id')
      .bind(plotId)
      .all<CharacterRow>();

    return result.results.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      traits: parseTraits(row.traits_json),
    }));
  }
}

function parseTraits(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
