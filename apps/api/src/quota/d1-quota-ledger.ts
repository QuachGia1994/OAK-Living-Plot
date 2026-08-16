import type {
  QuotaConsumeInput,
  QuotaDailySnapshot,
  QuotaReconciliation,
  QuotaReleaseInput,
  QuotaReserveInput,
  QuotaReservationSnapshot,
  QuotaReservationStatus,
  QuotaResource,
  QuotaResult,
} from './contracts';
import { quotaLimitFor } from './policy';

type Clock = () => number;

interface ReservationRow {
  id: string;
  user_id: string;
  reservation_key: string;
  utc_day: string;
  resource_type: QuotaResource;
  status: QuotaReservationStatus;
  resource_id: string | null;
  last_event_id: string;
}

interface DailyUsageRow {
  text_episodes: number;
  voiced_episodes: number;
  text_reserved: number;
  voice_reserved: number;
}

interface LedgerProjectionRow {
  text_consumed: number;
  voice_consumed: number;
  text_reserved: number;
  voice_reserved: number;
}

export class D1QuotaLedger {
  constructor(
    private readonly db: D1Database,
    private readonly clock: Clock = Date.now,
  ) {}

  async reserve(input: QuotaReserveInput): Promise<QuotaResult> {
    const invalid = validateReserveInput(input);
    if (invalid) return invalidInput(invalid);

    const existing = await this.loadReservation(input.userId, input.reservationKey);
    if (existing) return this.resolveReserveReplay(existing, input);
    if (!(await this.userExists(input.userId))) {
      return { ok: false, error: { code: 'not_found', message: 'User not found.' } };
    }

    const now = this.clock();
    const utcDay = utcDayFromMillis(now);
    const limit = quotaLimitFor(input.tier, input.resourceType);
    const reservationId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    try {
      await this.db.batch([
        this.db
          .prepare('INSERT OR IGNORE INTO daily_usage (user_id, usage_date) VALUES (?, ?)')
          .bind(input.userId, utcDay),
        this.reserveStatement(input, utcDay, limit, reservationId, eventId, now),
        this.db
          .prepare(
            `INSERT INTO usage_events (id, user_id, utc_day, resource_type, event_type, reservation_key, created_at)
             SELECT ?, user_id, utc_day, resource_type, 'reserved', reservation_key, ?
             FROM quota_reservations
             WHERE id = ? AND last_event_id = ?`,
          )
          .bind(eventId, now, reservationId, eventId),
        this.reserveCounterStatement(input.userId, utcDay, input.resourceType, reservationId, eventId, now),
      ]);
    } catch {
      const raced = await this.loadReservation(input.userId, input.reservationKey);
      if (raced) return this.resolveReserveReplay(raced, input);
      if (!(await this.userExists(input.userId))) {
        return { ok: false, error: { code: 'not_found', message: 'User not found.' } };
      }
      return { ok: false, error: { code: 'persistence_error', message: 'Quota reservation failed.' } };
    }

    const reservation = await this.loadReservation(input.userId, input.reservationKey);
    if (reservation) {
      if (reservation.resource_type !== input.resourceType) return keyConflict();
      return { ok: true, value: await this.snapshot(reservation, reservation.id !== reservationId) };
    }

    return {
      ok: false,
      error: {
        code: 'quota_exceeded',
        message: 'Daily quota exhausted.',
        resourceType: input.resourceType,
        limit,
        utcDay,
      },
    };
  }

