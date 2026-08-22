import type { SceneChoiceProposal } from '../ai/contracts';
import { buildMotifSignature, type SceneMotifSignature } from '../evals/narrative-novelty';
import type {
  EpisodePublicationInput,
  EpisodePublicationResult,
  PublishedChoice,
  PublishedEpisode,
} from './contracts';

interface PlotPublicationRow {
  status: 'active' | 'completed' | 'archived';
  version: number;
  next_episode_number: number;
}

interface ReadyEpisodeRow {
  id: string;
}

interface PublishedEpisodeRow {
  id: string;
  plot_id: string;
  episode_number: number;
  generation_key: string;
  state_version_before: number;
  state_version_after_publish: number;
  title: string;
  script_json: string;
  summary: string;
}

interface PublishedChoiceRow {
  id: string;
  position: number;
  choice_key: string;
  label: string;
  intent: string;
  consequence: string;
}

interface StoredEpisodeContent {
  script: string;
  establishedFacts: string[];
  threadChanges: EpisodePublicationInput['proposal']['threadChanges'];
  beat: string | null;
  pacingRole: string | null;
  motifSignature: SceneMotifSignature;
}

export class D1EpisodePublisher {
  constructor(private readonly db: D1Database) {}

  async publish(input: EpisodePublicationInput): Promise<EpisodePublicationResult> {
    const invalid = validateInput(input);
    if (invalid) return { ok: false, error: { code: 'invalid_input', message: invalid } };

    const existing = await this.loadByGenerationKey(input.userId, input.plotId, input.generationKey);
    if (existing) return { ok: true, value: { ...existing, replayed: true } };

    const plot = await this.loadPlot(input.userId, input.plotId);
    if (!plot) return { ok: false, error: { code: 'not_found', message: 'Plot not found.' } };
    if (plot.status !== 'active') {
      return { ok: false, error: { code: 'inactive_plot', message: 'Plot is not active.' } };
    }
    const pending = await this.loadReadyEpisode(input.userId, input.plotId);
    if (pending) {
      return { ok: false, error: { code: 'pending_episode', message: 'A published episode still awaits a choice.', episodeId: pending.id } };
    }
    if (plot.version !== input.expectedStateVersion) {
      return {
        ok: false,
        error: { code: 'stale_state', message: 'Plot state version is stale.', currentStateVersion: plot.version },
      };
    }

    const episodeId = crypto.randomUUID();
    const choiceIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()] as const;
    const stateVersionAfterPublish = input.expectedStateVersion + 1;
    const episodeNumber = plot.next_episode_number;
    const content: StoredEpisodeContent = {
      script: input.proposal.script,
      establishedFacts: input.proposal.establishedFacts,
      threadChanges: input.proposal.threadChanges,
      beat: input.proposal.beat ?? null,
      pacingRole: input.proposal.pacingRole ?? null,
      motifSignature: buildMotifSignature(input.proposal),
    };

    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO episodes (
              id, plot_id, episode_number, title, script_json, summary, status,
              generation_key, state_version_before, state_version_after_publish,
              provider, model, generation_attempts, input_tokens, output_tokens
            )
            SELECT ?, id, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?
            FROM plots
            WHERE id = ? AND user_id = ? AND status = 'active' AND version = ? AND next_episode_number = ?
              AND NOT EXISTS (SELECT 1 FROM episodes pending WHERE pending.plot_id = plots.id AND pending.status = 'ready')`,
          )
          .bind(
            episodeId,
            episodeNumber,
            input.proposal.title,
            JSON.stringify(content),
            input.proposal.summary,
            input.generationKey,
            input.expectedStateVersion,
            stateVersionAfterPublish,
            input.generation.provider,
            input.generation.model,
            input.generation.attempts,
            input.generation.usage.inputTokens,
            input.generation.usage.outputTokens,
            input.plotId,
            input.userId,
            input.expectedStateVersion,
            episodeNumber,
          ),
        ...input.proposal.choices.map((choice, index) =>
          this.choiceInsert(episodeId, choiceIds[index], index + 1, choice),
        ),
        this.db
          .prepare(
            `UPDATE plots
             SET summary = ?, version = version + 1, next_episode_number = next_episode_number + 1,
                 updated_at = unixepoch() * 1000
             WHERE id = ? AND user_id = ? AND status = 'active' AND version = ? AND next_episode_number = ?`,
          )
          .bind(input.proposal.summary, input.plotId, input.userId, input.expectedStateVersion, episodeNumber),
      ]);
    } catch {
      const replay = await this.loadByGenerationKey(input.userId, input.plotId, input.generationKey);
      if (replay) return { ok: true, value: { ...replay, replayed: true } };

      const current = await this.loadPlot(input.userId, input.plotId);
      if (!current) return { ok: false, error: { code: 'not_found', message: 'Plot not found.' } };
      if (current.status !== 'active') {
        return { ok: false, error: { code: 'inactive_plot', message: 'Plot is not active.' } };
      }
      const pending = await this.loadReadyEpisode(input.userId, input.plotId);
      if (pending) {
        return { ok: false, error: { code: 'pending_episode', message: 'A published episode still awaits a choice.', episodeId: pending.id } };
      }
      if (current.version !== input.expectedStateVersion) {
        return {
          ok: false,
          error: { code: 'stale_state', message: 'Plot state version is stale.', currentStateVersion: current.version },
        };
      }
      return { ok: false, error: { code: 'persistence_error', message: 'Episode publication failed.' } };
    }

    return {
      ok: true,
      value: {
        id: episodeId,
        plotId: input.plotId,
        episodeNumber,
        generationKey: input.generationKey,
        stateVersionBefore: input.expectedStateVersion,
        stateVersionAfterPublish,
        title: input.proposal.title,
        script: input.proposal.script,
        summary: input.proposal.summary,
        choices: toPublishedChoices(choiceIds, input.proposal.choices),
        replayed: false,
      },
    };
  }

  private choiceInsert(
    episodeId: string,
    choiceId: string,
    position: number,
    choice: SceneChoiceProposal,
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO episode_choices
          (id, episode_id, position, choice_key, label, intent, consequence, state_delta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        choiceId,
        episodeId,
        position,
        choice.key,
        choice.label,
        choice.intent,
        choice.consequence,
        JSON.stringify(choice.stateDelta),
      );
  }

  private async loadPlot(userId: string, plotId: string): Promise<PlotPublicationRow | null> {
    return this.db
      .prepare('SELECT status, version, next_episode_number FROM plots WHERE id = ? AND user_id = ?')
      .bind(plotId, userId)
      .first<PlotPublicationRow>();
  }

  private async loadReadyEpisode(userId: string, plotId: string): Promise<ReadyEpisodeRow | null> {
    return this.db
      .prepare(
        `SELECT e.id FROM episodes e
         JOIN plots p ON p.id = e.plot_id
         WHERE e.plot_id = ? AND e.status = 'ready' AND p.user_id = ?
         ORDER BY e.episode_number LIMIT 1`,
      )
      .bind(plotId, userId)
      .first<ReadyEpisodeRow>();
  }

  private async loadByGenerationKey(
    userId: string,
    plotId: string,
    generationKey: string,
  ): Promise<Omit<PublishedEpisode, 'replayed'> | null> {
    const episode = await this.db
      .prepare(
        `SELECT e.id, e.plot_id, e.episode_number, e.generation_key,
                e.state_version_before, e.state_version_after_publish,
                e.title, e.script_json, e.summary
         FROM episodes e
         JOIN plots p ON p.id = e.plot_id
         WHERE e.plot_id = ? AND e.generation_key = ? AND p.user_id = ?`,
      )
      .bind(plotId, generationKey, userId)
      .first<PublishedEpisodeRow>();
    if (!episode) return null;

    const choices = await this.db
      .prepare(
        `SELECT id, position, choice_key, label, intent, consequence
         FROM episode_choices WHERE episode_id = ? ORDER BY position`,
      )
      .bind(episode.id)
      .all<PublishedChoiceRow>();
    if (choices.results.length !== 3) throw new Error('Published episode choices are incomplete.');

    const content = parseStoredContent(episode.script_json);
    return {
      id: episode.id,
      plotId: episode.plot_id,
      episodeNumber: episode.episode_number,
      generationKey: episode.generation_key,
      stateVersionBefore: episode.state_version_before,
      stateVersionAfterPublish: episode.state_version_after_publish,
      title: episode.title,
      script: content.script,
      summary: episode.summary,
      choices: choices.results.map(toPublishedChoice) as [PublishedChoice, PublishedChoice, PublishedChoice],
    };
  }
}

function validateInput(input: EpisodePublicationInput): string | null {
  if (!input.userId.trim() || !input.plotId.trim()) return 'User and plot identifiers are required.';
  if (input.generationKey !== input.generationKey.trim() || input.generationKey.length < 8 || input.generationKey.length > 128) {
    return 'Generation key must be 8–128 non-padded characters.';
  }
  if (!Number.isInteger(input.expectedStateVersion) || input.expectedStateVersion < 0) return 'State version is invalid.';
  if (!input.proposal.title.trim() || !input.proposal.script.trim() || !input.proposal.summary.trim()) return 'Episode proposal is incomplete.';
  if (input.proposal.choices.map((choice) => choice.key).join(',') !== 'A,B,C') return 'Episode choices must be A, B, C.';
  if (!input.generation.model.trim() || !Number.isInteger(input.generation.attempts) || input.generation.attempts < 1 || input.generation.attempts > 2) {
    return 'Generation metadata is invalid.';
  }
  const { inputTokens, outputTokens } = input.generation.usage;
  if (!Number.isInteger(inputTokens) || inputTokens < 0 || !Number.isInteger(outputTokens) || outputTokens < 0) {
    return 'Generation usage is invalid.';
  }
  return null;
}

function toPublishedChoices(
  ids: readonly [string, string, string],
  choices: EpisodePublicationInput['proposal']['choices'],
): [PublishedChoice, PublishedChoice, PublishedChoice] {
  return choices.map((choice, index) => ({
    id: ids[index],
    key: choice.key,
    position: (index + 1) as 1 | 2 | 3,
    label: choice.label,
    intent: choice.intent,
    consequence: choice.consequence,
  })) as [PublishedChoice, PublishedChoice, PublishedChoice];
}

function toPublishedChoice(row: PublishedChoiceRow): PublishedChoice {
  if (!['A', 'B', 'C'].includes(row.choice_key) || ![1, 2, 3].includes(row.position)) {
    throw new Error('Published choice data is invalid.');
  }
  return {
    id: row.id,
    key: row.choice_key as 'A' | 'B' | 'C',
    position: row.position as 1 | 2 | 3,
    label: row.label,
    intent: row.intent,
    consequence: row.consequence,
  };
}

function parseStoredContent(raw: string): StoredEpisodeContent {
  const value = JSON.parse(raw) as Partial<StoredEpisodeContent>;
  if (typeof value.script !== 'string' || !Array.isArray(value.establishedFacts) || !value.threadChanges) {
    throw new Error('Stored episode content is invalid.');
  }
  return value as StoredEpisodeContent;
}
