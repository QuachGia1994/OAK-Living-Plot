import { describe, expect, it } from 'vitest';
import {
  GEMINI_3_5_FLASH_LITE_STANDARD_PRICING,
  calculateAiCost,
} from '../src/telemetry/ai-cost';

describe('calculateAiCost', () => {
  it('calculates Gemini 3.5 Flash-Lite standard paid pricing exactly in nano-USD', () => {
    const cost = calculateAiCost(GEMINI_3_5_FLASH_LITE_STANDARD_PRICING.model, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cost).toEqual({
      pricingTier: 'standard_paid',
      pricingRevision: '2026-08-16',
      inputNanoUsd: 300_000_000,
      outputNanoUsd: 2_500_000_000,
      totalNanoUsd: 2_800_000_000,
    });
  });

  it('keeps small request arithmetic exact without floating-point currency rounding', () => {
    const cost = calculateAiCost(GEMINI_3_5_FLASH_LITE_STANDARD_PRICING.model, {
      inputTokens: 120,
      outputTokens: 80,
    });

    expect(cost?.totalNanoUsd).toBe(236_000);
  });

  it('refuses deprecated/unknown pricing or unsafe token counts instead of inventing cost', () => {
    expect(calculateAiCost('gemini-2.5-flash-lite', { inputTokens: 10, outputTokens: 10 })).toBeNull();
    expect(calculateAiCost('unknown-model', { inputTokens: 10, outputTokens: 10 })).toBeNull();
    expect(
      calculateAiCost(GEMINI_3_5_FLASH_LITE_STANDARD_PRICING.model, {
        inputTokens: Number.MAX_SAFE_INTEGER,
        outputTokens: 0,
      }),
    ).toBeNull();
  });
});
