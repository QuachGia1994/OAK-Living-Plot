export const REFERRAL_VOICE_BONUS_CREDITS = 50;

export interface ReferralSnapshot {
  code: string;
  claimedCode: string | null;
  bonusVoiceCredits: number;
  successfulReferrals: number;
}

export type ReferralClaimResult =
  | { ok: true; value: ReferralSnapshot; replayed: boolean }
  | { ok: false; error: { code: 'invalid_input' | 'not_found' | 'self_referral' | 'already_claimed' | 'persistence_error'; message: string } };

export type ReferralRewardResult =
  | { ok: true; value: { rewarded: boolean; inviterUserId: string | null; creditsGranted: number } }
  | { ok: false; error: { code: 'persistence_error'; message: string } };

export type BonusReservationStatus = 'reserved' | 'released' | 'consumed';

export interface BonusReservationSnapshot {
  userId: string;
  reservationKey: string;
  status: BonusReservationStatus;
  resourceId: string | null;
  availableCredits: number;
  replayed: boolean;
}

export type BonusReservationResult =
  | { ok: true; value: BonusReservationSnapshot }
  | { ok: false; error: { code: 'no_bonus_credit' | 'not_found' | 'key_conflict' | 'invalid_transition' | 'persistence_error'; message: string } };
