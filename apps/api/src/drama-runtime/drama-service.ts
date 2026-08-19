import type { SceneGenerationError, SceneGenerator } from '../ai/contracts';
import type { Drama } from '../domain/drama';
import { D1EntitlementRepository } from '../billing/d1-entitlement-repository';
import type { ChoiceCommitError } from '../choice/contracts';
import { D1ChoiceCommitter } from '../choice/d1-choice-committer';
import { D1EpisodePublisher } from '../publication/d1-episode-publisher';
import type { EpisodePublicationError } from '../publication/contracts';
import { D1UserPreferencesRepository } from '../preferences/d1-user-preferences';
import { isDramaLocale } from '../preferences/contracts';
import { D1QuotaLedger } from '../quota/d1-quota-ledger';
import type { QuotaError } from '../quota/contracts';
import { quotaPolicyFor } from '../quota/policy';
import { buildRetentionSnapshot } from '../retention/retention';
import { D1VoiceBonusLedger } from '../referrals/d1-voice-bonus-ledger';
import type { ProductEventTelemetry, ProductTelemetrySink } from '../telemetry/product-events';
import { NOOP_PRODUCT_TELEMETRY } from '../telemetry/product-events';
import type {
  DramaCommitInput,
  DramaCreateInput,
  DramaGenerateInput,
  DramaHistory,
  DramaHome,
  DramaLibrary,
  DramaResult,
  DramaSummary,
  GenerationJob,
} from './contracts';
import { D1DramaRepository, type StoredDramaSession } from './d1-drama-repository';

type Clock = () => number;

export class DramaService {
  private readonly dramas: D1DramaRepository;
  private readonly entitlements: D1EntitlementRepository;
  private readonly quota: D1QuotaLedger;
  private readonly preferences: D1UserPreferencesRepository;
  private readonly publisher: D1EpisodePublisher;
  private readonly choices: D1ChoiceCommitter;

  constructor(
    private readonly db: D1Database,
    private readonly generator: SceneGenerator,
    private readonly clock: Clock = Date.now,
    private readonly productTelemetry: ProductTelemetrySink = NOOP_PRODUCT_TELEMETRY,
  ) {
    this.dramas = new D1DramaRepository(db);
    this.entitlements = new D1EntitlementRepository(db, clock);
    this.quota = new D1QuotaLedger(db, clock);
    this.preferences = new D1UserPreferencesRepository(db);
    this.publisher = new D1EpisodePublisher(db);
    this.choices = new D1ChoiceCommitter(db);
  }

  async loadHome(userId: string): Promise<DramaResult<DramaHome>> {
    if (!userId.trim()) return invalidInput('User identifier is required.');
    const entitlement = await this.entitlements.getEntitlement(userId);
    const policy = quotaPolicyFor(entitlement.tier);
    const utcDay = utcDayFromMillis(this.clock());
    const usage = await this.quota.getDailyUsage(userId, utcDay);
    const [recentDramas, activity, preferences, voiceBonusCredits] = await Promise.all([
      this.dramas.listOwnedDramas(userId),
      this.dramas.loadRetentionActivity(userId),
      this.preferences.get(userId),
      new D1VoiceBonusLedger(this.db, this.clock).balance(userId),
    ]);
    return {
      ok: true,
      value: {
        recentDramas,
        quota: {
          textRemaining: remaining(policy.textEpisodesPerUtcDay, usage.textConsumed, usage.textReserved),
          textLimit: policy.textEpisodesPerUtcDay,
          voiceRemaining: remaining(policy.voiceEpisodesPerUtcDay, usage.voiceConsumed, usage.voiceReserved),
          voiceLimit: policy.voiceEpisodesPerUtcDay,
          voiceBonusCredits,
          resetAt: nextUtcReset(utcDay),
        },
        retention: buildRetentionSnapshot(activity, recentDramas.length, this.clock(), preferences.uiLocale),
      },
    };
  }

