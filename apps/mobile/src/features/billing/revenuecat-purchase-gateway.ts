import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import type { PaywallActionResult, PurchaseGateway } from './contracts';
import { BillingClientError } from './contracts';
import { resolveRevenueCatConfig, type RevenueCatPublicKeys } from './revenuecat-config';

const PLUS_ENTITLEMENT_ID = 'plus';

export class RevenueCatPurchaseGateway implements PurchaseGateway {
  private configuredAppUserId: string | null = null;

  constructor(private readonly keys: RevenueCatPublicKeys) {}

  async configure(appUserId: string): Promise<void> {
    const normalized = appUserId.trim();
    if (!normalized) throw new BillingClientError('invalid_session', 'RevenueCat App User ID is required.');
    if (this.configuredAppUserId === normalized && await Purchases.isConfigured()) return;

    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
    if (!platform) throw new BillingClientError('billing_not_configured', 'RevenueCat purchases require an iOS or Android development build.');
    const config = resolveRevenueCatConfig(platform, this.keys);
    if (!config.apiKey) {
      throw new BillingClientError('billing_not_configured', 'RevenueCat Test Store or platform SDK key is not configured.');
    }

    try {
      if (await Purchases.isConfigured()) {
        const current = await Purchases.getAppUserID();
        if (current !== normalized) await Purchases.logIn(normalized);
      } else {
        Purchases.configure({ apiKey: config.apiKey, appUserID: normalized });
      }
      this.configuredAppUserId = normalized;
    } catch {
      throw new BillingClientError('store_unavailable', 'RevenueCat could not initialize the signed-in store session.');
    }
  }

  async presentPlusPaywall(): Promise<PaywallActionResult> {
    this.requireConfigured();
    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: PLUS_ENTITLEMENT_ID,
        displayCloseButton: true,
      });
      if (result === PAYWALL_RESULT.PURCHASED) return 'purchased';
      if (result === PAYWALL_RESULT.RESTORED) return 'restored';
      if (result === PAYWALL_RESULT.CANCELLED) return 'cancelled';
      return 'not_presented';
    } catch {
      throw new BillingClientError('store_unavailable', 'The RevenueCat paywall could not be presented.');
    }
  }

  async restorePurchases(): Promise<void> {
    this.requireConfigured();
    try {
      await Purchases.restorePurchases();
    } catch {
      throw new BillingClientError('store_unavailable', 'Purchase restore could not be completed.');
    }
  }

  private requireConfigured(): void {
    if (!this.configuredAppUserId) {
      throw new BillingClientError('billing_not_configured', 'RevenueCat is not configured for a signed-in user.');
    }
  }
}
