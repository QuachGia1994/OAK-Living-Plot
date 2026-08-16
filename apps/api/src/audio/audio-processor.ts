import { D1QuotaLedger } from '../quota/d1-quota-ledger';
import type { SpeechSynthesizer } from '../tts/contracts';
import type { AudioJob, AudioProcessResult, AudioAssetStatus } from './contracts';

const PROCESSING_LEASE_MILLIS = 120_000;
const RETRY_DELAY_SECONDS = 30;

type Clock = () => number;

interface WorkRow {
  id: string;
  episode_id: string;
  user_id: string;
  voice_variant: string;
  provider_voice_id: string;
  language_code: string;
  reservation_key: string;
  object_key: string | null;
  status: AudioAssetStatus;
  processing_token: string | null;
  processing_started_at: number | null;
  script_json: string;
}

interface StoredEpisodeContent {
  script?: unknown;
}

export class AudioProcessor {
  constructor(
    private readonly db: D1Database,
    private readonly bucket: R2Bucket,
    private readonly synthesizer: SpeechSynthesizer,
    private readonly quota: D1QuotaLedger = new D1QuotaLedger(db),
    private readonly clock: Clock = Date.now,
  ) {}

  async process(job: AudioJob): Promise<AudioProcessResult> {
    if (!validJob(job)) return { action: 'ack', assetId: '' };

    let work = await this.loadWork(job.assetId);
    if (!work || work.status === 'ready' || work.status === 'failed') return { action: 'ack', assetId: job.assetId };
    if (work.status === 'staged') return this.finalizeStaged(work);

    const now = this.clock();
    if (work.status === 'processing' && work.processing_started_at !== null && work.processing_started_at > now - PROCESSING_LEASE_MILLIS) {
      return retry(job.assetId);
    }

    const token = crypto.randomUUID();
    await this.db
      .prepare(
        `UPDATE audio_assets
         SET status = 'processing', processing_token = ?, processing_started_at = ?, attempts = attempts + 1,
             failure_code = NULL, updated_at = ?
         WHERE id = ? AND (
           status = 'queued' OR (status = 'processing' AND processing_started_at <= ?)
         )`,
      )
      .bind(token, now, now, job.assetId, now - PROCESSING_LEASE_MILLIS)
      .run();

    work = await this.loadWork(job.assetId);
    if (!work || work.status === 'ready' || work.status === 'failed') return { action: 'ack', assetId: job.assetId };
    if (work.status === 'staged') return this.finalizeStaged(work);
    if (work.status !== 'processing' || work.processing_token !== token) return retry(job.assetId);

    const script = parseScript(work.script_json);
    if (!script) return this.failTerminal(work, token, 'invalid_episode_text');

    const speech = await this.synthesizer.synthesize({
      text: script,
      languageCode: work.language_code,
      voiceName: work.provider_voice_id,
    });
    if (!speech.ok) {
      if (speech.error.retryable) {
        await this.resetForRetry(work.id, token, speech.error.code);
        return retry(work.id);
      }
      return this.failTerminal(work, token, speech.error.code);
    }

    const objectKey = `audio/${work.episode_id}/${work.voice_variant}.mp3`;
    try {
      await this.bucket.put(objectKey, speech.value.bytes, {
        httpMetadata: { contentType: speech.value.contentType },
      });
    } catch {
      await this.resetForRetry(work.id, token, 'r2_write_failed');
      return retry(work.id);
    }

    await this.db
      .prepare(
        `UPDATE audio_assets
         SET status = 'staged', object_key = ?, input_characters = ?, processing_token = NULL,
             processing_started_at = NULL, failure_code = NULL, updated_at = ?
         WHERE id = ? AND status = 'processing' AND processing_token = ?`,
      )
      .bind(objectKey, speech.value.inputCharacters, this.clock(), work.id, token)
      .run();

    const staged = await this.loadWork(work.id);
    if (!staged) return retry(work.id);
    if (staged.status === 'ready') return { action: 'ack', assetId: work.id };
    if (staged.status !== 'staged') return retry(work.id);
    return this.finalizeStaged(staged);
  }

