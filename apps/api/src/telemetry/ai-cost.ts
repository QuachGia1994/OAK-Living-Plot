import type { StoryGenerationUsage } from '../ai/contracts';

export const GEMINI_3_5_FLASH_LITE_STANDARD_PRICING = {
  model: 'gemini-3.5-flash-lite',
  tier: 'standard_paid',
  revision: '2026-08-16',
  inputNanoUsdPerToken: 300,
  outputNanoUsdPerToken: 2500,
} as const;

export interface AiCostBreakdown {
  pricingTier: string;
  pricingRevision: string;
  inputNanoUsd: number;
  outputNanoUsd: number;
  totalNanoUsd: number;
}

export function calculateAiCost(model: string, usage: StoryGenerationUsage): AiCostBreakdown | null {
  if (model !== GEMINI_3_5_FLASH_LITE_STANDARD_PRICING.model) return null;
  if (!isSafeTokenCount(usage.inputTokens) || !isSafeTokenCount(usage.outputTokens)) return null;

  const inputNanoUsd = usage.inputTokens * GEMINI_3_5_FLASH_LITE_STANDARD_PRICING.inputNanoUsdPerToken;
  const outputNanoUsd = usage.outputTokens * GEMINI_3_5_FLASH_LITE_STANDARD_PRICING.outputNanoUsdPerToken;
  if (!Number.isSafeInteger(inputNanoUsd) || !Number.isSafeInteger(outputNanoUsd)) return null;
  const totalNanoUsd = inputNanoUsd + outputNanoUsd;
  if (!Number.isSafeInteger(totalNanoUsd)) return null;

  return {
    pricingTier: GEMINI_3_5_FLASH_LITE_STANDARD_PRICING.tier,
    pricingRevision: GEMINI_3_5_FLASH_LITE_STANDARD_PRICING.revision,
    inputNanoUsd,
    outputNanoUsd,
    totalNanoUsd,
  };
}

function isSafeTokenCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
