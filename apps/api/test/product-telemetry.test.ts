import { describe, expect, it } from 'vitest';
import { CloudflareProductTelemetrySink } from '../src/telemetry/cloudflare-product-telemetry';
import { sceneDepthBucket } from '../src/telemetry/product-events';

describe('CloudflareProductTelemetrySink', () => {
  it('writes only bounded non-identifying product dimensions', () => {
    const points: AnalyticsEngineDataPoint[] = [];
    const sink = new CloudflareProductTelemetrySink({ writeDataPoint(point) { if (point) points.push(point); } });

    sink.recordProductEvent({ event: 'choice_committed', mood: 'mysterious', sceneNumber: 3, tier: 'plus' });

    expect(points).toEqual([{
      indexes: ['choice_committed'],
      blobs: ['product_event', 'choice_committed', 'mysterious', 'plus', 'scenes_2_3'],
      doubles: [1, 3],
    }]);
    const serialized = JSON.stringify(points[0]);
    expect(serialized).not.toContain('user');
    expect(serialized).not.toContain('plot-');
    expect(serialized).not.toContain('episode-');
    expect(serialized).not.toContain('premise');
    expect(serialized).not.toContain('script');
  });

  it('buckets scene depth without adding a user identifier', () => {
    expect(sceneDepthBucket()).toBe('none');
    expect(sceneDepthBucket(1)).toBe('scene_1');
    expect(sceneDepthBucket(3)).toBe('scenes_2_3');
    expect(sceneDepthBucket(7)).toBe('scenes_4_7');
    expect(sceneDepthBucket(8)).toBe('scene_8_plus');
  });
});
