import type { MediaAssetStatus } from '@/features/drama/domain';

const AUTO_POLL_DELAYS_MS = [1_500, 2_000, 3_000, 4_000, 5_000, 5_000] as const;

export function nextMediaPoll(status: MediaAssetStatus, completedPolls: number): { delayMs: number } | null {
  if (status !== 'queued' && status !== 'processing') return null;
  const delayMs = AUTO_POLL_DELAYS_MS[completedPolls];
  return delayMs === undefined ? null : { delayMs };
}
