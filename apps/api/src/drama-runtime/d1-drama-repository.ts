import { isDramaMood, type Choice, type CharacterIdentity, type Drama, type Scene } from '../domain/drama';
import { createInitialDramaState, normalizeDramaStateSemantics, parseDramaState, semanticTextKey } from '../domain/drama-state';
import type { FactState, RelationshipState, ThreadState } from '../domain/drama-state';
import { SCENE_GENERATION_CONTEXT_LIMITS, type ChoiceStateDelta } from '../ai/contracts';
import {
  deriveTrajectoryConstraints,
  excludedBeatsFromHistory,
  isNarrativeBeat,
  type SceneMotifSignature,
} from '../evals/narrative-novelty';
import type { RetentionActivityDay } from '../retention/retention';
import type {
  CreatedDramaRecord,
  DramaCreateInput,
  DramaHistory,
  DramaHistoryItem,
  DramaLibrary,
  DramaResult,
  DramaSummary,
  GenerationContext,
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
  mood: string;
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

interface RecentHistoryRow {
  episode_id: string;
  episode_number: number;
  title: string;
  summary: string;
  script_json: string;
  chosen_action: string | null;
  intent: string | null;
  consequence: string | null;
  committed_state_delta_json: string | null;
  choice_labels_json: string;
}

interface NoveltyHistoryRow {
  script_json: string;
  committed_state_delta_json: string;
}

interface ArcCheckpointRow {
  through_scene_number: number;
  summary: string;
}

interface ResolvedMemoryRow {
  sequence: number;
  script_json: string;
  committed_state_delta_json: string;
  previous_state_json: string | null;
}

interface CheckpointSourceRow {
  episode_number: number;
  summary: string;
  consequence: string;
}

interface HistoryRow {
  episode_id: string;
  episode_number: number;
  title: string;
  summary: string;
  status: 'ready' | 'completed';
  choice_key: string | null;
  choice_label: string | null;
  consequence: string | null;
}

export interface StoredDramaSession {
  session: Drama;
  generationKey: string | null;
  expectedChoiceStateVersion: number | null;
}

export class D1DramaRepository {
  constructor(private readonly db: D1Database) {}

  async createOrLoadDrama(input: DramaCreateInput): Promise<DramaResult<CreatedDramaRecord>> {
    const candidatePlotId = crypto.randomUUID();
    const candidateCharacterId = crypto.randomUUID();
    try {
      await this.insertCandidate(input, candidatePlotId, candidateCharacterId);
    } catch {
      return this.resolveCreation(input, candidatePlotId);
    }
    return this.resolveCreation(input, candidatePlotId);
  }

  async loadSession(userId: string, dramaId: string): Promise<StoredDramaSession | null> {
    const plot = await this.loadPlot(userId, dramaId);
    if (!plot) return null;
    const character = await this.loadPrimaryCharacter(plot.id);
    const episode = await this.loadLatestEpisode(plot.id);
    if (!character || !episode) return null;
    return this.buildSession(plot, character, episode);
  }

  async loadSummary(userId: string, dramaId: string): Promise<DramaSummary | null> {
    const stored = await this.loadSession(userId, dramaId);
    return stored ? toDramaSummary(stored.session) : null;
  }

  async listOwnedDramas(userId: string, limit = 20): Promise<DramaSummary[]> {
    return this.listOwnedDramasByStatus(userId, 'active', limit);
  }

  async loadLibrary(userId: string, limit = 50): Promise<DramaLibrary> {
    const [active, archived] = await Promise.all([
      this.listOwnedDramasByStatus(userId, 'active', limit),
      this.listOwnedDramasByStatus(userId, 'archived', limit),
    ]);
    return { active, archived };
  }

  async setLifecycleStatus(
    userId: string,
    dramaId: string,
    target: 'active' | 'archived',
    updatedAt: number,
  ): Promise<'updated' | 'unchanged' | 'not_found' | 'invalid_status'> {
    const row = await this.db
      .prepare('SELECT status FROM plots WHERE id = ? AND user_id = ?')
      .bind(dramaId, userId)
      .first<{ status: 'active' | 'completed' | 'archived' }>();
    if (!row) return 'not_found';
    if (row.status === target) return 'unchanged';
    if (row.status === 'completed') return 'invalid_status';
    await this.db
      .prepare('UPDATE plots SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(target, updatedAt, dramaId, userId)
      .run();
    return 'updated';
  }

  async loadHistory(userId: string, dramaId: string): Promise<DramaHistory | null> {
    const plot = await this.loadPlot(userId, dramaId);
    if (!plot) return null;
    const result = await this.db
      .prepare(
        `SELECT e.id AS episode_id, e.episode_number, e.title, e.summary, e.status,
                ec.choice_key, ec.label AS choice_label, cc.consequence
         FROM episodes e
         LEFT JOIN choice_commits cc ON cc.episode_id = e.id
         LEFT JOIN episode_choices ec ON ec.id = cc.choice_id AND ec.episode_id = e.id
         WHERE e.plot_id = ?
         ORDER BY e.episode_number ASC`,
      )
      .bind(dramaId)
      .all<HistoryRow>();
    return { dramaId: plot.id, title: plot.title, items: result.results.map(toHistoryItem) };
  }

  async loadRetentionActivity(userId: string): Promise<RetentionActivityDay[]> {
    const result = await this.db
      .prepare(
        `SELECT strftime('%Y-%m-%d', cc.committed_at / 1000, 'unixepoch') AS utc_day,
                COUNT(*) AS choices_made
         FROM choice_commits cc
         JOIN plots p ON p.id = cc.plot_id
         WHERE p.user_id = ?
         GROUP BY utc_day
         ORDER BY utc_day DESC`,
      )
      .bind(userId)
      .all<{ utc_day: string; choices_made: number }>();
    return result.results.map((row) => ({ utcDay: row.utc_day, choicesMade: row.choices_made }));
  }

  async loadGenerationContext(userId: string, dramaId: string): Promise<GenerationContext | null> {
    const plot = await this.loadPlot(userId, dramaId);
    if (!plot || plot.status !== 'active') return null;
    const characters = await this.loadCharacters(plot.id);
    if (characters.length === 0) return null;
    const state = normalizeDramaStateSemantics(parseDramaState(plot.state_json));
    const [previous, recentHistory, novelty, arcMemory, resolvedMemory] = await Promise.all([
      this.loadPrevious(plot.id),
      this.loadRecentHistory(plot.id),
      this.loadNoveltyMemory(plot.id),
      this.loadArcMemory(plot.id, Math.max(0, plot.next_episode_number - 5)),
      this.loadResolvedMemory(plot.id),
    ]);
    return {
      dramaId: plot.id,
      stateVersion: plot.version,
      input: {
        locale: plot.locale,
        targetSpokenSeconds: 75,
        contentRating: 'teen',
        drama: { premise: plot.premise, mood: state.tone, summary: plot.summary, stateVersion: plot.version },
        characters: characters.map(toGenerationCharacter),
        relationships: selectBoundedRelationships(state.relationships),
        activeFacts: selectBoundedFacts(state.facts),
        openThreads: selectBoundedThreads(state.openThreads),
        recentHistory,
        previous,
        novelty,
        arcMemory,
        resolvedMemory,
      },
    };
  }

  async loadExpectedChoiceStateVersion(userId: string, dramaId: string, sceneId: string): Promise<number | null> {
    const row = await this.db
      .prepare(
        `SELECT e.state_version_after_publish AS version
         FROM episodes e JOIN plots p ON p.id = e.plot_id
         WHERE e.id = ? AND e.plot_id = ? AND p.user_id = ? AND p.status = 'active'`,
      )
      .bind(sceneId, dramaId, userId)
      .first<{ version: number | null }>();
    return row?.version ?? null;
  }

  /** Derived cache only. Failure never changes canonical choice-commit success. */
  async saveArcCheckpoint(userId: string, plotId: string, throughSceneNumber: number): Promise<void> {
    if (!Number.isInteger(throughSceneNumber) || throughSceneNumber < 5 || throughSceneNumber % 5 !== 0) return;
    try {
      const rows = await this.db
        .prepare(
          `SELECT e.episode_number, e.summary, cc.consequence
           FROM episodes e
           JOIN plots p ON p.id = e.plot_id
           JOIN choice_commits cc ON cc.episode_id = e.id AND cc.plot_id = e.plot_id
           WHERE e.plot_id = ? AND p.user_id = ?
             AND e.episode_number BETWEEN ? AND ?
           ORDER BY e.episode_number ASC`,
        )
        .bind(plotId, userId, throughSceneNumber - 4, throughSceneNumber)
        .all<CheckpointSourceRow>();
      if (rows.results.length !== 5) return;
      const summary = buildArcCheckpointSummary(rows.results);
      if (!summary) return;
      await this.db
        .prepare(
          `INSERT INTO arc_checkpoints (plot_id, through_scene_number, summary)
           VALUES (?, ?, ?)
           ON CONFLICT(plot_id, through_scene_number) DO UPDATE SET
             summary = excluded.summary, created_at = unixepoch() * 1000`,
        )
        .bind(plotId, throughSceneNumber, summary)
        .run();
    } catch {
      // Checkpoints are rebuildable derived memory and must never affect canonical commits.
    }
  }

  private async listOwnedDramasByStatus(
    userId: string,
    status: 'active' | 'archived',
    limit: number,
  ): Promise<DramaSummary[]> {
    const rows = await this.db
      .prepare(
        `SELECT p.id FROM plots p
         WHERE p.user_id = ? AND p.status = ?
           AND EXISTS (SELECT 1 FROM episodes e WHERE e.plot_id = p.id)
         ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`,
      )
      .bind(userId, status, limit)
      .all<{ id: string }>();
    const sessions = await Promise.all(rows.results.map((row) => this.loadSession(userId, row.id)));
    return sessions.filter(isStoredSession).map((stored) => toDramaSummary(stored.session));
  }

  private async insertCandidate(input: DramaCreateInput, plotId: string, characterId: string): Promise<void> {
    const state = { ...createInitialDramaState(), tone: input.mood };
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

  private async resolveCreation(input: DramaCreateInput, candidateId: string): Promise<DramaResult<CreatedDramaRecord>> {
    const plot = await this.loadByCreationKey(input.userId, input.creationKey);
    if (!plot) return persistenceError('Plot creation failed.');
    const character = await this.loadPrimaryCharacter(plot.id);
    if (!character) return persistenceError('Plot character creation failed.');
    if (!matchesCreation(plot, character, input)) {
      return { ok: false, error: { code: 'creation_conflict', message: 'Creation key belongs to a different plot setup.' } };
    }
    return { ok: true, value: { id: plot.id, created: plot.id === candidateId } };
  }

  private async buildSession(plot: PlotRow, character: CharacterRow, episode: EpisodeRow): Promise<StoredDramaSession> {
    const choices = await this.loadChoices(episode.id);
    const commit = episode.status === 'completed' ? await this.loadCommit(episode.id) : null;
    if (!isDramaMood(plot.mood)) throw new Error('Stored drama mood is invalid.');
    return {
      session: {
        id: plot.id,
        title: plot.title,
        premise: plot.premise,
        mood: plot.mood,
        leadCharacter: toCharacterIdentity(character),
        updatedAt: plot.updated_at,
        version: plot.version,
        currentScene: toScene(episode, choices, commit),
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

  private async loadRecentHistory(
    plotId: string,
    limit = SCENE_GENERATION_CONTEXT_LIMITS.recentHistory,
  ): Promise<SceneGenerationInputRecentHistory> {
    const rows = await this.db
      .prepare(
        `SELECT e.id AS episode_id, e.episode_number, e.title, e.summary, e.script_json,
                c.label AS chosen_action, cc.intent AS intent, cc.consequence AS consequence,
                c.state_delta_json AS committed_state_delta_json,
                COALESCE((
                  SELECT json_group_array(labels.label)
                  FROM (
                    SELECT ec.label AS label FROM episode_choices ec
                    WHERE ec.episode_id = e.id ORDER BY ec.position
                  ) labels
                ), '[]') AS choice_labels_json
         FROM episodes e
         LEFT JOIN choice_commits cc ON cc.episode_id = e.id
         LEFT JOIN episode_choices c ON c.id = cc.choice_id AND c.episode_id = e.id
         WHERE e.plot_id = ?
         ORDER BY e.episode_number DESC LIMIT ?`,
      )
      .bind(plotId, limit)
      .all<RecentHistoryRow>();
    const chronological = [...rows.results].reverse();
    return chronological.map((row) => {
      const metadata = parseStoredGenerationMetadata(row.script_json);
      const committedDelta = parseChoiceStateDelta(row.committed_state_delta_json);
      return {
        sceneNumber: row.episode_number,
        title: row.title,
        summary: row.summary,
        committedChoice: row.chosen_action,
        choiceIntent: row.intent,
        consequence: row.consequence,
        choiceLabels: parseJsonStringArray(row.choice_labels_json),
        beat: metadata.beat,
        pacingRole: metadata.pacingRole,
        motifSignature: metadata.motifSignature,
        committedRelationshipDeltas: committedDelta?.relationships ?? [],
      };
    });
  }

  private async loadNoveltyMemory(plotId: string): Promise<NonNullable<GenerationContext['input']['novelty']>> {
    const rows = await this.db
      .prepare(
        `SELECT e.script_json, c.state_delta_json AS committed_state_delta_json
         FROM choice_commits cc
         JOIN episodes e ON e.id = cc.episode_id AND e.plot_id = cc.plot_id
         JOIN episode_choices c ON c.id = cc.choice_id AND c.episode_id = cc.episode_id
         WHERE cc.plot_id = ?
         ORDER BY cc.sequence DESC LIMIT ?`,
      )
      .bind(plotId, SCENE_GENERATION_CONTEXT_LIMITS.noveltyHistory)
      .all<NoveltyHistoryRow>();
    const chronological = [...rows.results].reverse();
    const metadata = chronological.map((row) => parseStoredGenerationMetadata(row.script_json));
    const relationshipHistory = chronological.map((row) => ({
      relationships: parseChoiceStateDelta(row.committed_state_delta_json)?.relationships ?? [],
    }));
    return {
      excludedBeats: excludedBeatsFromHistory(metadata.map((item) => isNarrativeBeat(item.beat) ? item.beat : 'unknown')),
      trajectoryConstraints: deriveTrajectoryConstraints(relationshipHistory)
        .slice(0, SCENE_GENERATION_CONTEXT_LIMITS.trajectoryConstraints),
      motifHistory: metadata
        .flatMap((item) => item.motifSignature ? [item.motifSignature] : [])
        .slice(-SCENE_GENERATION_CONTEXT_LIMITS.motifHistory),
    };
  }

  private async loadArcMemory(
    plotId: string,
    maxThroughScene: number,
  ): Promise<NonNullable<GenerationContext['input']['arcMemory']>> {
    if (maxThroughScene < 5) return [];
    try {
      const rows = await this.db
        .prepare(
          `SELECT through_scene_number, summary
           FROM arc_checkpoints
           WHERE plot_id = ? AND through_scene_number <= ?
           ORDER BY through_scene_number DESC LIMIT ?`,
        )
        .bind(plotId, maxThroughScene, SCENE_GENERATION_CONTEXT_LIMITS.arcMemory)
        .all<ArcCheckpointRow>();
      return [...rows.results].reverse().map((row) => ({
        throughSceneNumber: row.through_scene_number,
        summary: row.summary,
      }));
    } catch {
      return [];
    }
  }

  private async loadResolvedMemory(plotId: string): Promise<NonNullable<GenerationContext['input']['resolvedMemory']>> {
    const rows = await this.db
      .prepare(
        `SELECT cc.sequence, e.script_json, c.state_delta_json AS committed_state_delta_json,
                (SELECT prev.state_json_after
                 FROM choice_commits prev
                 WHERE prev.plot_id = cc.plot_id AND prev.sequence = cc.sequence - 1
                 LIMIT 1) AS previous_state_json
         FROM choice_commits cc
         JOIN episodes e ON e.id = cc.episode_id AND e.plot_id = cc.plot_id
         JOIN episode_choices c ON c.id = cc.choice_id AND c.episode_id = cc.episode_id
         WHERE cc.plot_id = ?
         ORDER BY cc.sequence DESC`,
      )
      .bind(plotId)
      .all<ResolvedMemoryRow>();
    const factTexts: string[] = [];
    const threadTitles: string[] = [];
    for (const row of rows.results) {
      const previousState = row.previous_state_json ? safeParseDramaState(row.previous_state_json) : createInitialDramaState();
      const delta = parseChoiceStateDelta(row.committed_state_delta_json);
      const metadata = parseStoredGenerationMetadata(row.script_json);
      if (delta) {
        for (const key of delta.factKeysToResolve) {
          const fact = previousState.facts.find((item) => item.key === key);
          if (fact) factTexts.push(fact.text);
        }
        for (const key of delta.threadKeysToResolve) {
          const thread = previousState.openThreads.find((item) => item.key === key);
          if (thread) threadTitles.push(thread.title);
        }
      }
      for (const key of metadata.resolvedThreadKeys) {
        const thread = previousState.openThreads.find((item) => item.key === key);
        if (thread) threadTitles.push(thread.title);
      }
    }
    return {
      facts: uniqueRecentTexts(factTexts, SCENE_GENERATION_CONTEXT_LIMITS.resolvedFacts),
      threads: uniqueRecentTexts(threadTitles, SCENE_GENERATION_CONTEXT_LIMITS.resolvedThreads),
    };
  }

  private async loadPrevious(plotId: string): Promise<SceneGenerationInputPrevious | null> {
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
      sceneSummary: row.episode_summary,
      chosenAction: row.chosen_action,
      choiceIntent: row.intent,
      consequence: row.consequence,
    };
  }
}

interface StoredGenerationMetadata {
  beat: string | null;
  pacingRole: string | null;
  motifSignature: SceneMotifSignature | null;
  resolvedThreadKeys: string[];
}

function parseStoredGenerationMetadata(raw: string): StoredGenerationMetadata {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const threadChanges = isRecord(value.threadChanges) ? value.threadChanges : null;
    return {
      beat: typeof value.beat === 'string' ? value.beat : null,
      pacingRole: typeof value.pacingRole === 'string' ? value.pacingRole : null,
      motifSignature: parseMotifSignature(value.motifSignature),
      resolvedThreadKeys: threadChanges && Array.isArray(threadChanges.resolve)
        ? threadChanges.resolve.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return { beat: null, pacingRole: null, motifSignature: null, resolvedThreadKeys: [] };
  }
}

function parseMotifSignature(value: unknown): SceneMotifSignature | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.beat !== 'string'
    || typeof value.threadCategory !== 'string'
    || typeof value.dominantRelation !== 'string'
    || typeof value.intentFamily !== 'string'
    || typeof value.consequenceFamily !== 'string'
  ) return null;
  return value as unknown as SceneMotifSignature;
}

function parseChoiceStateDelta(raw: string | null): ChoiceStateDelta | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ChoiceStateDelta>;
    if (
      !Array.isArray(value.relationships)
      || !Array.isArray(value.factsToAdd)
      || !Array.isArray(value.factKeysToResolve)
      || !Array.isArray(value.threadsToOpen)
      || !Array.isArray(value.threadKeysToResolve)
      || typeof value.nextTone !== 'string'
    ) return null;
    return value as ChoiceStateDelta;
  } catch {
    return null;
  }
}

function safeParseDramaState(raw: string) {
  try {
    return parseDramaState(raw);
  } catch {
    return createInitialDramaState();
  }
}

function parseJsonStringArray(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 3) : [];
  } catch {
    return [];
  }
}

