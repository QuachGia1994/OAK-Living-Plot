import type { DramaSuggestionTelemetryEvent, DramaSuggestionTelemetrySink } from '../drama-runtime/suggestion-contracts';

export class CloudflareDramaSuggestionTelemetrySink implements DramaSuggestionTelemetrySink {
  constructor(private readonly dataset?: Pick<AnalyticsEngineDataset, 'writeDataPoint'>) {}

  recordDramaSuggestion(event: DramaSuggestionTelemetryEvent): void {
    if (!this.dataset) return;
    this.dataset.writeDataPoint({
      indexes: [event.outcome],
      blobs: ['drama_seed_suggestion', event.outcome],
      doubles: [
        1,
        event.providerCalls,
        event.repairs,
        event.providerMs,
        event.parseMs,
        event.validateMs,
        event.totalMs,
      ],
    });
  }
}
