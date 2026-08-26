import { describe, expect, it } from 'vitest';
import { dramaRoute } from '../src/features/drama/drama-navigation';

describe('drama navigation', () => {
  it('targets the root player with the selected drama identity', () => {
    expect(dramaRoute('drama-scene-02')).toEqual({
      pathname: '/drama',
      params: { dramaId: 'drama-scene-02' },
    });
  });

  it('keeps read-only state on the same root player route', () => {
    expect(dramaRoute('archived-drama', true)).toEqual({
      pathname: '/drama',
      params: { dramaId: 'archived-drama', readOnly: '1' },
    });
  });
});