  async createDrama(input: DramaCreateInput): Promise<DramaResult<{ drama: Drama; created: boolean }>> {
    const invalid = validateCreate(input);
    if (invalid) return invalidInput(invalid);
    const created = await this.dramas.createOrLoadDrama(input);
    if (!created.ok) return created;

    const existing = await this.dramas.loadSession(input.userId, created.value.id);
    if (existing) {
      const settled = await this.settleExistingReadyQuota(input.userId, existing);
      if (!settled.ok) return settled;
      return { ok: true, value: { drama: existing.session, created: false } };
    }

    const generated = await this.generateForDrama(input.userId, created.value.id, input.generationKey);
    if (!generated.ok) return generated;
    return { ok: true, value: { drama: generated.value, created: true } };
  }

  async loadDrama(userId: string, dramaId: string): Promise<DramaResult<Drama>> {
    if (!userId.trim() || !dramaId.trim()) return invalidInput('User and drama identifiers are required.');
    const stored = await this.dramas.loadSession(userId, dramaId);
    if (!stored) return notFound();
    return { ok: true, value: stored.session };
  }

  async loadLibrary(userId: string): Promise<DramaResult<DramaLibrary>> {
    if (!userId.trim()) return invalidInput('User identifier is required.');
    return { ok: true, value: await this.dramas.loadLibrary(userId) };
  }

  async loadHistory(userId: string, dramaId: string): Promise<DramaResult<DramaHistory>> {
    if (!userId.trim() || !dramaId.trim()) return invalidInput('User and drama identifiers are required.');
    const history = await this.dramas.loadHistory(userId, dramaId);
    return history ? { ok: true, value: history } : notFound();
  }

  async archiveDrama(userId: string, dramaId: string): Promise<DramaResult<DramaSummary>> {
    return this.setLifecycleStatus(userId, dramaId, 'archived');
  }

  async restoreDrama(userId: string, dramaId: string): Promise<DramaResult<DramaSummary>> {
    return this.setLifecycleStatus(userId, dramaId, 'active');
  }

  async generateNext(input: DramaGenerateInput): Promise<DramaResult<Drama>> {
    if (!validKey(input.generationKey) || !input.userId.trim() || !input.dramaId.trim()) {
      return invalidInput('User, drama, and generation key are required.');
    }
    return this.generateForDrama(input.userId, input.dramaId, input.generationKey);
  }

  async commitChoice(input: DramaCommitInput): Promise<DramaResult<Drama>> {
    if (!input.userId.trim() || !input.dramaId.trim() || !input.sceneId.trim() || !input.choiceId.trim()) {
      return invalidInput('User, drama, scene, and choice identifiers are required.');
    }
    const expected = await this.dramas.loadExpectedChoiceStateVersion(input.userId, input.dramaId, input.sceneId);
    if (expected === null) return notFound();
    const result = await this.choices.commit({ userId: input.userId, plotId: input.dramaId, episodeId: input.sceneId, choiceId: input.choiceId, expectedStateVersion: expected });
    if (!result.ok) return mapChoiceError(result.error);
    const stored = await this.dramas.loadSession(input.userId, input.dramaId);
    if (!stored) return persistenceError('Committed drama could not be reloaded.');
    if (!result.value.replayed) {
      this.recordProductEvent({
        event: 'choice_committed',
        mood: stored.session.mood,
        sceneNumber: stored.session.currentScene.number,
      });
    }
    return { ok: true, value: stored.session };
  }

  private async setLifecycleStatus(
    userId: string,
    dramaId: string,
    target: 'active' | 'archived',
  ): Promise<DramaResult<DramaSummary>> {
    if (!userId.trim() || !dramaId.trim()) return invalidInput('User and drama identifiers are required.');
    const changed = await this.dramas.setLifecycleStatus(userId, dramaId, target, this.clock());
    if (changed === 'not_found') return notFound();
    if (changed === 'invalid_status') return invalidInput('Completed dramas cannot change lifecycle status.');
    const summary = await this.dramas.loadSummary(userId, dramaId);
    if (!summary) return persistenceError('Updated drama could not be reloaded.');
    if (changed === 'updated') {
      this.recordProductEvent({
        event: target === 'archived' ? 'drama_archived' : 'drama_restored',
        mood: summary.mood,
        sceneNumber: summary.sceneNumber,
      });
    }
    return { ok: true, value: summary };
  }

