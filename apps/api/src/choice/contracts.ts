import type { DramaState } from '../domain/drama-state';

export interface ChoiceCommitInput {
  userId: string;
  plotId: string;
  episodeId: string;
  choiceId: string;
  expectedStateVersion: number;
}

export interface ChoiceCommitSuccess {
  commitId: string;
  plotId: string;
  episodeId: string;
  choiceId: string;
  choiceKey: 'A' | 'B' | 'C';
  sequence: number;
  stateVersionBefore: number;
  stateVersionAfter: number;
  state: DramaState;
  replayed: boolean;
}

export type ChoiceCommitError =
  | { code: 'invalid_input'; message: string }
  | { code: 'not_found'; message: string }
  | { code: 'inactive_plot'; message: string }
  | { code: 'episode_not_ready'; message: string }
  | { code: 'already_committed'; message: string; committedChoiceId: string }
  | { code: 'stale_state'; message: string; currentStateVersion: number }
  | { code: 'invalid_state'; message: string }
  | { code: 'persistence_error'; message: string };

export type ChoiceCommitResult =
  | { ok: true; value: ChoiceCommitSuccess }
  | { ok: false; error: ChoiceCommitError };
