export type BillingTier = 'free' | 'plus';

export interface BackendEntitlement {
  tier: BillingTier;
  plusActive: boolean;
  expiresAt: string | null;
  syncedAt: string | null;
}

export interface BillingSession {
  appUserId: string;
  getBearerToken(): Promise<string | null>;
}

export type PaywallActionResult = 'purchased' | 'restored' | 'cancelled' | 'not_presented';

export interface PurchaseGateway {
  configure(appUserId: string): Promise<void>;
  presentPlusPaywall(): Promise<PaywallActionResult>;
  restorePurchases(): Promise<void>;
}

export interface EntitlementApi {
  loadEntitlement(bearerToken: string): Promise<BackendEntitlement>;
}

export interface BillingRefreshResult {
  storeAction: PaywallActionResult | 'restore';
  entitlement: BackendEntitlement;
}

export type BillingErrorCode =
  | 'invalid_session'
  | 'billing_not_configured'
  | 'store_unavailable'
  | 'backend_unavailable';

export class BillingClientError extends Error {
  constructor(
    readonly code: BillingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BillingClientError';
  }
}
