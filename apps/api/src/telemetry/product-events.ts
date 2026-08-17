import type { LiveStoryMood } from '../live-story/contracts';

export type ProductEventName =
  | 'plot_created'
  | 'plot_archived'
  | 'plot_restored'
  | 'choice_committed'
  | 'next_episode_published'
  | 'voice_requested';

export type EpisodeDepthBucket = 'none' | 'episode_1' | 'episodes_2_3' | 'episodes_4_7' | 'episode_8_plus';

export interface ProductEventTelemetry {
  event: ProductEventName;
  mood?: LiveStoryMood;
  episodeNumber?: number;
  tier?: 'free' | 'plus';
}

export function episodeDepthBucket(episodeNumber?: number): EpisodeDepthBucket {
  if (typeof episodeNumber !== 'number' || !Number.isInteger(episodeNumber) || episodeNumber < 1) return 'none';
  if (episodeNumber === 1) return 'episode_1';
  if (episodeNumber <= 3) return 'episodes_2_3';
  if (episodeNumber <= 7) return 'episodes_4_7';
  return 'episode_8_plus';
}

export interface ProductTelemetrySink {
  recordProductEvent(event: ProductEventTelemetry): void;
}

export const NOOP_PRODUCT_TELEMETRY: ProductTelemetrySink = {
  recordProductEvent() {},
};
