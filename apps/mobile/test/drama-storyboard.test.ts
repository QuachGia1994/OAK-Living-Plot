import { describe, expect, it } from 'vitest';
import { buildSubtitleBeats, clampSceneBeat, sceneMotifForText } from '../src/ui/drama-storyboard';

describe('drama storyboard', () => {
  it('keeps short scene copy as sentence-sized subtitle beats', () => {
    expect(buildSubtitleBeats('Mina looks up. The hallway light dies. Someone knocks.')).toEqual([
      'Mina looks up.',
      'The hallway light dies.',
      'Someone knocks.',
    ]);
  });

  it('compresses long episode prose into at most four readable beats without dropping text', () => {
    const body = 'One. Two. Three. Four. Five. Six.';
    const beats = buildSubtitleBeats(body);
    expect(beats).toHaveLength(4);
    expect(beats.join(' ')).toBe(body);
  });

  it('normalizes whitespace and handles prose without punctuation', () => {
    expect(buildSubtitleBeats('  One   uninterrupted scene beat  ')).toEqual(['One uninterrupted scene beat']);
    expect(buildSubtitleBeats('   ')).toEqual([]);
  });

  it('derives a lightweight visual motif from scene language', () => {
    expect(sceneMotifForText('A voice note lights up the phone screen.')).toBe('signal');
    expect(sceneMotifForText('The elevator door opens into a dark hallway.')).toBe('threshold');
    expect(sceneMotifForText('The chef waits alone in the restaurant kitchen.')).toBe('table');
    expect(sceneMotifForText('Rain cuts across the empty city street.')).toBe('street');
    expect(sceneMotifForText('Mina studies the silence between them.')).toBe('interior');
  });

  it('clamps scene beat navigation to the available range', () => {
    expect(clampSceneBeat(-2, 4)).toBe(0);
    expect(clampSceneBeat(2, 4)).toBe(2);
    expect(clampSceneBeat(8, 4)).toBe(3);
    expect(clampSceneBeat(2, 0)).toBe(0);
  });
});