  private recordProductEvent(event: ProductEventTelemetry): void {
    try {
      this.productTelemetry.recordProductEvent(event);
    } catch {
      // Product analytics is observational and must never change canonical drama behavior.
    }
  }

  private async generateForDrama(userId: string, dramaId: string, generationKey: string): Promise<DramaResult<Drama>> {
    const job: GenerationJob = { userId, dramaId, generationKey };
    const existing = await this.dramas.loadSession(job.userId, job.dramaId);
    if (existing?.session.currentScene.branch.state === 'open') {
      const settled = await this.settleExistingReadyQuota(userId, existing);
      return settled.ok ? { ok: true, value: existing.session } : settled;
    }

    const context = await this.dramas.loadGenerationContext(job.userId, job.dramaId);
    if (!context) return notFound();
    const reserved = await this.reserveTextQuota(job.userId, job.generationKey);
    if (!reserved.ok) return reserved;

    const generated = await this.generator.generate(context.input);
    if (!generated.ok) return this.releaseAfterGenerationFailure(job.userId, job.generationKey, generated.error);
    const published = await this.publisher.publish({
      userId: job.userId,
      plotId: job.dramaId,
      generationKey: job.generationKey,
      expectedStateVersion: context.stateVersion,
      proposal: generated.value.proposal,
      generation: generated.value,
    });
    if (!published.ok) return this.resolvePublicationFailure(job.userId, job.dramaId, job.generationKey, published.error);
    const settled = await this.consumeAndReload(job.userId, job.dramaId, job.generationKey, published.value.id);
    if (settled.ok && !published.value.replayed) {
      this.recordProductEvent({
        event: published.value.episodeNumber === 1 ? 'drama_created' : 'next_scene_published',
        mood: settled.value.mood,
        sceneNumber: published.value.episodeNumber,
      });
    }
    return settled;
  }

  private async reserveTextQuota(userId: string, generationKey: string): Promise<DramaResult<true>> {
    const entitlement = await this.entitlements.getEntitlement(userId);
    const result = await this.quota.reserve({ userId, reservationKey: generationKey, resourceType: 'text_episode', tier: entitlement.tier });
    return result.ok ? { ok: true, value: true } : mapQuotaError(result.error);
  }

  private async releaseAfterGenerationFailure(
    userId: string,
    generationKey: string,
    error: SceneGenerationError,
  ): Promise<DramaResult<never>> {
    await this.quota.release({ userId, reservationKey: generationKey });
    return mapGenerationError(error);
  }

  private async resolvePublicationFailure(
    userId: string,
    dramaId: string,
    generationKey: string,
    error: EpisodePublicationError,
  ): Promise<DramaResult<Drama>> {
    await this.quota.release({ userId, reservationKey: generationKey });
    if (error.code !== 'pending_episode') return mapPublicationError(error);
    const stored = await this.dramas.loadSession(userId, dramaId);
    if (!stored) return persistenceError('Published drama could not be reloaded after a race.');
    const settled = await this.settleExistingReadyQuota(userId, stored);
    return settled.ok ? { ok: true, value: stored.session } : settled;
  }

  private async consumeAndReload(
    userId: string,
    dramaId: string,
    generationKey: string,
    sceneId: string,
  ): Promise<DramaResult<Drama>> {
    const consumed = await this.quota.consume({ userId, reservationKey: generationKey, resourceId: sceneId });
    if (!consumed.ok) return persistenceError('Published scene quota could not be finalized.');
    const stored = await this.dramas.loadSession(userId, dramaId);
    return stored ? { ok: true, value: stored.session } : persistenceError('Published drama could not be reloaded.');
  }

