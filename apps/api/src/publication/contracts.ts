import type { SceneGenerationUsage, SceneProposal } from '../ai/contracts';

export interface EpisodePublicationInput {
  userId: string;
  plotId: string;
  generationKey: string;
  expectedStateVersion: number;
  proposal: SceneProposal;
  generation: {
    provider: string;
    model: string;
    attempts: number;
    usage: SceneGenerationUsage;
  };
}

export interface PublishedChoice {
  id: string;
  key: 'A' | 'B' | 'C';
  position: 1 | 2 | 3;
  label: string;
  intent: string;
  consequence: string;
}

export interface PublishedEpisode {
  id: string;
  plotId: string;
  episodeNumber: number;
  generationKey: string;
  stateVersionBefore: number;
  stateVersionAfterPublish: number;
  title: string;
  script: string;
  summary: string;
  choices: [PublishedChoice, PublishedChoice, PublishedChoice];
  replayed: boolean;
}

export type EpisodePublicationError =
  | { code: 'invalid_input'; message: string }
  | { code: 'not_found'; message: string }
  | { code: 'inactive_plot'; message: string }
  | { code: 'pending_episode'; message: string; episodeId: string }
  | { code: 'stale_state'; message: string; currentStateVersion: number }
  | { code: 'persistence_error'; message: string };

export type EpisodePublicationResult =
  | { ok: true; value: PublishedEpisode }
  | { ok: false; error: EpisodePublicationError };
