import type { AppEnv } from '../env';
import { D1EntitlementRepository } from './d1-entitlement-repository';
import type { RevenueCatSubscriberProvider } from './contracts';
import { RevenueCatSubscriberClient } from './revenuecat-subscriber-client';
import { verifyRevenueCatWebhook } from './revenuecat-webhook-verifier';
import { D1ReferralService } from '../referrals/d1-referral-service';

export interface RevenueCatWebhookDependencies {
  subscriberProvider?: RevenueCatSubscriberProvider;
  clock?: () => number;
}

export async function handleRevenueCatWebhookRequest(
  request: Request,
  env: AppEnv,
  dependencies: RevenueCatWebhookDependencies = {},
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const verification = await verifyRevenueCatWebhook(
    request,
    {
      authorization: env.REVENUECAT_WEBHOOK_AUTHORIZATION,
      signingSecret: env.REVENUECAT_WEBHOOK_SIGNING_SECRET,
    },
    dependencies.clock,
  );
  if (!verification.ok) {
    const status = verification.code === 'invalid_payload' ? 400 : 401;
    return json({ error: verification.code }, status);
  }

  const repository = new D1EntitlementRepository(env.DB, dependencies.clock);
  if (await repository.hasEvent(verification.event.id)) {
    const entitlement = await repository.getEntitlement(verification.event.appUserId);
    const stored = await repository.getStoredEventOutcome(verification.event.id);
    if (stored && !(await settleReferralReward(
      env.DB,
      verification.event.appUserId,
      verification.event.id,
      stored.eventType,
      stored.tierAfter,
      stored.eventTimestampMs,
    ))) {
      return json({ error: 'referral_reward_unavailable' }, 503);
    }
    return json({
      accepted: true,
      replayed: true,
      entitlement: clientEntitlement(entitlement),
    });
  }

  const provider = dependencies.subscriberProvider ?? new RevenueCatSubscriberClient(
    env.REVENUECAT_SECRET_API_KEY,
    env.REVENUECAT_PLUS_ENTITLEMENT_ID,
  );
  const providerResult = await provider.fetchEntitlement(verification.event.appUserId);
  if (!providerResult.ok) {
    return json({ error: 'revenuecat_unavailable' }, 503);
  }

  const applied = await repository.applyWebhook(verification.event, providerResult.value);
  if (!applied.ok) {
    if (applied.error.code === 'unknown_user') return json({ error: applied.error.code }, 409);
    if (applied.error.code === 'invalid_webhook') return json({ error: applied.error.code }, 400);
    return json({ error: 'persistence_error' }, 503);
  }

  if (!(await settleReferralReward(
    env.DB,
    verification.event.appUserId,
    verification.event.id,
    verification.event.type,
    providerResult.value.tier,
    verification.event.eventTimestampMs,
  ))) {
    return json({ error: 'referral_reward_unavailable' }, 503);
  }

  return json({
    accepted: true,
    replayed: applied.value.replayed,
    entitlement: clientEntitlement(applied.value.entitlement),
  });
}

async function settleReferralReward(
  db: D1Database,
  referredUserId: string,
  eventId: string,
  eventType: string,
  tier: 'free' | 'plus',
  plusActivatedAt: number,
): Promise<boolean> {
  if (tier !== 'plus' || !isReferralRewardActivation(eventType)) return true;
  const result = await new D1ReferralService(db).grantForPlusActivation(referredUserId, eventId, plusActivatedAt);
  return result.ok;
}

function isReferralRewardActivation(eventType: string): boolean {
  return eventType.trim().toUpperCase() === 'INITIAL_PURCHASE';
}

function clientEntitlement(entitlement: Awaited<ReturnType<D1EntitlementRepository['getEntitlement']>>) {
  return {
    tier: entitlement.tier,
    plusActive: entitlement.tier === 'plus',
    expiresAt: entitlement.plusExpiresAt === null ? null : new Date(entitlement.plusExpiresAt).toISOString(),
    syncedAt: entitlement.syncedAt === 0 ? null : new Date(entitlement.syncedAt).toISOString(),
  };
}

function json(body: unknown, status = 200): Response {
  const response = Response.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
