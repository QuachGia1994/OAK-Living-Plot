import { sceneDepthBucket, type ProductEventTelemetry, type ProductTelemetrySink } from './product-events';

export class CloudflareProductTelemetrySink implements ProductTelemetrySink {
  constructor(private readonly dataset?: Pick<AnalyticsEngineDataset, 'writeDataPoint'>) {}

  recordProductEvent(event: ProductEventTelemetry): void {
    if (!this.dataset) return;
    this.dataset.writeDataPoint({
      indexes: [event.event],
      blobs: [
        'product_event',
        event.event,
        event.mood ?? 'none',
        event.tier ?? 'unknown',
        sceneDepthBucket(event.sceneNumber),
      ],
      doubles: [
        1,
        event.sceneNumber ?? 0,
      ],
    });
  }
}
