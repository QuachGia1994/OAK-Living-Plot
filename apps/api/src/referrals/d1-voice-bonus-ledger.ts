import type { BonusReservationResult, BonusReservationSnapshot, BonusReservationStatus } from './contracts';

interface ReservationRow {
  id: string;
  user_id: string;
  reservation_key: string;
  status: BonusReservationStatus;
  resource_id: string | null;
  last_event_id: string;
}

interface BalanceRow { available_credits: number }

type Clock = () => number;

export class D1VoiceBonusLedger {
  constructor(
    private readonly db: D1Database,
    private readonly clock: Clock = Date.now,
  ) {}

  async reserve(userId: string, reservationKey: string): Promise<BonusReservationResult> {
    if (!validInput(userId, reservationKey)) return persistence('Bonus reservation input is invalid.');
    const existing = await this.load(userId, reservationKey);
    if (existing) {
      if (existing.status === 'released') return this.reactivate(existing);
      return { ok: true, value: await this.snapshot(existing, true) };
    }

    const id = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const now = this.clock();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO voice_bonus_reservations
               (id, user_id, reservation_key, status, last_event_id, created_at, updated_at)
             SELECT ?, ?, ?, 'reserved', ?, ?, ?
             FROM voice_bonus_accounts
             WHERE user_id = ? AND available_credits > 0
               AND NOT EXISTS (
                 SELECT 1 FROM voice_bonus_reservations WHERE user_id = ? AND reservation_key = ?
               )`,
          )
          .bind(id, userId, reservationKey, eventId, now, now, userId, userId, reservationKey),
        this.db
          .prepare(
            `UPDATE voice_bonus_accounts
             SET available_credits = available_credits - 1, updated_at = ?
             WHERE user_id = ?
               AND EXISTS (
                 SELECT 1 FROM voice_bonus_reservations
                 WHERE id = ? AND user_id = ? AND reservation_key = ?
                   AND status = 'reserved' AND last_event_id = ?
               )`,
          )
          .bind(now, userId, id, userId, reservationKey, eventId),
      ]);
    } catch {
      const raced = await this.load(userId, reservationKey);
      return raced ? { ok: true, value: await this.snapshot(raced, true) } : persistence('Bonus reservation failed.');
    }
    const current = await this.load(userId, reservationKey);
    return current
      ? { ok: true, value: await this.snapshot(current, current.last_event_id !== eventId) }
      : { ok: false, error: { code: 'no_bonus_credit', message: 'No referral voice credit is available.' } };
  }

  async consume(userId: string, reservationKey: string, resourceId: string): Promise<BonusReservationResult> {
    if (!validInput(userId, reservationKey) || !resourceId.trim()) return persistence('Bonus consumption input is invalid.');
    const existing = await this.load(userId, reservationKey);
    if (!existing) return { ok: false, error: { code: 'not_found', message: 'Bonus reservation not found.' } };
    if (existing.status === 'consumed') {
      if (existing.resource_id !== resourceId) return keyConflict();
      return { ok: true, value: await this.snapshot(existing, true) };
    }
    if (existing.status !== 'reserved') return invalidTransition();

    const eventId = crypto.randomUUID();
    const now = this.clock();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE voice_bonus_reservations
             SET status = 'consumed', resource_id = ?, last_event_id = ?, updated_at = ?
             WHERE id = ? AND status = 'reserved'`,
          )
          .bind(resourceId, eventId, now, existing.id),
        this.db
          .prepare(
            `UPDATE voice_bonus_accounts
             SET spent_credits = spent_credits + 1, updated_at = ?
             WHERE user_id = ?
               AND EXISTS (
                 SELECT 1 FROM voice_bonus_reservations
                 WHERE id = ? AND status = 'consumed' AND resource_id = ? AND last_event_id = ?
               )`,
          )
          .bind(now, userId, existing.id, resourceId, eventId),
      ]);
    } catch {
      return this.resolveTerminal(userId, reservationKey, 'consumed', resourceId, eventId);
    }
    return this.resolveTerminal(userId, reservationKey, 'consumed', resourceId, eventId);
  }

  async release(userId: string, reservationKey: string): Promise<BonusReservationResult> {
    if (!validInput(userId, reservationKey)) return persistence('Bonus release input is invalid.');
    const existing = await this.load(userId, reservationKey);
    if (!existing) return { ok: false, error: { code: 'not_found', message: 'Bonus reservation not found.' } };
    if (existing.status === 'released') return { ok: true, value: await this.snapshot(existing, true) };
    if (existing.status !== 'reserved') return invalidTransition();

    const eventId = crypto.randomUUID();
    const now = this.clock();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE voice_bonus_reservations
             SET status = 'released', last_event_id = ?, updated_at = ?
             WHERE id = ? AND status = 'reserved'`,
          )
          .bind(eventId, now, existing.id),
        this.db
          .prepare(
            `UPDATE voice_bonus_accounts
             SET available_credits = available_credits + 1, updated_at = ?
             WHERE user_id = ?
               AND EXISTS (
                 SELECT 1 FROM voice_bonus_reservations
                 WHERE id = ? AND status = 'released' AND last_event_id = ?
               )`,
          )
          .bind(now, userId, existing.id, eventId),
      ]);
    } catch {
      return this.resolveTerminal(userId, reservationKey, 'released', null, eventId);
    }
    return this.resolveTerminal(userId, reservationKey, 'released', null, eventId);
  }

  async status(userId: string, reservationKey: string): Promise<BonusReservationStatus | null> {
    return (await this.load(userId, reservationKey))?.status ?? null;
  }

  async balance(userId: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT available_credits FROM voice_bonus_accounts WHERE user_id = ?')
      .bind(userId)
      .first<BalanceRow>();
    return row?.available_credits ?? 0;
  }

  private async reactivate(existing: ReservationRow): Promise<BonusReservationResult> {
    const eventId = crypto.randomUUID();
    const now = this.clock();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE voice_bonus_reservations
             SET status = 'reserved', resource_id = NULL, last_event_id = ?, updated_at = ?
             WHERE id = ? AND status = 'released'
               AND EXISTS (
                 SELECT 1 FROM voice_bonus_accounts WHERE user_id = ? AND available_credits > 0
               )`,
          )
          .bind(eventId, now, existing.id, existing.user_id),
        this.db
          .prepare(
            `UPDATE voice_bonus_accounts
             SET available_credits = available_credits - 1, updated_at = ?
             WHERE user_id = ?
               AND EXISTS (
                 SELECT 1 FROM voice_bonus_reservations
                 WHERE id = ? AND status = 'reserved' AND last_event_id = ?
               )`,
          )
          .bind(now, existing.user_id, existing.id, eventId),
      ]);
    } catch {
      const current = await this.load(existing.user_id, existing.reservation_key);
      if (current?.status === 'reserved') return { ok: true, value: await this.snapshot(current, true) };
      return persistence('Bonus retry reservation failed.');
    }
    const current = await this.load(existing.user_id, existing.reservation_key);
    if (current?.status === 'reserved') {
      return { ok: true, value: await this.snapshot(current, current.last_event_id !== eventId) };
    }
    return { ok: false, error: { code: 'no_bonus_credit', message: 'No referral voice credit is available.' } };
  }

  private async resolveTerminal(
    userId: string,
    reservationKey: string,
    desired: 'consumed' | 'released',
    resourceId: string | null,
    eventId: string,
  ): Promise<BonusReservationResult> {
    const current = await this.load(userId, reservationKey);
    if (!current) return { ok: false, error: { code: 'not_found', message: 'Bonus reservation not found.' } };
    if (current.status === desired) {
      if (desired === 'consumed' && current.resource_id !== resourceId) return keyConflict();
      return { ok: true, value: await this.snapshot(current, current.last_event_id !== eventId) };
    }
    if (current.status !== 'reserved') return invalidTransition();
    return persistence('Bonus quota transition failed.');
  }

  private async snapshot(row: ReservationRow, replayed: boolean): Promise<BonusReservationSnapshot> {
    return {
      userId: row.user_id,
      reservationKey: row.reservation_key,
      status: row.status,
      resourceId: row.resource_id,
      availableCredits: await this.balance(row.user_id),
      replayed,
    };
  }

  private async load(userId: string, reservationKey: string): Promise<ReservationRow | null> {
    return this.db
      .prepare(
        `SELECT id, user_id, reservation_key, status, resource_id, last_event_id
         FROM voice_bonus_reservations WHERE user_id = ? AND reservation_key = ?`,
      )
      .bind(userId, reservationKey)
      .first<ReservationRow>();
  }
}

function validInput(userId: string, reservationKey: string): boolean {
  return Boolean(userId.trim()) && reservationKey === reservationKey.trim() && reservationKey.length >= 8 && reservationKey.length <= 128;
}

function invalidTransition(): BonusReservationResult {
  return { ok: false, error: { code: 'invalid_transition', message: 'Bonus reservation is already terminal.' } };
}

function keyConflict(): BonusReservationResult {
  return { ok: false, error: { code: 'key_conflict', message: 'Bonus reservation belongs to different work.' } };
}

function persistence(message: string): BonusReservationResult {
  return { ok: false, error: { code: 'persistence_error', message } };
}
