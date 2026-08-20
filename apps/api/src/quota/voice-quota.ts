import { D1QuotaLedger } from './d1-quota-ledger';
import type { QuotaError, QuotaTier } from './contracts';
import type { QuotaMode } from './policy';
import { D1VoiceBonusLedger } from '../referrals/d1-voice-bonus-ledger';

export type VoiceQuotaSource = 'daily' | 'referral_bonus';

export type VoiceQuotaResult =
  | { ok: true; value: { source: VoiceQuotaSource; status: 'reserved' | 'released' | 'consumed'; replayed: boolean } }
  | { ok: false; error: VoiceQuotaError };

export type VoiceQuotaError =
  | { code: 'quota_exceeded'; message: string; limit: number; utcDay: string }
  | { code: 'not_found'; message: string }
  | { code: 'invalid_transition'; message: string }
  | { code: 'persistence_error'; message: string };

export interface VoiceQuota {
  reserve(input: { userId: string; reservationKey: string; tier: QuotaTier }): Promise<VoiceQuotaResult>;
  consume(input: { userId: string; reservationKey: string; resourceId: string }): Promise<VoiceQuotaResult>;
  release(input: { userId: string; reservationKey: string }): Promise<VoiceQuotaResult>;
  status(userId: string, reservationKey: string): Promise<'reserved' | 'released' | 'consumed' | null>;
}

export class D1VoiceQuota implements VoiceQuota {
  private readonly daily: D1QuotaLedger;
  private readonly bonus: D1VoiceBonusLedger;

  constructor(
    private readonly db: D1Database,
    clock: () => number = Date.now,
    quotaMode: QuotaMode = 'enforced',
  ) {
    this.daily = new D1QuotaLedger(db, clock, quotaMode);
    this.bonus = new D1VoiceBonusLedger(db, clock);
  }

  async reserve(input: { userId: string; reservationKey: string; tier: QuotaTier }): Promise<VoiceQuotaResult> {
    const bonusStatus = await this.bonus.status(input.userId, input.reservationKey);
    if (bonusStatus === 'reserved' || bonusStatus === 'consumed') {
      const replay = await this.bonus.reserve(input.userId, input.reservationKey);
      return replay.ok
        ? { ok: true, value: { source: 'referral_bonus', status: replay.value.status, replayed: true } }
        : { ok: false, error: { code: 'persistence_error', message: replay.error.message } };
    }

    const daily = await this.daily.reserve({
      userId: input.userId,
      reservationKey: input.reservationKey,
      resourceType: 'voice_episode',
      tier: input.tier,
    });
    if (daily.ok) return { ok: true, value: { source: 'daily', status: daily.value.status, replayed: daily.value.replayed } };
    if (daily.error.code !== 'quota_exceeded') return mapDailyError(daily.error);

    const bonus = await this.bonus.reserve(input.userId, input.reservationKey);
    if (bonus.ok) return { ok: true, value: { source: 'referral_bonus', status: bonus.value.status, replayed: bonus.value.replayed } };
    if (bonus.error.code === 'no_bonus_credit') {
      return {
        ok: false,
        error: {
          code: 'quota_exceeded',
          message: daily.error.message,
          limit: daily.error.limit,
          utcDay: daily.error.utcDay,
        },
      };
    }
    return { ok: false, error: { code: 'persistence_error', message: bonus.error.message } };
  }

  async consume(input: { userId: string; reservationKey: string; resourceId: string }): Promise<VoiceQuotaResult> {
    const [dailyStatus, bonusStatus] = await Promise.all([
      this.dailyStatus(input.userId, input.reservationKey),
      this.bonus.status(input.userId, input.reservationKey),
    ]);
    if (bonusStatus && (dailyStatus === null || dailyStatus === 'released')) {
      return mapBonusResult(await this.bonus.consume(input.userId, input.reservationKey, input.resourceId));
    }

    const daily = await this.daily.consume(input);
    if (daily.ok) return { ok: true, value: { source: 'daily', status: daily.value.status, replayed: daily.value.replayed } };
    if (daily.error.code !== 'not_found') return mapDailyError(daily.error);
    return mapBonusResult(await this.bonus.consume(input.userId, input.reservationKey, input.resourceId));
  }

  async release(input: { userId: string; reservationKey: string }): Promise<VoiceQuotaResult> {
    const [dailyStatus, bonusStatus] = await Promise.all([
      this.dailyStatus(input.userId, input.reservationKey),
      this.bonus.status(input.userId, input.reservationKey),
    ]);
    if (bonusStatus && (dailyStatus === null || dailyStatus === 'released')) {
      return mapBonusResult(await this.bonus.release(input.userId, input.reservationKey));
    }

    const daily = await this.daily.release(input);
    if (daily.ok) return { ok: true, value: { source: 'daily', status: daily.value.status, replayed: daily.value.replayed } };
    if (daily.error.code !== 'not_found') return mapDailyError(daily.error);
    return mapBonusResult(await this.bonus.release(input.userId, input.reservationKey));
  }

  async status(userId: string, reservationKey: string): Promise<'reserved' | 'released' | 'consumed' | null> {
    const [dailyStatus, bonusStatus] = await Promise.all([
      this.dailyStatus(userId, reservationKey),
      this.bonus.status(userId, reservationKey),
    ]);
    if (bonusStatus && (dailyStatus === null || dailyStatus === 'released')) return bonusStatus;
    return dailyStatus ?? bonusStatus;
  }

  private async dailyStatus(userId: string, reservationKey: string): Promise<'reserved' | 'released' | 'consumed' | null> {
    const row = await this.db
      .prepare('SELECT status FROM quota_reservations WHERE user_id = ? AND reservation_key = ?')
      .bind(userId, reservationKey)
      .first<{ status: 'reserved' | 'released' | 'consumed' }>();
    return row?.status ?? null;
  }
}

function mapBonusResult(result: Awaited<ReturnType<D1VoiceBonusLedger['consume']>>): VoiceQuotaResult {
  if (result.ok) {
    return { ok: true, value: { source: 'referral_bonus', status: result.value.status, replayed: result.value.replayed } };
  }
  if (result.error.code === 'not_found') return { ok: false, error: { code: 'not_found', message: result.error.message } };
  if (result.error.code === 'invalid_transition') return { ok: false, error: { code: 'invalid_transition', message: result.error.message } };
  return { ok: false, error: { code: 'persistence_error', message: result.error.message } };
}

function mapDailyError(error: QuotaError): VoiceQuotaResult {
  if (error.code === 'quota_exceeded') {
    return { ok: false, error: { code: 'quota_exceeded', message: error.message, limit: error.limit, utcDay: error.utcDay } };
  }
  if (error.code === 'not_found') return { ok: false, error: { code: 'not_found', message: error.message } };
  if (error.code === 'invalid_transition') return { ok: false, error: { code: 'invalid_transition', message: error.message } };
  return { ok: false, error: { code: 'persistence_error', message: error.message } };
}
