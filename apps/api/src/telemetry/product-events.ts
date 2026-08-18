import type { DramaMood } from '../domain/drama';

export type ProductEventName =
  | 'drama_created'
  | 'drama_archived'
  | 'drama_restored'
  | 'choice_committed'
  | 'next_scene_published'
  | 'voice_requested';

export type SceneDepthBucket = 'none' | 'scene_1' | 'scenes_2_3' | 'scenes_4_7' | 'scene_8_plus';

export interface ProductEventTelemetry {
  event: ProductEventName;
  mood?: DramaMood;
  sceneNumber?: number;
  tier?: 'free' | 'plus';
}

export function sceneDepthBucket(sceneNumber?: number): SceneDepthBucket {
  if (typeof sceneNumber !== 'number' || !Number.isInteger(sceneNumber) || sceneNumber < 1) return 'none';
  if (sceneNumber === 1) return 'scene_1';
  if (sceneNumber <= 3) return 'scenes_2_3';
  if (sceneNumber <= 7) return 'scenes_4_7';
  return 'scene_8_plus';
}

export interface ProductTelemetrySink {
  recordProductEvent(event: ProductEventTelemetry): void;
}

export const NOOP_PRODUCT_TELEMETRY: ProductTelemetrySink = {
  recordProductEvent() {},
};