  async consume(input: QuotaConsumeInput): Promise<QuotaResult> {
    const invalid = validateConsumeInput(input);
    if (invalid) return invalidInput(invalid);

    const existing = await this.loadReservation(input.userId, input.reservationKey);
    if (!existing) return reservationNotFound();
    if (existing.status === 'consumed') {
      if (existing.resource_id !== input.resourceId) return keyConflict();
      return { ok: true, value: await this.snapshot(existing, true) };
    }
    if (existing.status === 'released') return invalidTransition(existing.status);

    const eventId = crypto.randomUUID();
    const now = this.clock();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE quota_reservations
             SET status = 'consumed', resource_id = ?, last_event_id = ?, updated_at = ?
             WHERE id = ? AND status = 'reserved'`,
          )
          .bind(input.resourceId, eventId, now, existing.id),
        this.db
          .prepare(
            `INSERT INTO usage_events (id, user_id, utc_day, resource_type, event_type, reservation_key, resource_id, created_at)
             SELECT ?, user_id, utc_day, resource_type, 'consumed', reservation_key, resource_id, ?
             FROM quota_reservations
             WHERE id = ? AND status = 'consumed' AND last_event_id = ?`,
          )
          .bind(eventId, now, existing.id, eventId),
        this.consumeCounterStatement(existing, eventId, now),
      ]);
    } catch {
      return this.resolveTerminalRace(input.userId, input.reservationKey, 'consumed', input.resourceId);
    }

    return this.resolveTerminalRace(input.userId, input.reservationKey, 'consumed', input.resourceId, eventId);
  }

  async release(input: QuotaReleaseInput): Promise<QuotaResult> {
    const invalid = validateReleaseInput(input);
    if (invalid) return invalidInput(invalid);

    const existing = await this.loadReservation(input.userId, input.reservationKey);
    if (!existing) return reservationNotFound();
    if (existing.status === 'released') return { ok: true, value: await this.snapshot(existing, true) };
    if (existing.status === 'consumed') return invalidTransition(existing.status);

    const eventId = crypto.randomUUID();
    const now = this.clock();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE quota_reservations
             SET status = 'released', last_event_id = ?, updated_at = ?
             WHERE id = ? AND status = 'reserved'`,
          )
          .bind(eventId, now, existing.id),
        this.db
          .prepare(
            `INSERT INTO usage_events (id, user_id, utc_day, resource_type, event_type, reservation_key, created_at)
             SELECT ?, user_id, utc_day, resource_type, 'released', reservation_key, ?
             FROM quota_reservations
             WHERE id = ? AND status = 'released' AND last_event_id = ?`,
          )
          .bind(eventId, now, existing.id, eventId),
        this.releaseCounterStatement(existing, eventId, now),
      ]);
    } catch {
      return this.resolveTerminalRace(input.userId, input.reservationKey, 'released', null);
    }

    return this.resolveTerminalRace(input.userId, input.reservationKey, 'released', null, eventId);
  }

  async getDailyUsage(userId: string, utcDay: string): Promise<QuotaDailySnapshot> {
    return this.loadDaily(userId, utcDay);
  }

  async reconcileDay(userId: string, utcDay: string): Promise<QuotaReconciliation> {
    const daily = await this.loadDaily(userId, utcDay);
    const ledger = await this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN resource_type = 'text_episode' AND event_type = 'consumed' THEN 1 ELSE 0 END), 0) AS text_consumed,
           COALESCE(SUM(CASE WHEN resource_type = 'voice_episode' AND event_type = 'consumed' THEN 1 ELSE 0 END), 0) AS voice_consumed,
           COALESCE(SUM(CASE WHEN resource_type = 'text_episode' AND event_type = 'reserved' THEN 1
                             WHEN resource_type = 'text_episode' AND event_type IN ('consumed', 'released') THEN -1 ELSE 0 END), 0) AS text_reserved,
           COALESCE(SUM(CASE WHEN resource_type = 'voice_episode' AND event_type = 'reserved' THEN 1
                             WHEN resource_type = 'voice_episode' AND event_type IN ('consumed', 'released') THEN -1 ELSE 0 END), 0) AS voice_reserved
         FROM usage_events WHERE user_id = ? AND utc_day = ?`,
      )
      .bind(userId, utcDay)
      .first<LedgerProjectionRow>();

    const projection = {
      textConsumed: ledger?.text_consumed ?? 0,
      voiceConsumed: ledger?.voice_consumed ?? 0,
      textReserved: ledger?.text_reserved ?? 0,
      voiceReserved: ledger?.voice_reserved ?? 0,
    };
    return {
      daily,
      ledger: projection,
      reconciled:
        daily.textConsumed === projection.textConsumed &&
        daily.voiceConsumed === projection.voiceConsumed &&
        daily.textReserved === projection.textReserved &&
        daily.voiceReserved === projection.voiceReserved,
    };
  }

  private reserveStatement(
    input: QuotaReserveInput,
    utcDay: string,
    limit: number,
    reservationId: string,
    eventId: string,
    now: number,
  ): D1PreparedStatement {
    const usageExpression = input.resourceType === 'text_episode'
      ? 'du.text_episodes + du.text_reserved'
      : 'du.voiced_episodes + du.voice_reserved';
    return this.db
      .prepare(
        `INSERT INTO quota_reservations
           (id, user_id, reservation_key, utc_day, resource_type, status, last_event_id, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, 'reserved', ?, ?, ?
         FROM daily_usage du
         WHERE du.user_id = ? AND du.usage_date = ? AND ${usageExpression} < ?
           AND NOT EXISTS (
             SELECT 1 FROM quota_reservations qr WHERE qr.user_id = ? AND qr.reservation_key = ?
           )`,
      )
      .bind(
        reservationId,
        input.userId,
        input.reservationKey,
        utcDay,
        input.resourceType,
        eventId,
        now,
        now,
        input.userId,
        utcDay,
        limit,
        input.userId,
        input.reservationKey,
      );
  }

  private reserveCounterStatement(
    userId: string,
    utcDay: string,
    resourceType: QuotaResource,
    reservationId: string,
    eventId: string,
    now: number,
  ): D1PreparedStatement {
    const column = resourceType === 'text_episode' ? 'text_reserved' : 'voice_reserved';
    return this.db
      .prepare(
        `UPDATE daily_usage SET ${column} = ${column} + 1, updated_at = ?
         WHERE user_id = ? AND usage_date = ?
           AND EXISTS (SELECT 1 FROM quota_reservations WHERE id = ? AND last_event_id = ?)`,
      )
      .bind(now, userId, utcDay, reservationId, eventId);
  }

  private consumeCounterStatement(existing: ReservationRow, eventId: string, now: number): D1PreparedStatement {
    const setClause = existing.resource_type === 'text_episode'
      ? 'text_reserved = text_reserved - 1, text_episodes = text_episodes + 1'
      : 'voice_reserved = voice_reserved - 1, voiced_episodes = voiced_episodes + 1';
    return this.db
      .prepare(
        `UPDATE daily_usage SET ${setClause}, updated_at = ?
         WHERE user_id = ? AND usage_date = ?
           AND EXISTS (
             SELECT 1 FROM quota_reservations
             WHERE id = ? AND status = 'consumed' AND last_event_id = ?
           )`,
      )
      .bind(now, existing.user_id, existing.utc_day, existing.id, eventId);
  }

  private releaseCounterStatement(existing: ReservationRow, eventId: string, now: number): D1PreparedStatement {
    const column = existing.resource_type === 'text_episode' ? 'text_reserved' : 'voice_reserved';
    return this.db
      .prepare(
        `UPDATE daily_usage SET ${column} = ${column} - 1, updated_at = ?
         WHERE user_id = ? AND usage_date = ?
           AND EXISTS (
             SELECT 1 FROM quota_reservations
             WHERE id = ? AND status = 'released' AND last_event_id = ?
           )`,
      )
      .bind(now, existing.user_id, existing.utc_day, existing.id, eventId);
  }

  private async resolveReserveReplay(existing: ReservationRow, input: QuotaReserveInput): Promise<QuotaResult> {
    if (existing.resource_type !== input.resourceType) return keyConflict();
    return { ok: true, value: await this.snapshot(existing, true) };
  }

  private async resolveTerminalRace(
    userId: string,
    reservationKey: string,
    desired: 'consumed' | 'released',
    resourceId: string | null,
    eventId?: string,
  ): Promise<QuotaResult> {
    const current = await this.loadReservation(userId, reservationKey);
    if (!current) return reservationNotFound();
    if (current.status === desired) {
      if (desired === 'consumed' && current.resource_id !== resourceId) return keyConflict();
      return { ok: true, value: await this.snapshot(current, current.last_event_id !== eventId) };
    }
    if (current.status !== 'reserved') return invalidTransition(current.status);
    return { ok: false, error: { code: 'persistence_error', message: 'Quota transition failed.' } };
  }

  private async snapshot(row: ReservationRow, replayed: boolean): Promise<QuotaReservationSnapshot> {
    return {
      reservationId: row.id,
      userId: row.user_id,
      reservationKey: row.reservation_key,
      utcDay: row.utc_day,
      resourceType: row.resource_type,
      status: row.status,
      resourceId: row.resource_id,
      replayed,
      daily: await this.loadDaily(row.user_id, row.utc_day),
    };
  }

  private async loadReservation(userId: string, reservationKey: string): Promise<ReservationRow | null> {
    return this.db
      .prepare(
        `SELECT id, user_id, reservation_key, utc_day, resource_type, status, resource_id, last_event_id
         FROM quota_reservations WHERE user_id = ? AND reservation_key = ?`,
      )
      .bind(userId, reservationKey)
      .first<ReservationRow>();
  }

  private async loadDaily(userId: string, utcDay: string): Promise<QuotaDailySnapshot> {
    const row = await this.db
      .prepare(
        `SELECT text_episodes, voiced_episodes, text_reserved, voice_reserved
         FROM daily_usage WHERE user_id = ? AND usage_date = ?`,
      )
      .bind(userId, utcDay)
      .first<DailyUsageRow>();
    return {
      userId,
      utcDay,
      textConsumed: row?.text_episodes ?? 0,
      voiceConsumed: row?.voiced_episodes ?? 0,
      textReserved: row?.text_reserved ?? 0,
      voiceReserved: row?.voice_reserved ?? 0,
    };
  }

  private async userExists(userId: string): Promise<boolean> {
    const row = await this.db.prepare('SELECT 1 AS found FROM users WHERE id = ?').bind(userId).first<{ found: number }>();
    return row?.found === 1;
  }
}

function utcDayFromMillis(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Server clock is invalid.');
  return new Date(value).toISOString().slice(0, 10);
}

function validateReserveInput(input: QuotaReserveInput): string | null {
  if (!input.userId.trim()) return 'User identifier is required.';
  if (!validReservationKey(input.reservationKey)) return 'Reservation key must be 8–128 non-padded characters.';
  if (input.resourceType !== 'text_episode' && input.resourceType !== 'voice_episode') return 'Quota resource is invalid.';
  if (input.tier !== 'free' && input.tier !== 'plus') return 'Quota tier is invalid.';
  return null;
}

function validateConsumeInput(input: QuotaConsumeInput): string | null {
  if (!input.userId.trim() || !input.resourceId.trim()) return 'User and resource identifiers are required.';
  if (!validReservationKey(input.reservationKey)) return 'Reservation key must be 8–128 non-padded characters.';
  return null;
}

function validateReleaseInput(input: QuotaReleaseInput): string | null {
  if (!input.userId.trim()) return 'User identifier is required.';
  if (!validReservationKey(input.reservationKey)) return 'Reservation key must be 8–128 non-padded characters.';
  return null;
}

function validReservationKey(value: string): boolean {
  return value === value.trim() && value.length >= 8 && value.length <= 128;
}

function invalidInput(message: string): QuotaResult {
  return { ok: false, error: { code: 'invalid_input', message } };
}

function reservationNotFound(): QuotaResult {
  return { ok: false, error: { code: 'not_found', message: 'Quota reservation not found.' } };
}

function keyConflict(): QuotaResult {
  return { ok: false, error: { code: 'key_conflict', message: 'Reservation key belongs to different logical work.' } };
}

function invalidTransition(status: QuotaReservationStatus): QuotaResult {
  return { ok: false, error: { code: 'invalid_transition', message: 'Quota reservation is already terminal.', status } };
}
