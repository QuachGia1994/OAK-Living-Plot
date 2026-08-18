import { calculateAiCost } from './ai-cost';
import type { GenerationAttemptTelemetry, GenerationTelemetrySink } from './contracts';

export class CloudflareGenerationTelemetrySink implements GenerationTelemetrySink {
  constructor(private readonly dataset: Pick<AnalyticsEngineDataset, 'writeDataPoint'>) {}

  recordGenerationAttempt(event: GenerationAttemptTelemetry): void {
    const cost = calculateAiCost(event.model, event.usage);
    if (!cost) return;

    this.dataset.writeDataPoint({
      indexes: [event.model],
      blobs: [
        'scene_generation_attempt',
        event.provider,
        event.model,
        event.outcome,
        cost.pricingTier,
        cost.pricingRevision,
      ],
      doubles: [
        1,
        event.attempt,
        event.usage.inputTokens,
        event.usage.outputTokens,
        cost.inputNanoUsd,
        cost.outputNanoUsd,
        cost.totalNanoUsd,
      ],
    });
  }
}
