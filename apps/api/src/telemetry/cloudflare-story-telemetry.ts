import { calculateAiCost } from './ai-cost';
import type { StoryGenerationAttemptTelemetry, StoryTelemetrySink } from './contracts';

export class CloudflareStoryTelemetrySink implements StoryTelemetrySink {
  constructor(private readonly dataset: Pick<AnalyticsEngineDataset, 'writeDataPoint'>) {}

  recordGenerationAttempt(event: StoryGenerationAttemptTelemetry): void {
    const cost = calculateAiCost(event.model, event.usage);
    if (!cost) return;

    this.dataset.writeDataPoint({
      indexes: [event.model],
      blobs: [
        'story_generation_attempt',
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
