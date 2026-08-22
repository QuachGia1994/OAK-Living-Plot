import { calculateAiCost } from './ai-cost';
import type { GenerationAttemptTelemetry, GenerationPipelineTelemetry, GenerationTelemetrySink } from './contracts';

export class CloudflareGenerationTelemetrySink implements GenerationTelemetrySink {
  constructor(private readonly dataset?: Pick<AnalyticsEngineDataset, 'writeDataPoint'>) {}

  recordGenerationAttempt(event: GenerationAttemptTelemetry): void {
    if (!this.dataset) return;
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

  recordGenerationPipeline(event: GenerationPipelineTelemetry): void {
    if (!this.dataset) return;
    this.dataset.writeDataPoint({
      indexes: [event.model],
      blobs: ['scene_generation_pipeline', event.provider, event.model, event.outcome],
      doubles: [
        1,
        event.providerCalls,
        event.repairs,
        event.timings.providerMs,
        event.timings.parseMs,
        event.timings.compileMs,
        event.timings.validateMs,
        event.timings.totalMs,
      ],
    });
  }
}
