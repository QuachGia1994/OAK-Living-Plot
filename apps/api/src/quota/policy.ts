import type { QuotaPolicy, QuotaResource, QuotaTier } from './contracts';

export type QuotaMode = 'enforced' | 'preview_unlimited';

const POLICIES: Record<QuotaTier, QuotaPolicy> = {
  free: {
    legacyTextDisplayLimit: 50,
    voiceEpisodesPerUtcDay: 1,
  },
  plus: {
    legacyTextDisplayLimit: 100,
    voiceEpisodesPerUtcDay: 10,
  },
};

export function quotaPolicyFor(tier: QuotaTier): QuotaPolicy {
  return POLICIES[tier];
}

export function quotaLimitFor(tier: QuotaTier, resourceType: QuotaResource): number {
  const policy = quotaPolicyFor(tier);
  return resourceType === 'text_episode'
    ? policy.legacyTextDisplayLimit
    : policy.voiceEpisodesPerUtcDay;
}

export function quotaModeFromEnv(value: string | undefined): QuotaMode {
  return value === 'preview_unlimited' ? 'preview_unlimited' : 'enforced';
}

export function quotaResourceIsEnforced(mode: QuotaMode, resourceType: QuotaResource): boolean {
  if (resourceType === 'text_episode') return false;
  return mode === 'enforced';
}
