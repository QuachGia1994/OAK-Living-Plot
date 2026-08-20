import type { DramaHistory } from './contracts';

export interface JourneyStats {
  scenes: number;
  committedChoices: number;
  furthestScene: number;
}

export function journeyStats(history: DramaHistory): JourneyStats {
  let committedChoices = 0;
  let furthestScene = 0;
  for (const item of history.items) {
    if (item.branchState === 'committed') committedChoices += 1;
    furthestScene = Math.max(furthestScene, item.sceneNumber);
  }
  return { scenes: history.items.length, committedChoices, furthestScene };
}
