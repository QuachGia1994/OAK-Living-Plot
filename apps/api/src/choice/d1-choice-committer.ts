import type { ChoiceStateDelta, SceneProposal } from '../ai/contracts';
import { parseDramaState } from '../domain/drama-state';
import type { ChoiceCommitInput, ChoiceCommitResult, ChoiceCommitSuccess } from './contracts';
import { applyCommittedChoiceState } from './state-application';

interface ExistingCommitRow {
  id: string;
  choice_id: string;
  choice_key: string;
  sequence: number;
  state_version_before: number;
  state_version_after: number;
  state_json_after: string;
}

interface CommitContextRow {
  plot_status: 'active' | 'completed' | 'archived';
  plot_version: number;
  state_json: string;
  episode_status: 'ready' | 'completed';
  episode_number: number;
  state_version_after_publish: number;
  script_json: string;
  choice_key: string;
  intent: string;
  consequence: string;
  state_delta_json: string;
}

interface StoredSceneContent {
  script: string;
  establishedFacts: string[];
  threadChanges: SceneProposal['threadChanges'];
}

export class D1ChoiceCommitter {
  constructor(private readonly db: D1Database) {}

  async commit(input: ChoiceCommitInput): Promise<ChoiceCommitResult> {
    const invalid = validateInput(input);
    if (invalid) return { ok: false, error: { code: 'invalid_input', message: invalid } };

    const existing = await this.loadExisting(input);
    if (existing) return this.resolveExisting(existing, input);

    const context = await this.loadContext(input);
    if (!context) return { ok: false, error: { code: 'not_found', message: 'Episode or choice not found.' } };
    if (context.plot_status !== 'active') {
      return { ok: false, error: { code: 'inactive_plot', message: 'Plot is not active.' } };
    }
    if (context.episode_status !== 'ready') {
      return { ok: false, error: { code: 'episode_not_ready', message: 'Episode is not ready for a choice.' } };
    }
    if (context.plot_version !== input.expectedStateVersion || context.state_version_after_publish !== input.expectedStateVersion) {
      return this.stale(context.plot_version);
    }

    const nextState = computeNextState(context, input.episodeId, input.choiceId);
    if (!nextState.ok) return { ok: false, error: { code: 'invalid_state', message: nextState.error } };

    const commitId = crypto.randomUUID();
    const stateVersionAfter = input.expectedStateVersion + 1;
    const stateJsonAfter = JSON.stringify(nextState.value);

    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO choice_commits (
              id, plot_id, episode_id, choice_id, sequence, choice_key, intent, consequence,
              state_version_before, state_version_after, state_json_after
            )
            SELECT ?, e.plot_id, e.id, c.id, e.episode_number, c.choice_key, c.intent, c.consequence, ?, ?, ?
            FROM episodes e
            JOIN plots p ON p.id = e.plot_id
            JOIN episode_choices c ON c.episode_id = e.id AND c.id = ?
            WHERE e.id = ? AND e.plot_id = ? AND p.user_id = ? AND p.status = 'active'
              AND e.status = 'ready' AND p.version = ? AND e.state_version_after_publish = ?`,
          )
          .bind(
            commitId,
            input.expectedStateVersion,
            stateVersionAfter,
            stateJsonAfter,
            input.choiceId,
            input.episodeId,
            input.plotId,
            input.userId,
            input.expectedStateVersion,
            input.expectedStateVersion,
          ),
        this.db
          .prepare(
            `UPDATE episodes
             SET status = 'completed', completed_at = unixepoch() * 1000
             WHERE id = ? AND status = 'ready'
               AND EXISTS (SELECT 1 FROM choice_commits WHERE id = ?)`,
          )
          .bind(input.episodeId, commitId),
        this.db
          .prepare(
            `UPDATE plots
             SET state_json = ?, version = version + 1, updated_at = unixepoch() * 1000
             WHERE id = ? AND user_id = ? AND status = 'active' AND version = ?
               AND EXISTS (SELECT 1 FROM choice_commits WHERE id = ?)`,
          )
          .bind(stateJsonAfter, input.plotId, input.userId, input.expectedStateVersion, commitId),
      ]);
    } catch {
      return this.resolveAfterRace(input);
    }

    const committed = await this.loadExisting(input);
    if (!committed) return this.resolveAfterRace(input);
    return this.resolveExisting(committed, input, commitId);
  }

  private async resolveAfterRace(input: ChoiceCommitInput): Promise<ChoiceCommitResult> {
    const existing = await this.loadExisting(input);
    if (existing) return this.resolveExisting(existing, input);

    const context = await this.loadContext(input);
    if (!context) return { ok: false, error: { code: 'not_found', message: 'Episode or choice not found.' } };
    if (context.plot_status !== 'active') {
      return { ok: false, error: { code: 'inactive_plot', message: 'Plot is not active.' } };
    }
    if (context.plot_version !== input.expectedStateVersion) return this.stale(context.plot_version);
    return { ok: false, error: { code: 'persistence_error', message: 'Choice commit failed.' } };
  }

  private async loadExisting(input: ChoiceCommitInput): Promise<ExistingCommitRow | null> {
    return this.db
      .prepare(
        `SELECT cc.id, cc.choice_id, cc.choice_key, cc.sequence,
                cc.state_version_before, cc.state_version_after, cc.state_json_after
         FROM choice_commits cc
         JOIN plots p ON p.id = cc.plot_id
         WHERE cc.plot_id = ? AND cc.episode_id = ? AND p.user_id = ?`,
      )
      .bind(input.plotId, input.episodeId, input.userId)
      .first<ExistingCommitRow>();
  }

  private async loadContext(input: ChoiceCommitInput): Promise<CommitContextRow | null> {
    return this.db
      .prepare(
        `SELECT p.status AS plot_status, p.version AS plot_version, p.state_json,
                e.status AS episode_status, e.episode_number, e.state_version_after_publish,
                e.script_json, c.choice_key, c.intent, c.consequence, c.state_delta_json
         FROM plots p
         JOIN episodes e ON e.plot_id = p.id AND e.id = ?
         JOIN episode_choices c ON c.episode_id = e.id AND c.id = ?
         WHERE p.id = ? AND p.user_id = ?`,
      )
      .bind(input.episodeId, input.choiceId, input.plotId, input.userId)
      .first<CommitContextRow>();
  }

  private resolveExisting(existing: ExistingCommitRow, input: ChoiceCommitInput, createdId?: string): ChoiceCommitResult {
    if (existing.choice_id !== input.choiceId) {
      return {
        ok: false,
        error: {
          code: 'already_committed',
          message: 'A different choice is already committed for this episode.',
          committedChoiceId: existing.choice_id,
        },
      };
    }

    try {
      const state = parseDramaState(existing.state_json_after);
      const value: ChoiceCommitSuccess = {
        commitId: existing.id,
        plotId: input.plotId,
        episodeId: input.episodeId,
        choiceId: existing.choice_id,
        choiceKey: parseChoiceKey(existing.choice_key),
        sequence: existing.sequence,
        stateVersionBefore: existing.state_version_before,
        stateVersionAfter: existing.state_version_after,
        state,
        replayed: existing.id !== createdId,
      };
      return { ok: true, value };
    } catch {
      return { ok: false, error: { code: 'invalid_state', message: 'Stored committed state is invalid.' } };
    }
  }

  private stale(currentStateVersion: number): ChoiceCommitResult {
    return {
      ok: false,
      error: { code: 'stale_state', message: 'Plot state version is stale.', currentStateVersion },
    };
  }
}

function computeNextState(
  context: CommitContextRow,
  episodeId: string,
  choiceId: string,
): { ok: true; value: ReturnType<typeof parseDramaState> } | { ok: false; error: string } {
  try {
    const state = parseDramaState(context.state_json);
    const scene = parseSceneContent(context.script_json);
    const delta = JSON.parse(context.state_delta_json) as ChoiceStateDelta;
    return applyCommittedChoiceState(state, episodeId, choiceId, scene, delta);
  } catch {
    return { ok: false, error: 'Stored scene, choice, or drama state is invalid.' };
  }
}

function parseSceneContent(raw: string): StoredSceneContent {
  const value = JSON.parse(raw) as Partial<StoredSceneContent>;
  if (!Array.isArray(value.establishedFacts) || !value.establishedFacts.every((item) => typeof item === 'string')) {
    throw new Error('Invalid established facts.');
  }
  if (!value.threadChanges || !Array.isArray(value.threadChanges.open) || !Array.isArray(value.threadChanges.resolve)) {
    throw new Error('Invalid thread changes.');
  }
  return value as StoredSceneContent;
}

function parseChoiceKey(value: string): 'A' | 'B' | 'C' {
  if (value === 'A' || value === 'B' || value === 'C') return value;
  throw new Error('Invalid committed choice key.');
}

function validateInput(input: ChoiceCommitInput): string | null {
  if (!input.userId.trim() || !input.plotId.trim() || !input.episodeId.trim() || !input.choiceId.trim()) {
    return 'User, plot, episode, and choice identifiers are required.';
  }
  if (!Number.isInteger(input.expectedStateVersion) || input.expectedStateVersion < 0) return 'State version is invalid.';
  return null;
}
