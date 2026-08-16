import { createInitialPlotState, parseStructuredPlotState } from '../domain/story';
import type {
  CreatedPlotRecord,
  GenerationContext,
  LiveStoryChoice,
  LiveStoryCreateInput,
  LiveStoryEpisode,
  LiveStoryMood,
  LiveStoryPlotSummary,
  LiveStoryResult,
  LiveStorySession,
} from './contracts';

interface PlotRow {
  id: string;
  user_id: string;
  title: string;
  premise: string;
  status: 'active' | 'completed' | 'archived';
  state_json: string;
  summary: string;
  version: number;
  next_episode_number: number;
  creation_key: string | null;
  locale: string;
  mood: LiveStoryMood;
  updated_at: number;
}

interface CharacterRow {
  id: string;
  name: string;
  role: string;
  traits_json: string;
}

interface EpisodeRow {
  id: string;
  episode_number: number;
  title: string;
  script_json: string;
  summary: string;
  status: 'ready' | 'completed';
  generation_key: string | null;
  state_version_after_publish: number | null;
}

interface ChoiceRow {
  id: string;
  choice_key: string;
  label: string;
  intent: string | null;
  consequence: string | null;
}

interface CommitRow {
  choice_id: string;
  consequence: string | null;
}

interface PreviousRow {
  episode_summary: string;
  chosen_action: string;
  intent: string;
  consequence: string;
}

export interface StoredLiveSession {
  session: LiveStorySession;
  generationKey: string | null;
  expectedChoiceStateVersion: number | null;
}

export class D1LiveStoryRepository {
  constructor(private readonly db: D1Database) {}

  async createOrLoadPlot(input: LiveStoryCreateInput): Promise<LiveStoryResult<CreatedPlotRecord>> {
    const candidatePlotId = crypto.randomUUID();
    const candidateCharacterId = crypto.randomUUID();
    try {
      await this.insertCandidate(input, candidatePlotId, candidateCharacterId);
    } catch {
      return this.resolveCreation(input, candidatePlotId);
    }
    return this.resolveCreation(input, candidatePlotId);
  }

  async loadSession(userId: string, plotId: string): Promise<StoredLiveSession | null> {
    const plot = await this.loadPlot(userId, plotId);
    if (!plot) return null;
    const character = await this.loadPrimaryCharacter(plot.id);
    const episode = await this.loadLatestEpisode(plot.id);
    if (!character || !episode) return null;
    return this.buildSession(plot, character, episode);
  }

  async listOwnedPlots(userId: string, limit = 20): Promise<LiveStoryPlotSummary[]> {
    const rows = await this.db
      .prepare(
        `SELECT p.id FROM plots p
         WHERE p.user_id = ? AND p.status = 'active'
           AND EXISTS (SELECT 1 FROM episodes e WHERE e.plot_id = p.id)
         ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`,
      )
      .bind(userId, limit)
      .all<{ id: string }>();
    const sessions = await Promise.all(rows.results.map((row) => this.loadSession(userId, row.id)));
    return sessions.filter(isStoredSession).map((stored) => toPlotSummary(stored.session));
  }

  async loadGenerationContext(userId: string, plotId: string): Promise<GenerationContext | null> {
    const plot = await this.loadPlot(userId, plotId);
    if (!plot || plot.status !== 'active') return null;
    const characters = await this.loadCharacters(plot.id);
    if (characters.length === 0) return null;
    const state = parseStructuredPlotState(plot.state_json);
    const previous = await this.loadPrevious(plot.id);
    return {
      plotId: plot.id,
      stateVersion: plot.version,
      input: {
        locale: plot.locale,
        targetSpokenSeconds: 75,
        contentRating: 'teen',
        plot: { premise: plot.premise, mood: state.tone, summary: plot.summary, stateVersion: plot.version },
        characters: characters.map(toGenerationCharacter),
        relationships: state.relationships,
        activeFacts: state.facts,
        openThreads: state.openThreads,
        previous,
      },
    };
  }

  async loadExpectedChoiceStateVersion(userId: string, plotId: string, episodeId: string): Promise<number | null> {
    const row = await this.db
      .prepare(
        `SELECT e.state_version_after_publish AS version
         FROM episodes e JOIN plots p ON p.id = e.plot_id
         WHERE e.id = ? AND e.plot_id = ? AND p.user_id = ?`,
      )
      .bind(episodeId, plotId, userId)
      .first<{ version: number | null }>();
    return row?.version ?? null;
  }

