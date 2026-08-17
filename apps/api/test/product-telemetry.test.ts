import { describe, expect, it } from 'vitest';
import { CloudflareProductTelemetrySink } from '../src/telemetry/cloudflare-product-telemetry';
import { episodeDepthBucket } from '../src/telemetry/product-events';

describe('CloudflareProductTelemetrySink', () => {
  it('writes only bounded non-identifying product dimensions', () => {
    const points: AnalyticsEngineDataPoint[] = [];
    const sink = new CloudflareProductTelemetrySink({ writeDataPoint(point) { if (point) points.push(point); } });

    sink.recordProductEvent({ event: 'choice_committed', mood: 'mysterious', episodeNumber: 3, tier: 'plus' });

    expect(points).toEqual([{
      indexes: ['choice_committed'],
      blobs: ['product_event', 'choice_committed', 'mysterious', 'plus', 'episodes_2_3'],
      doubles: [1, 3],
    }]);
    const serialized = JSON.stringify(points[0]);
    expect(serialized).not.toContain('user');
    expect(serialized).not.toContain('plot-');
    expect(serialized).not.toContain('episode-');
    expect(serialized).not.toContain('premise');
    expect(serialized).not.toContain('script');
  });

  it('buckets episode depth without adding a user identifier', () => {
    expect(episodeDepthBucket()).toBe('none');
    expect(episodeDepthBucket(1)).toBe('episode_1');
    expect(episodeDepthBucket(3)).toBe('episodes_2_3');
    expect(episodeDepthBucket(7)).toBe('episodes_4_7');
    expect(episodeDepthBucket(8)).toBe('episode_8_plus');
  });
});
