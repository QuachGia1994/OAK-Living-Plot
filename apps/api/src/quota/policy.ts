import type { QuotaPolicy, QuotaResource, QuotaTier } from './contracts';

export type QuotaMode = 'enforced' | 'preview_unlimited';

const POLICIES: Record<QuotaTier, QuotaPolicy> = {
  free: {
    textEpisodesPerUtcDay: 50,
    voiceEpisodesPerUtcDay: 1,
  },
  plus: {
    textEpisodesPerUtcDay: 100,
    voiceEpisodesPerUtcDay: 10,
  },
};

export function quotaPolicyFor(tier: QuotaTier): QuotaPolicy {
  return POLICIES[tier];
}

export function quotaLimitFor(tier: QuotaTier, resourceType: QuotaResource): number {
  const policy = quotaPolicyFor(tier);
  return resourceType === 'text_episode'
    ? policy.textEpisodesPerUtcDay
    : policy.voiceEpisodesPerUtcDay;
}

export function quotaModeFromEnv(value: string | undefined): QuotaMode {
  return value === 'preview_unlimited' ? 'preview_unlimited' : 'enforced';
}

export function quotaIsEnforced(mode: QuotaMode): boolean {
  return mode === 'enforced';
}
