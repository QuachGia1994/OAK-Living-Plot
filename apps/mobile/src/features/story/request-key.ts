let sequence = 0;

export function createStoryRequestKey(prefix: string): string {
  sequence = (sequence + 1) % 1_000_000;
  const random = Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}-${random}`.slice(0, 128);
}
