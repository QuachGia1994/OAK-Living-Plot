export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface SceneGenerationInput {
  locale: string;
  targetSpokenSeconds: number;
  contentRating: 'teen';
  drama: {
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
  recentHistory: Array<{
    sceneNumber: number;
    title: string;
    summary: string;
    committedChoice: string | null;
    choiceIntent: string | null;
    consequence: string | null;
    choiceLabels: string[];
    beat?: string | null;
    motifSignature?: {
      beat: string;
      threadCategory: string;
      dominantRelation: string;
      intentFamily: string;
      consequenceFamily: string;
    } | null;
    committedRelationshipDeltas?: Array<{
      fromKey: string;
      toKey: string;
      affinityDelta: number;
      trustDelta: number;
      tensionDelta: number;
      statusText: string;
    }>;
  }>;
  previous: null | {
    sceneSummary: string;
    chosenAction: string;
    choiceIntent: string;
    consequence: string;
  };
  /** Compact long-run novelty constraints derived server-side before generation. */
  novelty?: {
    excludedBeats: string[];
    trajectoryConstraints: Array<{
      fromKey: string;
      toKey: string;
      dimension: 'affinity' | 'trust' | 'tension';
      direction: 'up' | 'down';
      streak: number;
    }>;
    motifHistory: Array<{
      beat: string;
      threadCategory: string;
      dominantRelation: string;
      intentFamily: string;
      consequenceFamily: string;
    }>;
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

export interface SceneChoiceProposal {
  key: 'A' | 'B' | 'C';
  label: string;
  intent: string;
  consequence: string;
  stateDelta: ChoiceStateDelta;
}

export interface SceneProposal {
  title: string;
  script: string;
  summary: string;
  /** Phase-1 structural narrative beat (required for novelty publication gate). */
  beat?: string;
  establishedFacts: string[];
  threadChanges: {
    open: ThreadProposal[];
    resolve: string[];
  };
  choices: [SceneChoiceProposal, SceneChoiceProposal, SceneChoiceProposal];
}

export interface SceneGenerationUsage {
  inputTokens: number;
  outputTokens: number;
}

export type SceneGenerationError =
  | { code: 'invalid_input'; message: string }
  | { code: 'provider_unavailable'; message: string; retryable: boolean; providerStatus?: number }
  | { code: 'invalid_response'; message: string; attempts: number };

export interface SceneGenerationSuccess {
  proposal: SceneProposal;
  usage: SceneGenerationUsage;
  attempts: number;
  provider: string;
  model: string;
}

export interface SceneGenerator {
  generate(input: SceneGenerationInput): Promise<Result<SceneGenerationSuccess, SceneGenerationError>>;
}
