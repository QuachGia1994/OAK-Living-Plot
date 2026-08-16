import { describe, expect, it } from 'vitest';
import { BillingCoordinator } from '../src/features/billing/billing-coordinator';
import { BillingClientError, type BackendEntitlement, type EntitlementApi, type PurchaseGateway } from '../src/features/billing/contracts';

const plus: BackendEntitlement = {
  tier: 'plus',
  plusActive: true,
  expiresAt: '2026-09-16T09:30:00.000Z',
  syncedAt: '2026-08-16T09:30:01.000Z',
};

class FakePurchases implements PurchaseGateway {
  configuredIds: string[] = [];
  paywallCalls = 0;
  restoreCalls = 0;

  async configure(appUserId: string) {
    this.configuredIds.push(appUserId);
  }

  async presentPlusPaywall() {
    this.paywallCalls += 1;
    return 'purchased' as const;
  }

  async restorePurchases() {
    this.restoreCalls += 1;
  }
}

class FakeEntitlements implements EntitlementApi {
  tokens: string[] = [];
  value: BackendEntitlement = plus;

  async loadEntitlement(bearerToken: string) {
    this.tokens.push(bearerToken);
    return this.value;
  }
}

function session(appUserId: string, token: string | null) {
  return { appUserId, async getBearerToken() { return token; } };
}

describe('BillingCoordinator', () => {
  it('configures RevenueCat with the canonical internal user ID and refreshes backend entitlement after paywall', async () => {
    const purchases = new FakePurchases();
    const entitlements = new FakeEntitlements();
    const coordinator = new BillingCoordinator(purchases, entitlements);

    const result = await coordinator.presentPaywall(session('internal-user-123', 'session-token'));

    expect(purchases.configuredIds).toEqual(['internal-user-123']);
    expect(purchases.paywallCalls).toBe(1);
    expect(entitlements.tokens).toEqual(['session-token']);
    expect(result).toEqual({ storeAction: 'purchased', entitlement: plus });
  });

  it('refreshes backend entitlement after user-initiated restore instead of trusting CustomerInfo', async () => {
    const purchases = new FakePurchases();
    const entitlements = new FakeEntitlements();
    const coordinator = new BillingCoordinator(purchases, entitlements);

    const result = await coordinator.restore(session('internal-user-123', 'session-token'));

    expect(purchases.restoreCalls).toBe(1);
    expect(entitlements.tokens).toEqual(['session-token']);
    expect(result.entitlement.plusActive).toBe(true);
  });

  it('never opens the store for a missing authenticated billing identity', async () => {
    const purchases = new FakePurchases();
    const coordinator = new BillingCoordinator(purchases, new FakeEntitlements());

    await expect(coordinator.presentPaywall(session('', null))).rejects.toMatchObject({
      code: 'invalid_session',
    });
    expect(purchases.paywallCalls).toBe(0);
    expect(purchases.configuredIds).toEqual([]);
  });

  it('reports backend refresh failure separately after a store action', async () => {
    const purchases = new FakePurchases();
    const entitlements: EntitlementApi = {
      async loadEntitlement() {
        throw new Error('network down');
      },
    };
    const coordinator = new BillingCoordinator(purchases, entitlements);

    await expect(coordinator.presentPaywall(session('internal-user-123', 'session-token'))).rejects.toEqual(
      new BillingClientError('backend_unavailable', 'The store action completed, but the server entitlement could not be refreshed yet.'),
    );
  });
});
