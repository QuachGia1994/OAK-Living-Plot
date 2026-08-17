import type { LiveStoryMood } from '../live-story/contracts';

export type ProductEventName =
  | 'plot_created'
  | 'plot_archived'
  | 'plot_restored'
  | 'choice_committed'
  | 'next_episode_published'
  | 'voice_requested';

export interface ProductEventTelemetry {
  event: ProductEventName;
  mood?: LiveStoryMood;
  episodeNumber?: number;
  tier?: 'free' | 'plus';
}

export interface ProductTelemetrySink {
  recordProductEvent(event: ProductEventTelemetry): void;
}

export const NOOP_PRODUCT_TELEMETRY: ProductTelemetrySink = {
  recordProductEvent() {},
};