  private async settleExistingReadyQuota(userId: string, stored: StoredDramaSession): Promise<DramaResult<true>> {
    if (stored.session.currentScene.branch.state !== 'open' || !stored.generationKey) return { ok: true, value: true };
    const result = await this.quota.consume({
      userId,
      reservationKey: stored.generationKey,
      resourceId: stored.session.currentScene.id,
    });
    if (result.ok || result.error.code === 'not_found') return { ok: true, value: true };
    return persistenceError('Existing scene quota could not be finalized.');
  }
}

function validateCreate(input: DramaCreateInput): string | null {
  if (!input.userId.trim()) return 'User identifier is required.';
  if (!validKey(input.creationKey) || !validKey(input.generationKey)) return 'Creation and generation keys must be 8–128 non-padded characters.';
  if (input.premise !== input.premise.trim() || input.premise.length < 12 || input.premise.length > 600) return 'Premise must be 12–600 trimmed characters.';
  if (!['tense', 'romantic', 'mysterious', 'hopeful'].includes(input.mood)) return 'Drama mood is invalid.';
  if (input.characterName !== input.characterName.trim() || input.characterName.length < 1 || input.characterName.length > 50) return 'Character name must be 1–50 trimmed characters.';
  if (!isDramaLocale(input.locale)) return 'Drama locale is invalid.';
  return null;
}

function validKey(value: string): boolean {
  return value === value.trim() && value.length >= 8 && value.length <= 128;
}

function mapGenerationError(error: SceneGenerationError): DramaResult<never> {
  if (error.code === 'provider_unavailable') {
    return { ok: false, error: { code: 'provider_unavailable', message: error.message, providerStatus: error.providerStatus } };
  }
  if (error.code === 'invalid_response') {
    return { ok: false, error: { code: 'invalid_generation', message: error.message } };
  }
  return { ok: false, error: { code: 'invalid_generation', message: error.message } };
}

function mapPublicationError(error: EpisodePublicationError): DramaResult<never> {
  if (error.code === 'not_found') return notFound();
  if (error.code === 'pending_episode') return { ok: false, error: { code: 'choice_required', message: error.message } };
  if (error.code === 'stale_state') return { ok: false, error: { code: 'stale_state', message: error.message, currentStateVersion: error.currentStateVersion } };
  if (error.code === 'invalid_input') return invalidInput(error.message);
  return persistenceError(error.message);
}

function mapChoiceError(error: ChoiceCommitError): DramaResult<never> {
  if (error.code === 'not_found') return notFound();
  if (error.code === 'already_committed') {
    return { ok: false, error: { code: 'choice_conflict', message: error.message, committedChoiceId: error.committedChoiceId } };
  }
  if (error.code === 'stale_state') return { ok: false, error: { code: 'stale_state', message: error.message, currentStateVersion: error.currentStateVersion } };
  if (error.code === 'episode_not_ready') return { ok: false, error: { code: 'choice_required', message: error.message } };
  if (error.code === 'invalid_input') return invalidInput(error.message);
  return persistenceError(error.message);
}

function mapQuotaError(error: QuotaError): DramaResult<never> {
  if (error.code === 'quota_exceeded') {
    return { ok: false, error: { code: 'quota_exceeded', message: error.message, limit: error.limit, utcDay: error.utcDay } };
  }
  if (error.code === 'invalid_input') return invalidInput(error.message);
  if (error.code === 'not_found') return notFound();
  return persistenceError(error.message);
}

function invalidInput(message: string): DramaResult<never> {
  return { ok: false, error: { code: 'invalid_input', message } };
}

function notFound(): DramaResult<never> {
  return { ok: false, error: { code: 'not_found', message: 'Drama not found.' } };
}

function persistenceError(message: string): DramaResult<never> {
  return { ok: false, error: { code: 'persistence_error', message } };
}

function remaining(limit: number, consumed: number, reserved: number): number {
  return Math.max(0, limit - consumed - reserved);
}

function utcDayFromMillis(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function nextUtcReset(utcDay: string): string {
  const reset = new Date(`${utcDay}T00:00:00.000Z`);
  reset.setUTCDate(reset.getUTCDate() + 1);
  return reset.toISOString();
}
