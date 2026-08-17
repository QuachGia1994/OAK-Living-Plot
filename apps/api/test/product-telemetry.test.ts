import { describe, expect, it } from 'vitest';
import { CloudflareProductTelemetrySink } from '../src/telemetry/cloudflare-product-telemetry';

describe('CloudflareProductTelemetrySink', () => {
  it('writes only bounded non-identifying product dimensions', () => {
    const points: AnalyticsEngineDataPoint[] = [];
    const sink = new CloudflareProductTelemetrySink({ writeDataPoint(point) { if (point) points.push(point); } });

    sink.recordProductEvent({ event: 'choice_committed', mood: 'mysterious', episodeNumber: 3, tier: 'plus' });

    expect(points).toEqual([{
      indexes: ['choice_committed'],
      blobs: ['product_event', 'choice_committed', 'mysterious', 'plus'],
      doubles: [1, 3],
    }]);
    const serialized = JSON.stringify(points[0]);
    expect(serialized).not.toContain('user');
    expect(serialized).not.toContain('plot-');
    expect(serialized).not.toContain('episode-');
    expect(serialized).not.toContain('premise');
    expect(serialized).not.toContain('script');
  });
});
