import type { EpisodeGenerationInput, EpisodeProposal } from '../src/ai/contracts';

export function makeGenerationInput(): EpisodeGenerationInput {
  return {
    locale: 'vi-VN',
    targetSpokenSeconds: 75,
    contentRating: 'teen',
    plot: {
      premise: 'Linh discovers a hidden message that changes a close friendship.',
      mood: 'tense',
      summary: 'Linh suspects the protagonist hid something important.',
      stateVersion: 3,
    },
    characters: [
      { key: 'hero', name: 'An', role: 'protagonist', traits: 'careful', goal: 'protect Linh', secret: 'hid the message' },
      { key: 'linh', name: 'Linh', role: 'best friend', traits: 'observant', goal: 'learn the truth', secret: '' },
    ],
    relationships: [
      { fromKey: 'hero', toKey: 'linh', affinity: 40, trust: 35, tension: 45, status: 'strained' },
    ],
    activeFacts: [{ key: 'fact-hidden-message', text: 'An hid a message from Linh.' }],
    openThreads: [{ key: 'thread-trust', title: 'Linh questions An’s honesty.', urgency: 80 }],
    previous: {
      episodeSummary: 'Linh found the hidden message.',
      chosenAction: 'An admits hiding it.',
      choiceIntent: 'confess partially',
      consequence: 'Linh demands the whole truth immediately.',
    },
  };
}

export function makeValidProposal(): EpisodeProposal {
  return {
    title: 'The Rest of the Truth',
    script: Array.from({ length: 140 }, (_, index) => `word${index}`).join(' '),
    summary: 'An gives Linh part of the truth while the friendship becomes more fragile.',
    establishedFacts: ['Linh knows An intentionally hid the message.'],
    threadChanges: { open: [], resolve: [] },
    choices: [
      makeChoice('A', 'Tell Linh everything now', 'full confession', -5, 5, 10),
      makeChoice('B', 'Ask Linh for one night', 'delay with consent', -2, -3, 5),
      makeChoice('C', 'Protect the final secret', 'continue concealment', -8, -10, 15),
    ],
  };
}

function makeChoice(
  key: 'A' | 'B' | 'C',
  label: string,
  intent: string,
  affinityDelta: number,
  trustDelta: number,
  tensionDelta: number,
) {
  return {
    key,
    label,
    intent,
    consequence: `Immediate consequence for choice ${key}.`,
    stateDelta: {
      relationships: [
        {
          fromKey: 'hero',
          toKey: 'linh',
          affinityDelta,
          trustDelta,
          tensionDelta,
          statusText: 'relationship shifts',
        },
      ],
      factsToAdd: [],
      factKeysToResolve: [],
      threadsToOpen: [],
      threadKeysToResolve: [],
      nextTone: key === 'A' ? 'raw' : key === 'B' ? 'uncertain' : 'dangerous',
    },
  };
}
