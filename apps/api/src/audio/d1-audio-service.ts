import { D1QuotaLedger } from '../quota/d1-quota-ledger';
import { NOOP_PRODUCT_TELEMETRY, type ProductTelemetrySink } from '../telemetry/product-events';
import { approvedVoice } from '../tts/voice-registry';
import type {
  AudioAssetStatus,
  AudioDeliveryAsset,
  AudioQueue,
  AudioRequestInput,
  AudioRequestResult,
  MediaAsset,
  MediaAssetStatus,
} from './contracts';

interface AudioAssetRow {
  id: string;
  episode_id: string;
  voice_variant: string;
  provider: string;
  provider_voice_id: string;
  language_code: string;
  reservation_key: string;
  object_key: string | null;
  status: AudioAssetStatus;
  input_characters: number;
  attempts: number;
  failure_code: string | null;
}

export class D1AudioService {
  constructor(
    private readonly db: D1Database,
    private readonly queue: AudioQueue,
    private readonly quota: D1QuotaLedger = new D1QuotaLedger(db),
    private readonly productTelemetry: ProductTelemetrySink = NOOP_PRODUCT_TELEMETRY,
  ) {}

  async request(input: AudioRequestInput): Promise<AudioRequestResult> {
    const invalid = validateInput(input);
    if (invalid) return { ok: false, error: { code: 'invalid_input', message: invalid } };

    const voice = approvedVoice(input.voiceVariant);
    if (!voice) return { ok: false, error: { code: 'invalid_input', message: 'Voice variant is not approved.' } };
    if (!(await this.ownsEpisode(input.userId, input.sceneId))) {
      return { ok: false, error: { code: 'not_found', message: 'Scene not found.' } };
    }

    const existing = await this.loadByEpisode(input.userId, input.sceneId, input.voiceVariant);
    if (existing && existing.status !== 'failed') return { ok: true, value: toMediaAsset(existing) };

    const assetId = existing?.id ?? crypto.randomUUID();
    try {
      if (existing) {
        await this.db
          .prepare(
            `UPDATE audio_assets
             SET reservation_key = ?, provider = 'gemini', provider_voice_id = ?, language_code = ?,
                 status = 'reserving', object_key = NULL, input_characters = 0, processing_token = NULL,
                 processing_started_at = NULL, failure_code = NULL, ready_at = NULL, updated_at = unixepoch() * 1000
             WHERE id = ? AND status = 'failed'`,
          )
          .bind(input.reservationKey, voice.providerVoiceId, voice.languageCode, existing.id)
          .run();
      } else {
        await this.db
          .prepare(
            `INSERT INTO audio_assets
               (id, episode_id, voice_variant, provider, provider_voice_id, language_code, reservation_key, status)
             SELECT ?, e.id, ?, 'gemini', ?, ?, ?, 'reserving'
             FROM episodes e
             JOIN plots p ON p.id = e.plot_id
             WHERE e.id = ? AND p.user_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM audio_assets a WHERE a.episode_id = e.id AND a.voice_variant = ?
               )`,
          )
          .bind(
            assetId,
            input.voiceVariant,
            voice.providerVoiceId,
            voice.languageCode,
            input.reservationKey,
            input.sceneId,
            input.userId,
            input.voiceVariant,
          )
          .run();
      }
    } catch {
      const raced = await this.loadByEpisode(input.userId, input.sceneId, input.voiceVariant);
      if (raced) return { ok: true, value: toMediaAsset(raced) };
      return { ok: false, error: { code: 'persistence_error', message: 'Audio asset claim failed.' } };
    }

    const canonical = await this.loadByEpisode(input.userId, input.sceneId, input.voiceVariant);
    if (!canonical) return { ok: false, error: { code: 'persistence_error', message: 'Audio asset claim failed.' } };
    if (canonical.id !== assetId || canonical.reservation_key !== input.reservationKey || canonical.status !== 'reserving') {
      return { ok: true, value: toMediaAsset(canonical) };
    }

    const reserved = await this.quota.reserve({
      userId: input.userId,
      reservationKey: input.reservationKey,
      resourceType: 'voice_episode',
      tier: input.tier,
    });
    if (!reserved.ok) {
      await this.markReservationFailure(canonical.id, input.reservationKey, reserved.error.code);
      if (reserved.error.code === 'quota_exceeded') {
        return {
          ok: false,
          error: {
            code: 'quota_exceeded',
            message: reserved.error.message,
            utcDay: reserved.error.utcDay,
            limit: reserved.error.limit,
          },
        };
      }
      return { ok: false, error: { code: 'persistence_error', message: 'Voice quota reservation failed.' } };
    }
    if (reserved.value.status !== 'reserved') {
      await this.markReservationFailure(canonical.id, input.reservationKey, 'reservation_key_terminal');
      return {
        ok: false,
        error: { code: 'invalid_input', message: 'Reservation key was already used by terminal quota work.' },
      };
    }

    await this.db
      .prepare(
        `UPDATE audio_assets
         SET status = 'queued', failure_code = NULL, updated_at = unixepoch() * 1000
         WHERE id = ? AND reservation_key = ? AND status = 'reserving'`,
      )
      .bind(canonical.id, input.reservationKey)
      .run();

    const queued = await this.loadByEpisode(input.userId, input.sceneId, input.voiceVariant);
    if (!queued || queued.status !== 'queued' || queued.reservation_key !== input.reservationKey) {
      await this.safeRelease(input.userId, input.reservationKey);
      return queued
        ? { ok: true, value: toMediaAsset(queued) }
        : { ok: false, error: { code: 'persistence_error', message: 'Audio asset queue transition failed.' } };
    }

    try {
      await this.queue.send({ assetId: queued.id });
    } catch {
      await this.markQueueFailure(queued.id, input.reservationKey);
      await this.safeRelease(input.userId, input.reservationKey);
      return { ok: false, error: { code: 'queue_unavailable', message: 'Voice generation could not be queued.' } };
    }

    try {
      this.productTelemetry.recordProductEvent({ event: 'voice_requested', tier: input.tier });
    } catch {
      // Product analytics is observational and cannot fail a queued voice request.
    }
    return { ok: true, value: toMediaAsset(queued) };
  }

