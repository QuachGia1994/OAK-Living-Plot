import { REFERRAL_VOICE_BONUS_CREDITS, type ReferralClaimResult, type ReferralRewardResult, type ReferralSnapshot } from './contracts';

type Clock = () => number;

interface ClaimRow {
  inviter_user_id: string;
  code: string;
  claimed_at: number;
  reward_granted_at: number | null;
}

interface CountRow { count: number }
interface BalanceRow { available_credits: number }

export class D1ReferralService {
  constructor(
    private readonly db: D1Database,
    private readonly clock: Clock = Date.now,
  ) {}

  async snapshot(userId: string): Promise<ReferralSnapshot> {
    const code = await this.getOrCreateCode(userId);
    const claim = await this.db
      .prepare('SELECT code FROM referral_claims WHERE referred_user_id = ?')
      .bind(userId)
      .first<{ code: string }>();
    const balance = await this.db
      .prepare('SELECT available_credits FROM voice_bonus_accounts WHERE user_id = ?')
      .bind(userId)
      .first<BalanceRow>();
    const successes = await this.db
      .prepare('SELECT COUNT(*) AS count FROM referral_claims WHERE inviter_user_id = ? AND reward_granted_at IS NOT NULL')
      .bind(userId)
      .first<CountRow>();
    return {
      code,
      claimedCode: claim?.code ?? null,
      bonusVoiceCredits: balance?.available_credits ?? 0,
      successfulReferrals: successes?.count ?? 0,
    };
  }

