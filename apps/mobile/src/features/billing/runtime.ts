import { BillingCoordinator } from './billing-coordinator';
import { HttpEntitlementApi } from './http-entitlement-api';
import { RevenueCatPurchaseGateway, revenueCatPublicKeysFromEnv } from './revenuecat-purchase-gateway';

export function createBillingCoordinator(): BillingCoordinator {
  return new BillingCoordinator(
    new RevenueCatPurchaseGateway(revenueCatPublicKeysFromEnv()),
    new HttpEntitlementApi(process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL ?? ''),
  );
}
