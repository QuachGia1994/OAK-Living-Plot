export type QuotaTier = 'free' | 'plus';
export type QuotaResource = 'text_episode' | 'voice_episode';
export type QuotaReservationStatus = 'reserved' | 'released' | 'consumed';

export interface QuotaPolicy {
  legacyTextDisplayLimit: number;
  voiceEpisodesPerUtcDay: number;
}

export interface QuotaReserveInput {
  userId: string;
  reservationKey: string;
  resourceType: QuotaResource;
  tier: QuotaTier;
}

export interface QuotaConsumeInput {
  userId: string;
  reservationKey: string;
  resourceId: string;
}

export interface QuotaReleaseInput {
  userId: string;
  reservationKey: string;
}

export interface QuotaDailySnapshot {
  userId: string;
  utcDay: string;
  textConsumed: number;
  voiceConsumed: number;
  textReserved: number;
  voiceReserved: number;
}

export interface QuotaReservationSnapshot {
  reservationId: string;
  userId: string;
  reservationKey: string;
  utcDay: string;
  resourceType: QuotaResource;
  status: QuotaReservationStatus;
  resourceId: string | null;
  replayed: boolean;
  daily: QuotaDailySnapshot;
}

export type QuotaError =
  | { code: 'invalid_input'; message: string }
  | { code: 'not_found'; message: string }
  | { code: 'quota_exceeded'; message: string; resourceType: QuotaResource; limit: number; utcDay: string }
  | { code: 'key_conflict'; message: string }
  | { code: 'invalid_transition'; message: string; status: QuotaReservationStatus }
  | { code: 'persistence_error'; message: string };

export type QuotaResult =
  | { ok: true; value: QuotaReservationSnapshot }
  | { ok: false; error: QuotaError };

export interface QuotaReconciliation {
  daily: QuotaDailySnapshot;
  ledger: {
    textConsumed: number;
    voiceConsumed: number;
    textReserved: number;
    voiceReserved: number;
  };
  reconciled: boolean;
}
