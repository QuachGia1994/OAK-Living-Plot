import type {
  BillingRefreshResult,
  BillingSession,
  EntitlementApi,
  PurchaseGateway,
} from './contracts';
import { BillingClientError } from './contracts';

export class BillingCoordinator {
  constructor(
    private readonly purchases: PurchaseGateway,
    private readonly entitlements: EntitlementApi,
  ) {}

  async presentPaywall(session: BillingSession): Promise<BillingRefreshResult> {
    validateSession(session);
    await this.purchases.configure(session.appUserId);
    const storeAction = await this.purchases.presentPlusPaywall();
    return {
      storeAction,
      entitlement: await this.refreshBackend(session),
    };
  }

  async restore(session: BillingSession): Promise<BillingRefreshResult> {
    validateSession(session);
    await this.purchases.configure(session.appUserId);
    await this.purchases.restorePurchases();
    return {
      storeAction: 'restore',
      entitlement: await this.refreshBackend(session),
    };
  }

  async refresh(session: BillingSession): Promise<BillingRefreshResult> {
    validateSession(session);
    return {
      storeAction: 'not_presented',
      entitlement: await this.refreshBackend(session),
    };
  }

  private async refreshBackend(session: BillingSession) {
    const bearerToken = await session.getBearerToken();
    if (!bearerToken?.trim()) throw new BillingClientError('invalid_session', 'The signed-in session token is unavailable.');
    try {
      return await this.entitlements.loadEntitlement(bearerToken);
    } catch (error) {
      if (error instanceof BillingClientError) throw error;
      throw new BillingClientError(
        'backend_unavailable',
        'The store action completed, but the server entitlement could not be refreshed yet.',
      );
    }
  }
}

function validateSession(session: BillingSession): void {
  if (!session.appUserId.trim() || typeof session.getBearerToken !== 'function') {
    throw new BillingClientError('invalid_session', 'A verified signed-in billing session is required.');
  }
}
