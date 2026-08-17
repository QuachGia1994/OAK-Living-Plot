const DEFAULT_MAX_BEATS = 4;

export function buildSubtitleBeats(body: string, maxBeats = DEFAULT_MAX_BEATS): string[] {
  const normalized = body.replace(/\s+/gu, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+(?:[.!?]+|$)/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [normalized];
  if (sentences.length <= maxBeats) return sentences;

  const beatCount = Math.max(1, Math.min(maxBeats, sentences.length));
  const beats: string[] = [];
  let cursor = 0;

  for (let index = 0; index < beatCount; index += 1) {
    const remainingSentences = sentences.length - cursor;
    const remainingBeats = beatCount - index;
    const take = Math.ceil(remainingSentences / remainingBeats);
    beats.push(sentences.slice(cursor, cursor + take).join(' '));
    cursor += take;
  }

  return beats;
}

export type SceneMotif = 'signal' | 'threshold' | 'table' | 'street' | 'interior';

export function sceneMotifForText(text: string): SceneMotif {
  const normalized = text.toLocaleLowerCase();
  if (/phone|message|voice note|voicemail|recording|screen|call|email|text\b/u.test(normalized)) return 'signal';
  if (/door|hallway|elevator|apartment|room|building|corridor|keycard/u.test(normalized)) return 'threshold';
  if (/restaurant|chef|kitchen|table|dinner|café|cafe|meal/u.test(normalized)) return 'table';
  if (/street|car|train|station|city|rain|alley|bridge/u.test(normalized)) return 'street';
  return 'interior';
}

export function clampSceneBeat(index: number, beatCount: number): number {
  if (beatCount <= 0) return 0;
  return Math.max(0, Math.min(index, beatCount - 1));
}