  private async insertCandidate(input: LiveStoryCreateInput, plotId: string, characterId: string): Promise<void> {
    const state = { ...createInitialPlotState(), tone: input.mood };
    const title = titleFromPremise(input.premise);
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO plots
             (id, user_id, title, premise, state_json, creation_key, locale, mood)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(plotId, input.userId, title, input.premise, JSON.stringify(state), input.creationKey, input.locale, input.mood),
      this.db
        .prepare(
          `INSERT INTO characters (id, plot_id, name, role, traits_json)
           SELECT ?, id, ?, 'protagonist', '{}'
           FROM plots WHERE id = ? AND user_id = ?`,
        )
        .bind(characterId, input.characterName, plotId, input.userId),
    ]);
  }

  private async resolveCreation(input: LiveStoryCreateInput, candidateId: string): Promise<LiveStoryResult<CreatedPlotRecord>> {
    const plot = await this.loadByCreationKey(input.userId, input.creationKey);
    if (!plot) return persistenceError('Plot creation failed.');
    const character = await this.loadPrimaryCharacter(plot.id);
    if (!character) return persistenceError('Plot character creation failed.');
    if (!matchesCreation(plot, character, input)) {
      return { ok: false, error: { code: 'creation_conflict', message: 'Creation key belongs to a different plot setup.' } };
    }
    return { ok: true, value: { id: plot.id, created: plot.id === candidateId } };
  }

  private async buildSession(plot: PlotRow, character: CharacterRow, episode: EpisodeRow): Promise<StoredLiveSession> {
    const choices = await this.loadChoices(episode.id);
    const commit = episode.status === 'completed' ? await this.loadCommit(episode.id) : null;
    const storyEpisode = toLiveEpisode(episode, choices, commit);
    return {
      session: {
        id: plot.id,
        title: plot.title,
        premise: plot.premise,
        mood: plot.mood,
        characterName: character.name,
        updatedAt: plot.updated_at,
        version: plot.version,
        episode: storyEpisode,
      },
      generationKey: episode.generation_key,
      expectedChoiceStateVersion: episode.state_version_after_publish,
    };
  }

  private async loadPlot(userId: string, plotId: string): Promise<PlotRow | null> {
    return this.db
      .prepare(
        `SELECT id, user_id, title, premise, status, state_json, summary, version, next_episode_number,
                creation_key, locale, mood, updated_at
         FROM plots WHERE id = ? AND user_id = ?`,
      )
      .bind(plotId, userId)
      .first<PlotRow>();
  }

  private async loadByCreationKey(userId: string, creationKey: string): Promise<PlotRow | null> {
    return this.db
      .prepare(
        `SELECT id, user_id, title, premise, status, state_json, summary, version, next_episode_number,
                creation_key, locale, mood, updated_at
         FROM plots WHERE user_id = ? AND creation_key = ?`,
      )
      .bind(userId, creationKey)
      .first<PlotRow>();
  }

  private async loadCharacters(plotId: string): Promise<CharacterRow[]> {
    const result = await this.db
      .prepare('SELECT id, name, role, traits_json FROM characters WHERE plot_id = ? ORDER BY created_at, id')
      .bind(plotId)
      .all<CharacterRow>();
    return result.results;
  }

  private async loadPrimaryCharacter(plotId: string): Promise<CharacterRow | null> {
    return this.db
      .prepare('SELECT id, name, role, traits_json FROM characters WHERE plot_id = ? ORDER BY created_at, id LIMIT 1')
      .bind(plotId)
      .first<CharacterRow>();
  }

  private async loadLatestEpisode(plotId: string): Promise<EpisodeRow | null> {
    return this.db
      .prepare(
        `SELECT id, episode_number, title, script_json, summary, status, generation_key, state_version_after_publish
         FROM episodes WHERE plot_id = ? ORDER BY episode_number DESC LIMIT 1`,
      )
      .bind(plotId)
      .first<EpisodeRow>();
  }

  private async loadChoices(episodeId: string): Promise<ChoiceRow[]> {
    const result = await this.db
      .prepare(
        `SELECT id, choice_key, label, intent, consequence
         FROM episode_choices WHERE episode_id = ? ORDER BY position`,
      )
      .bind(episodeId)
      .all<ChoiceRow>();
    return result.results;
  }

  private async loadCommit(episodeId: string): Promise<CommitRow | null> {
    return this.db
      .prepare('SELECT choice_id, consequence FROM choice_commits WHERE episode_id = ?')
      .bind(episodeId)
      .first<CommitRow>();
  }

  private async loadPrevious(plotId: string): Promise<EpisodeGenerationInputPrevious | null> {
    const row = await this.db
      .prepare(
        `SELECT e.summary AS episode_summary, c.label AS chosen_action,
                cc.intent AS intent, cc.consequence AS consequence
         FROM choice_commits cc
         JOIN episodes e ON e.id = cc.episode_id
         JOIN episode_choices c ON c.id = cc.choice_id AND c.episode_id = cc.episode_id
         WHERE cc.plot_id = ? ORDER BY cc.sequence DESC LIMIT 1`,
      )
      .bind(plotId)
      .first<PreviousRow>();
    if (!row) return null;
    return {
      episodeSummary: row.episode_summary,
      chosenAction: row.chosen_action,
      choiceIntent: row.intent,
      consequence: row.consequence,
    };
  }
}

