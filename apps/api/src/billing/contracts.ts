import type { QuotaTier } from '../quota/contracts';

export interface EntitlementSnapshot {
  userId: string;
  tier: QuotaTier;
  plusExpiresAt: number | null;
  providerRequestDateMs: number;
  sourceEventId: string | null;
  syncedAt: number;
}

export interface RevenueCatProviderSnapshot {
  appUserId: string;
  tier: QuotaTier;
  plusExpiresAt: number | null;
  requestDateMs: number;
}

export type RevenueCatProviderError =
  | { code: 'invalid_configuration'; message: string; retryable: false }
  | { code: 'provider_unavailable'; message: string; retryable: boolean }
  | { code: 'invalid_response'; message: string; retryable: boolean };

export type RevenueCatProviderResult =
  | { ok: true; value: RevenueCatProviderSnapshot }
  | { ok: false; error: RevenueCatProviderError };

export interface RevenueCatSubscriberProvider {
  fetchEntitlement(appUserId: string): Promise<RevenueCatProviderResult>;
}

export interface RevenueCatWebhookEvent {
  id: string;
  appUserId: string;
  type: string;
  environment: 'PRODUCTION' | 'SANDBOX' | null;
  eventTimestampMs: number;
  entitlementIds: string[];
  productId: string | null;
  transactionId: string | null;
}

export interface RevenueCatWebhookApplyResult {
  entitlement: EntitlementSnapshot;
  replayed: boolean;
}

export type RevenueCatWebhookError =
  | { code: 'invalid_webhook'; message: string }
  | { code: 'unknown_user'; message: string }
  | { code: 'persistence_error'; message: string };

export type RevenueCatWebhookResult =
  | { ok: true; value: RevenueCatWebhookApplyResult }
  | { ok: false; error: RevenueCatWebhookError };
