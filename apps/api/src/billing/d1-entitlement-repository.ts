import type {
  EntitlementSnapshot,
  RevenueCatProviderSnapshot,
  RevenueCatWebhookEvent,
  RevenueCatWebhookResult,
} from './contracts';

interface EntitlementRow {
  user_id: string;
  tier: 'free' | 'plus';
  plus_expires_at: number | null;
  provider_request_date_ms: number;
  source_event_id: string | null;
  synced_at: number;
}

interface EventRow {
  ingest_token: string;
}

type Clock = () => number;

export class D1EntitlementRepository {
  constructor(
    private readonly db: D1Database,
    private readonly clock: Clock = Date.now,
  ) {}

  async hasEvent(eventId: string): Promise<boolean> {
    if (!eventId.trim()) return false;
    const row = await this.db
      .prepare('SELECT 1 AS found FROM revenuecat_events WHERE id = ?')
      .bind(eventId)
      .first<{ found: number }>();
    return row?.found === 1;
  }

  async getEntitlement(userId: string): Promise<EntitlementSnapshot> {
    if (!userId.trim()) return freeSnapshot(userId);
    const row = await this.db
      .prepare(
        `SELECT user_id, tier, plus_expires_at, provider_request_date_ms, source_event_id, synced_at
         FROM user_entitlements WHERE user_id = ?`,
      )
      .bind(userId)
      .first<EntitlementRow>();
    return row ? toEffectiveSnapshot(row, this.clock()) : freeSnapshot(userId);
  }

  async applyWebhook(
    event: RevenueCatWebhookEvent,
    provider: RevenueCatProviderSnapshot,
  ): Promise<RevenueCatWebhookResult> {
    if (event.appUserId !== provider.appUserId) {
      return { ok: false, error: { code: 'invalid_webhook', message: 'Webhook and provider identities do not match.' } };
    }
    if (!(await this.userExists(event.appUserId))) {
      return { ok: false, error: { code: 'unknown_user', message: 'RevenueCat App User ID is not a known internal user.' } };
    }

    const ingestToken = crypto.randomUUID();
    const now = this.clock();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT OR IGNORE INTO revenuecat_events
               (id, ingest_token, user_id, event_type, environment, event_timestamp_ms, entitlement_ids_json,
                product_id, transaction_id, provider_request_date_ms, tier_after, plus_expires_at, received_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            event.id,
            ingestToken,
            event.appUserId,
            event.type,
            event.environment,
            event.eventTimestampMs,
            JSON.stringify(event.entitlementIds),
            event.productId,
            event.transactionId,
            provider.requestDateMs,
            provider.tier,
            provider.plusExpiresAt,
            now,
          ),
        this.db
          .prepare(
            `INSERT INTO user_entitlements
               (user_id, tier, plus_expires_at, provider_request_date_ms, source_event_id, synced_at)
             SELECT user_id, ?, ?, ?, id, ?
             FROM revenuecat_events
             WHERE id = ? AND ingest_token = ?
             ON CONFLICT(user_id) DO UPDATE SET
               tier = excluded.tier,
               plus_expires_at = excluded.plus_expires_at,
               provider_request_date_ms = excluded.provider_request_date_ms,
               source_event_id = excluded.source_event_id,
               synced_at = excluded.synced_at
             WHERE excluded.provider_request_date_ms >= user_entitlements.provider_request_date_ms`,
          )
          .bind(
            provider.tier,
            provider.plusExpiresAt,
            provider.requestDateMs,
            now,
            event.id,
            ingestToken,
          ),
      ]);
    } catch {
      return { ok: false, error: { code: 'persistence_error', message: 'Entitlement persistence failed.' } };
    }

    const storedEvent = await this.db
      .prepare('SELECT ingest_token FROM revenuecat_events WHERE id = ?')
      .bind(event.id)
      .first<EventRow>();
    if (!storedEvent) {
      return { ok: false, error: { code: 'persistence_error', message: 'Entitlement event was not persisted.' } };
    }

    return {
      ok: true,
      value: {
        entitlement: await this.getEntitlement(event.appUserId),
        replayed: storedEvent.ingest_token !== ingestToken,
      },
    };
  }

  private async userExists(userId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 AS found FROM users WHERE id = ?')
      .bind(userId)
      .first<{ found: number }>();
    return row?.found === 1;
  }
}

function toEffectiveSnapshot(row: EntitlementRow, nowMs: number): EntitlementSnapshot {
  const expired = row.tier === 'plus' && row.plus_expires_at !== null && row.plus_expires_at <= nowMs;
  return {
    userId: row.user_id,
    tier: expired ? 'free' : row.tier,
    plusExpiresAt: expired ? null : row.plus_expires_at,
    providerRequestDateMs: row.provider_request_date_ms,
    sourceEventId: row.source_event_id,
    syncedAt: row.synced_at,
  };
}

function freeSnapshot(userId: string): EntitlementSnapshot {
  return {
    userId,
    tier: 'free',
    plusExpiresAt: null,
    providerRequestDateMs: 0,
    sourceEventId: null,
    syncedAt: 0,
  };
}