type EpisodeGenerationInputPrevious = GenerationContext['input']['previous'] extends infer T ? Exclude<T, null> : never;

function toLiveEpisode(episode: EpisodeRow, rows: ChoiceRow[], commit: CommitRow | null): LiveStoryEpisode {
  if (rows.length !== 3) throw new Error('Stored live episode must have exactly three choices.');
  const choices = rows.map(toLiveChoice) as [LiveStoryChoice, LiveStoryChoice, LiveStoryChoice];
  const content = parseEpisodeContent(episode.script_json);
  const value: LiveStoryEpisode = {
    id: episode.id,
    number: episode.episode_number,
    title: episode.title,
    body: content.script,
    summary: episode.summary,
    status: episode.status === 'ready' ? 'awaiting_choice' : 'choice_committed',
    choices,
  };
  if (commit) {
    value.committedChoiceId = commit.choice_id;
    value.committedConsequence = commit.consequence ?? choices.find((choice) => choice.id === commit.choice_id)?.consequence;
  }
  return value;
}

function toLiveChoice(row: ChoiceRow): LiveStoryChoice {
  if (row.choice_key !== 'A' && row.choice_key !== 'B' && row.choice_key !== 'C') throw new Error('Stored choice key is invalid.');
  return {
    id: row.id,
    key: row.choice_key,
    label: row.label,
    intent: row.intent ?? '',
    consequence: row.consequence ?? '',
  };
}

function toPlotSummary(session: LiveStorySession): LiveStoryPlotSummary {
  return {
    id: session.id,
    title: session.title,
    premise: session.premise,
    mood: session.mood,
    characterName: session.characterName,
    updatedAt: session.updatedAt,
    episodeNumber: session.episode.number,
    status: session.episode.status === 'awaiting_choice' ? 'awaiting_choice' : 'ready_for_next',
  };
}

function toGenerationCharacter(row: CharacterRow) {
  const traits = parseTraits(row.traits_json);
  return {
    key: row.id,
    name: row.name,
    role: row.role,
    traits: stringField(traits.traits),
    goal: stringField(traits.goal),
    secret: stringField(traits.secret),
  };
}

function parseEpisodeContent(raw: string): { script: string } {
  const value = JSON.parse(raw) as { script?: unknown };
  if (typeof value.script !== 'string' || !value.script.trim()) throw new Error('Stored episode script is invalid.');
  return { script: value.script };
}

function parseTraits(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw);
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function matchesCreation(plot: PlotRow, character: CharacterRow, input: LiveStoryCreateInput): boolean {
  return plot.premise === input.premise && plot.locale === input.locale && plot.mood === input.mood && character.name === input.characterName;
}

function titleFromPremise(premise: string): string {
  const words = premise.trim().split(/\s+/u).slice(0, 8).join(' ');
  return words.length <= 72 ? words : `${words.slice(0, 69).trim()}…`;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isStoredSession(value: StoredLiveSession | null): value is StoredLiveSession {
  return value !== null;
}

function persistenceError(message: string): LiveStoryResult<never> {
  return { ok: false, error: { code: 'persistence_error', message } };
}