  async getOwnedMediaAsset(userId: string, assetId: string): Promise<MediaAsset | null> {
    const row = await this.loadOwnedAsset(userId, assetId);
    return row ? toMediaAsset(row) : null;
  }

  async getOwnedDeliveryAsset(userId: string, assetId: string): Promise<AudioDeliveryAsset | null> {
    const row = await this.loadOwnedAsset(userId, assetId);
    return row
      ? { media: toMediaAsset(row), objectKey: row.object_key, persistenceStatus: row.status }
      : null;
  }

  private async loadOwnedAsset(userId: string, assetId: string): Promise<AudioAssetRow | null> {
    if (!userId.trim() || !assetId.trim()) return null;
    return this.db
      .prepare(
        `SELECT a.id, a.episode_id, a.voice_variant, a.provider, a.provider_voice_id, a.language_code,
                a.reservation_key, a.object_key, a.status, a.input_characters, a.attempts, a.failure_code
         FROM audio_assets a
         JOIN episodes e ON e.id = a.episode_id
         JOIN plots p ON p.id = e.plot_id
         WHERE a.id = ? AND p.user_id = ?`,
      )
      .bind(assetId, userId)
      .first<AudioAssetRow>();
  }

  private async loadByEpisode(userId: string, episodeId: string, voiceVariant: string): Promise<AudioAssetRow | null> {
    return this.db
      .prepare(
        `SELECT a.id, a.episode_id, a.voice_variant, a.provider, a.provider_voice_id, a.language_code,
                a.reservation_key, a.object_key, a.status, a.input_characters, a.attempts, a.failure_code
         FROM audio_assets a
         JOIN episodes e ON e.id = a.episode_id
         JOIN plots p ON p.id = e.plot_id
         WHERE a.episode_id = ? AND a.voice_variant = ? AND p.user_id = ?`,
      )
      .bind(episodeId, voiceVariant, userId)
      .first<AudioAssetRow>();
  }

  private async ownsEpisode(userId: string, episodeId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT 1 AS found FROM episodes e
         JOIN plots p ON p.id = e.plot_id
         WHERE e.id = ? AND p.user_id = ?`,
      )
      .bind(episodeId, userId)
      .first<{ found: number }>();
    return row?.found === 1;
  }

  private async markReservationFailure(assetId: string, reservationKey: string, code: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE audio_assets
         SET status = 'failed', failure_code = ?, updated_at = unixepoch() * 1000
         WHERE id = ? AND reservation_key = ? AND status = 'reserving'`,
      )
      .bind(code, assetId, reservationKey)
      .run();
  }

  private async markQueueFailure(assetId: string, reservationKey: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE audio_assets
         SET status = 'failed', failure_code = 'queue_unavailable', updated_at = unixepoch() * 1000
         WHERE id = ? AND reservation_key = ? AND status = 'queued'`,
      )
      .bind(assetId, reservationKey)
      .run();
  }

  private async safeRelease(userId: string, reservationKey: string): Promise<void> {
    try {
      await this.quota.release({ userId, reservationKey });
    } catch {
      // Reconciliation exposes any unexpected held reservation.
    }
  }
}

function toMediaAsset(row: AudioAssetRow): MediaAsset {
  return {
    id: row.id,
    sceneId: row.episode_id,
    kind: 'voice',
    variant: row.voice_variant,
    status: toMediaStatus(row.status),
    attempts: row.attempts,
    failureCode: row.failure_code,
    cached: row.status === 'ready',
  };
}

function toMediaStatus(status: AudioAssetStatus): MediaAssetStatus {
  if (status === 'reserving' || status === 'queued') return 'queued';
  if (status === 'processing' || status === 'staged') return 'processing';
  return status;
}

function validateInput(input: AudioRequestInput): string | null {
  if (!input.userId.trim() || !input.sceneId.trim()) return 'User and scene identifiers are required.';
  if (input.reservationKey !== input.reservationKey.trim() || input.reservationKey.length < 8 || input.reservationKey.length > 128) {
    return 'Reservation key must be 8–128 non-padded characters.';
  }
  if (input.tier !== 'free' && input.tier !== 'plus') return 'Quota tier is invalid.';
  return null;
}
