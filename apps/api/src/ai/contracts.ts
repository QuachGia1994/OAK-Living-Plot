export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface EpisodeGenerationInput {
  locale: string;
  targetSpokenSeconds: number;
  contentRating: 'teen';
  plot: {
    premise: string;
    mood: string;
    summary: string;
    stateVersion: number;
  };
  characters: Array<{
    key: string;
    name: string;
    role: string;
    traits: string;
    goal: string;
    secret: string;
  }>;
  relationships: Array<{
    fromKey: string;
    toKey: string;
    affinity: number;
    trust: number;
    tension: number;
    status: string;
  }>;
  activeFacts: Array<{ key: string; text: string }>;
  openThreads: Array<{ key: string; title: string; urgency: number }>;
  previous: null | {
    episodeSummary: string;
    chosenAction: string;
    choiceIntent: string;
    consequence: string;
  };
}

export interface RelationshipDelta {
  fromKey: string;
  toKey: string;
  affinityDelta: number;
  trustDelta: number;
  tensionDelta: number;
  statusText: string;
}

export interface ThreadProposal {
  title: string;
  urgency: number;
}

export interface ChoiceStateDelta {
  relationships: RelationshipDelta[];
  factsToAdd: string[];
  factKeysToResolve: string[];
  threadsToOpen: ThreadProposal[];
  threadKeysToResolve: string[];
  nextTone: string;
}

export interface EpisodeChoiceProposal {
  key: 'A' | 'B' | 'C';
  label: string;
  intent: string;
  consequence: string;
  stateDelta: ChoiceStateDelta;
}

export interface EpisodeProposal {
  title: string;
  script: string;
  summary: string;
  establishedFacts: string[];
  threadChanges: {
    open: ThreadProposal[];
    resolve: string[];
  };
  choices: [EpisodeChoiceProposal, EpisodeChoiceProposal, EpisodeChoiceProposal];
}

export interface StoryGenerationUsage {
  inputTokens: number;
  outputTokens: number;
}

export type StoryGenerationError =
  | { code: 'invalid_input'; message: string }
  | { code: 'provider_unavailable'; message: string; retryable: boolean }
  | { code: 'invalid_response'; message: string; attempts: number };

export interface StoryGenerationSuccess {
  proposal: EpisodeProposal;
  usage: StoryGenerationUsage;
  attempts: number;
  provider: 'gemini';
  model: string;
}

export interface StoryGenerator {
  generate(input: EpisodeGenerationInput): Promise<Result<StoryGenerationSuccess, StoryGenerationError>>;
}