  async failDeadLetter(job: AudioJob): Promise<AudioProcessResult> {
    if (!validJob(job)) return { action: 'ack', assetId: '' };
    const work = await this.loadWork(job.assetId);
    if (!work || work.status === 'ready' || work.status === 'failed') return { action: 'ack', assetId: job.assetId };
    if (work.status === 'staged') {
      const finalized = await this.finalizeStaged(work);
      if (finalized.action === 'ack') return finalized;

      const quotaStatus = await this.loadQuotaStatus(work.user_id, work.reservation_key);
      if (quotaStatus === 'consumed') {
        await this.db
          .prepare(
            `UPDATE audio_assets SET status = 'ready', ready_at = ?, failure_code = NULL, updated_at = ?
             WHERE id = ? AND status = 'staged' AND object_key IS NOT NULL`,
          )
          .bind(this.clock(), this.clock(), work.id)
          .run();
        return { action: 'ack', assetId: work.id };
      }
      if (work.object_key) await this.safeDelete(work.object_key);
      if (quotaStatus === 'reserved') {
        await this.quota.release({ userId: work.user_id, reservationKey: work.reservation_key });
      }
      await this.db
        .prepare(
          `UPDATE audio_assets
           SET status = 'failed', object_key = NULL, failure_code = 'retry_exhausted', updated_at = ?
           WHERE id = ? AND status = 'staged'`,
        )
        .bind(this.clock(), work.id)
        .run();
      return { action: 'ack', assetId: work.id };
    }

    await this.db
      .prepare(
        `UPDATE audio_assets
         SET status = 'failed', failure_code = 'retry_exhausted', processing_token = NULL,
             processing_started_at = NULL, updated_at = ?
         WHERE id = ? AND status != 'ready'`,
      )
      .bind(this.clock(), work.id)
      .run();
    await this.quota.release({ userId: work.user_id, reservationKey: work.reservation_key });
    return { action: 'ack', assetId: work.id };
  }

  private async finalizeStaged(work: WorkRow): Promise<AudioProcessResult> {
    const consumed = await this.quota.consume({
      userId: work.user_id,
      reservationKey: work.reservation_key,
      resourceId: work.id,
    });
    if (!consumed.ok) {
      if (consumed.error.code === 'persistence_error') return retry(work.id);
      if (work.object_key) await this.safeDelete(work.object_key);
      await this.db
        .prepare(
          `UPDATE audio_assets
           SET status = 'failed', object_key = NULL, failure_code = 'quota_finalize_failed', updated_at = ?
           WHERE id = ? AND status = 'staged'`,
        )
        .bind(this.clock(), work.id)
        .run();
      return { action: 'ack', assetId: work.id };
    }

    await this.db
      .prepare(
        `UPDATE audio_assets
         SET status = 'ready', ready_at = ?, failure_code = NULL, updated_at = ?
         WHERE id = ? AND status = 'staged' AND object_key IS NOT NULL`,
      )
      .bind(this.clock(), this.clock(), work.id)
      .run();
    const current = await this.loadWork(work.id);
    return current?.status === 'ready' ? { action: 'ack', assetId: work.id } : retry(work.id);
  }

  private async failTerminal(work: WorkRow, token: string, code: string): Promise<AudioProcessResult> {
    await this.db
      .prepare(
        `UPDATE audio_assets
         SET status = 'failed', failure_code = ?, processing_token = NULL, processing_started_at = NULL, updated_at = ?
         WHERE id = ? AND status = 'processing' AND processing_token = ?`,
      )
      .bind(code, this.clock(), work.id, token)
      .run();
    await this.quota.release({ userId: work.user_id, reservationKey: work.reservation_key });
    return { action: 'ack', assetId: work.id };
  }

  private async resetForRetry(assetId: string, token: string, code: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE audio_assets
         SET status = 'queued', failure_code = ?, processing_token = NULL, processing_started_at = NULL, updated_at = ?
         WHERE id = ? AND status = 'processing' AND processing_token = ?`,
      )
      .bind(code, this.clock(), assetId, token)
      .run();
  }

  private async loadWork(assetId: string): Promise<WorkRow | null> {
    return this.db
      .prepare(
        `SELECT a.id, a.episode_id, p.user_id, a.voice_variant, a.provider_voice_id, a.language_code,
                a.reservation_key, a.object_key, a.status, a.processing_token, a.processing_started_at,
                e.script_json
         FROM audio_assets a
         JOIN episodes e ON e.id = a.episode_id
         JOIN plots p ON p.id = e.plot_id
         WHERE a.id = ?`,
      )
      .bind(assetId)
      .first<WorkRow>();
  }

  private async loadQuotaStatus(userId: string, reservationKey: string): Promise<'reserved' | 'released' | 'consumed' | null> {
    const row = await this.db
      .prepare('SELECT status FROM quota_reservations WHERE user_id = ? AND reservation_key = ?')
      .bind(userId, reservationKey)
      .first<{ status: 'reserved' | 'released' | 'consumed' }>();
    return row?.status ?? null;
  }

  private async safeDelete(objectKey: string): Promise<void> {
    try {
      await this.bucket.delete(objectKey);
    } catch {
      // The object remains private; a later reconciliation/cleanup pass may remove it.
    }
  }
}

function parseScript(raw: string): string | null {
  try {
    const content = JSON.parse(raw) as StoredEpisodeContent;
    if (typeof content.script !== 'string') return null;
    const script = content.script.normalize('NFC').trim();
    return script || null;
  } catch {
    return null;
  }
}

function validJob(job: AudioJob): boolean {
  return typeof job?.assetId === 'string' && job.assetId.trim().length > 0;
}

function retry(assetId: string): AudioProcessResult {
  return { action: 'retry', assetId, delaySeconds: RETRY_DELAY_SECONDS };
}