function uniqueRecentTexts(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value.trim();
    const key = semanticTextKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text.slice(0, 240));
    if (result.length >= limit) break;
  }
  return result;
}

function buildArcCheckpointSummary(rows: CheckpointSourceRow[]): string {
  const text = rows
    .map((row) => `S${row.episode_number}: ${row.summary.trim()} -> ${row.consequence.trim()}`)
    .join(' | ')
    .replace(/\s+/gu, ' ')
    .trim();
  return text.length <= 600 ? text : `${text.slice(0, 597).trimEnd()}…`;
}

function selectBoundedFacts(
  facts: FactState[],
  limit = SCENE_GENERATION_CONTEXT_LIMITS.activeFacts,
): FactState[] {
  if (facts.length <= limit) return facts.map((item) => ({ ...item }));
  const foundational = facts.slice(0, SCENE_GENERATION_CONTEXT_LIMITS.foundationalFacts);
  const recent = facts.slice(-(limit - foundational.length));
  const byKey = new Map<string, FactState>();
  for (const item of [...foundational, ...recent]) byKey.set(item.key, { ...item });
  return [...byKey.values()].slice(0, limit);
}

function selectBoundedThreads(
  threads: ThreadState[],
  limit = SCENE_GENERATION_CONTEXT_LIMITS.openThreads,
): ThreadState[] {
  return [...threads]
    .sort((left, right) => right.urgency - left.urgency || left.key.localeCompare(right.key))
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

function selectBoundedRelationships(
  relationships: RelationshipState[],
  limit = SCENE_GENERATION_CONTEXT_LIMITS.relationships,
): RelationshipState[] {
  return [...relationships]
    .sort((left, right) => relationshipPressure(right) - relationshipPressure(left) || `${left.fromKey}\u0000${left.toKey}`.localeCompare(`${right.fromKey}\u0000${right.toKey}`))
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

function relationshipPressure(value: RelationshipState): number {
  return Math.max(Math.abs(value.affinity), Math.abs(value.trust), value.tension);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type SceneGenerationInputPrevious = GenerationContext['input']['previous'] extends infer T ? Exclude<T, null> : never;
type SceneGenerationInputRecentHistory = GenerationContext['input']['recentHistory'];

function toScene(episode: EpisodeRow, rows: ChoiceRow[], commit: CommitRow | null): Scene {
  if (rows.length !== 3) throw new Error('Stored live scene must have exactly three choices.');
  const choices = rows.map(toChoice) as [Choice, Choice, Choice];
  const content = parseEpisodeContent(episode.script_json);
  const consequence = commit
    ? commit.consequence ?? choices.find((choice) => choice.id === commit.choice_id)?.consequence
    : undefined;
  if (commit && !consequence) throw new Error('Committed branch consequence is missing.');
  return {
    id: episode.id,
    number: episode.episode_number,
    title: episode.title,
    script: content.script,
    summary: episode.summary,
    choices,
    branch: commit
      ? { state: 'committed', choiceId: commit.choice_id, consequence: consequence! }
      : { state: 'open' },
  };
}

function toChoice(row: ChoiceRow): Choice {
  if (row.choice_key !== 'A' && row.choice_key !== 'B' && row.choice_key !== 'C') throw new Error('Stored choice key is invalid.');
  return {
    id: row.id,
    key: row.choice_key,
    label: row.label,
    intent: row.intent ?? '',
    consequence: row.consequence ?? '',
  };
}

function toCharacterIdentity(row: CharacterRow): CharacterIdentity {
  if (row.role !== 'protagonist') throw new Error('Primary character role is invalid.');
  return { id: row.id, name: row.name, role: 'protagonist' };
}

function toDramaSummary(session: Drama): DramaSummary {
  const scene = session.currentScene;
  return {
    id: session.id,
    sceneId: scene.id,
    title: session.title,
    premise: session.premise,
    mood: session.mood,
    characterName: session.leadCharacter.name,
    updatedAt: session.updatedAt,
    sceneNumber: scene.number,
    status: scene.branch.state === 'open' ? 'awaiting_choice' : 'ready_for_next_scene',
    resumeLine: scene.branch.state === 'committed' ? scene.branch.consequence : scene.summary,
  };
}

function toHistoryItem(row: HistoryRow): DramaHistoryItem {
  const item: DramaHistoryItem = {
    sceneId: row.episode_id,
    sceneNumber: row.episode_number,
    title: row.title,
    summary: row.summary,
    branchState: row.status === 'completed' ? 'committed' : 'open',
  };
  if (row.choice_key === 'A' || row.choice_key === 'B' || row.choice_key === 'C') item.choiceKey = row.choice_key;
  if (row.choice_label) item.choiceLabel = row.choice_label;
  if (row.consequence) item.consequence = row.consequence;
  return item;
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

function matchesCreation(plot: PlotRow, character: CharacterRow, input: DramaCreateInput): boolean {
  return plot.premise === input.premise && plot.locale === input.locale && plot.mood === input.mood && character.name === input.characterName;
}

function titleFromPremise(premise: string): string {
  const words = premise.trim().split(/\s+/u).slice(0, 8).join(' ');
  return words.length <= 72 ? words : `${words.slice(0, 69).trim()}…`;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isStoredSession(value: StoredDramaSession | null): value is StoredDramaSession {
  return value !== null;
}

function persistenceError(message: string): DramaResult<never> {
  return { ok: false, error: { code: 'persistence_error', message } };
}
