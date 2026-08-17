import { episodeDepthBucket, type ProductEventTelemetry, type ProductTelemetrySink } from './product-events';

export class CloudflareProductTelemetrySink implements ProductTelemetrySink {
  constructor(private readonly dataset: Pick<AnalyticsEngineDataset, 'writeDataPoint'>) {}

  recordProductEvent(event: ProductEventTelemetry): void {
    this.dataset.writeDataPoint({
      indexes: [event.event],
      blobs: [
        'product_event',
        event.event,
        event.mood ?? 'none',
        event.tier ?? 'unknown',
        episodeDepthBucket(event.episodeNumber),
      ],
      doubles: [
        1,
        event.episodeNumber ?? 0,
      ],
    });
  }
}
