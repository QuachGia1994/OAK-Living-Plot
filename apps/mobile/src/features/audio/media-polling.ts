import type { MediaAssetStatus } from '@/features/drama/domain';

const AUTO_POLL_DELAYS_MS = [1_500, 2_000, 3_000, 4_000, 5_000, 8_000, 10_000, 15_000, 20_000, 25_000, 30_000, 30_000, 30_000] as const;

export function nextMediaPoll(status: MediaAssetStatus, completedPolls: number): { delayMs: number } | null {
  if (status !== 'queued' && status !== 'processing') return null;
  const delayMs = AUTO_POLL_DELAYS_MS[completedPolls];
  return delayMs === undefined ? null : { delayMs };
}