  async claim(referredUserId: string, rawCode: string): Promise<ReferralClaimResult> {
    const code = normalizeCode(rawCode);
    if (!referredUserId.trim() || !code) {
      return { ok: false, error: { code: 'invalid_input', message: 'Referral code is invalid.' } };
    }
    const inviter = await this.db
      .prepare('SELECT user_id FROM referral_codes WHERE code = ?')
      .bind(code)
      .first<{ user_id: string }>();
    if (!inviter) return { ok: false, error: { code: 'not_found', message: 'Referral code was not found.' } };
    if (inviter.user_id === referredUserId) {
      return { ok: false, error: { code: 'self_referral', message: 'A user cannot claim their own referral code.' } };
    }

    const existing = await this.db
      .prepare('SELECT inviter_user_id, code, claimed_at, reward_granted_at FROM referral_claims WHERE referred_user_id = ?')
      .bind(referredUserId)
      .first<ClaimRow>();
    if (existing) {
      if (existing.inviter_user_id === inviter.user_id && existing.code === code) {
        return { ok: true, value: await this.snapshot(referredUserId), replayed: true };
      }
      return { ok: false, error: { code: 'already_claimed', message: 'This account already has a referral claim.' } };
    }

    try {
      await this.db
        .prepare(
          `INSERT INTO referral_claims (referred_user_id, inviter_user_id, code, claimed_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(referredUserId, inviter.user_id, code, this.clock())
        .run();
    } catch {
      const raced = await this.db
        .prepare('SELECT inviter_user_id, code FROM referral_claims WHERE referred_user_id = ?')
        .bind(referredUserId)
        .first<{ inviter_user_id: string; code: string }>();
      if (raced?.inviter_user_id === inviter.user_id && raced.code === code) {
        return { ok: true, value: await this.snapshot(referredUserId), replayed: true };
      }
      return { ok: false, error: { code: 'persistence_error', message: 'Referral claim could not be stored.' } };
    }
    return { ok: true, value: await this.snapshot(referredUserId), replayed: false };
  }

  async grantForPlusActivation(referredUserId: string, eventId: string, plusActivatedAt: number): Promise<ReferralRewardResult> {
    if (!referredUserId.trim() || !eventId.trim() || !Number.isFinite(plusActivatedAt) || plusActivatedAt < 0) {
      return { ok: false, error: { code: 'persistence_error', message: 'Referral reward input is invalid.' } };
    }
    const claim = await this.db
      .prepare(
        `SELECT inviter_user_id, code, claimed_at, reward_granted_at
         FROM referral_claims WHERE referred_user_id = ?`,
      )
      .bind(referredUserId)
      .first<ClaimRow>();
    if (!claim) return { ok: true, value: { rewarded: false, inviterUserId: null, creditsGranted: 0 } };
    if (claim.claimed_at > plusActivatedAt) {
      return { ok: true, value: { rewarded: false, inviterUserId: claim.inviter_user_id, creditsGranted: 0 } };
    }
    if (claim.reward_granted_at !== null) {
      return { ok: true, value: { rewarded: false, inviterUserId: claim.inviter_user_id, creditsGranted: 0 } };
    }

    const now = this.clock();
    const attemptId = crypto.randomUUID();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT OR IGNORE INTO voice_bonus_grants
               (event_id, attempt_id, referred_user_id, inviter_user_id, credits, plus_activated_at, created_at)
             SELECT ?, ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM referral_claims
               WHERE referred_user_id = ? AND inviter_user_id = ? AND reward_granted_at IS NULL AND claimed_at <= ?
             )`,
          )
          .bind(
            eventId, attemptId, referredUserId, claim.inviter_user_id, REFERRAL_VOICE_BONUS_CREDITS, plusActivatedAt, now,
            referredUserId, claim.inviter_user_id, plusActivatedAt,
          ),
        this.db
          .prepare('INSERT OR IGNORE INTO voice_bonus_accounts (user_id) VALUES (?)')
          .bind(claim.inviter_user_id),
        this.db
          .prepare(
            `UPDATE voice_bonus_accounts
             SET available_credits = available_credits + ?, earned_credits = earned_credits + ?, updated_at = ?
             WHERE user_id = ?
               AND EXISTS (
                 SELECT 1 FROM voice_bonus_grants
                 WHERE event_id = ? AND attempt_id = ? AND applied_at IS NULL
               )`,
          )
          .bind(REFERRAL_VOICE_BONUS_CREDITS, REFERRAL_VOICE_BONUS_CREDITS, now, claim.inviter_user_id, eventId, attemptId),
        this.db
          .prepare('UPDATE voice_bonus_grants SET applied_at = ? WHERE event_id = ? AND attempt_id = ? AND applied_at IS NULL')
          .bind(now, eventId, attemptId),
        this.db
          .prepare(
            `UPDATE referral_claims
             SET plus_activated_at = ?, reward_event_id = ?, reward_granted_at = ?
             WHERE referred_user_id = ? AND inviter_user_id = ? AND reward_granted_at IS NULL
               AND EXISTS (
                 SELECT 1 FROM voice_bonus_grants
                 WHERE event_id = ? AND attempt_id = ? AND applied_at IS NOT NULL
               )`,
          )
          .bind(plusActivatedAt, eventId, now, referredUserId, claim.inviter_user_id, eventId, attemptId),
      ]);
    } catch {
      const current = await this.db
        .prepare('SELECT reward_granted_at FROM referral_claims WHERE referred_user_id = ?')
        .bind(referredUserId)
        .first<{ reward_granted_at: number | null }>();
      if (current?.reward_granted_at !== null) {
        return { ok: true, value: { rewarded: false, inviterUserId: claim.inviter_user_id, creditsGranted: 0 } };
      }
      return { ok: false, error: { code: 'persistence_error', message: 'Referral reward could not be granted.' } };
    }
    const grant = await this.db
      .prepare('SELECT attempt_id, applied_at FROM voice_bonus_grants WHERE event_id = ?')
      .bind(eventId)
      .first<{ attempt_id: string; applied_at: number | null }>();
    const rewarded = grant?.attempt_id === attemptId && grant.applied_at !== null;
    return {
      ok: true,
      value: {
        rewarded,
        inviterUserId: claim.inviter_user_id,
        creditsGranted: rewarded ? REFERRAL_VOICE_BONUS_CREDITS : 0,
      },
    };
  }

  private async getOrCreateCode(userId: string): Promise<string> {
    const existing = await this.db
      .prepare('SELECT code FROM referral_codes WHERE user_id = ?')
      .bind(userId)
      .first<{ code: string }>();
    if (existing) return existing.code;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = randomReferralCode();
      try {
        await this.db
          .prepare('INSERT INTO referral_codes (user_id, code, created_at) VALUES (?, ?, ?)')
          .bind(userId, code, this.clock())
          .run();
        return code;
      } catch {
        const raced = await this.db
          .prepare('SELECT code FROM referral_codes WHERE user_id = ?')
          .bind(userId)
          .first<{ code: string }>();
        if (raced) return raced.code;
      }
    }
    throw new Error('Referral code could not be allocated.');
  }
}

function normalizeCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{8,24}$/u.test(normalized) ? normalized : null;
}

function randomReferralCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}
