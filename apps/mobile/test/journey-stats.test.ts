import { expect, it } from 'vitest';
import { journeyStats } from '../src/features/drama/journey-stats';

it('derives journey metrics only from canonical history items', () => {
  expect(journeyStats({
    dramaId: 'drama-1',
    title: 'Journey',
    items: [
      { sceneId: 's1', sceneNumber: 1, title: 'One', summary: 'A', branchState: 'committed', choiceKey: 'A' },
      { sceneId: 's2', sceneNumber: 2, title: 'Two', summary: 'B', branchState: 'committed', choiceKey: 'B' },
      { sceneId: 's3', sceneNumber: 3, title: 'Three', summary: 'C', branchState: 'open' },
    ],
  })).toEqual({ scenes: 3, committedChoices: 2, furthestScene: 3 });
});
