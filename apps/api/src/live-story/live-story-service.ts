import type { StoryGenerationError, StoryGenerator } from '../ai/contracts';
import { D1EntitlementRepository } from '../billing/d1-entitlement-repository';
import type { ChoiceCommitError } from '../choice/contracts';
import { D1ChoiceCommitter } from '../choice/d1-choice-committer';
import { D1EpisodePublisher } from '../publication/d1-episode-publisher';
import type { EpisodePublicationError } from '../publication/contracts';
import { D1QuotaLedger } from '../quota/d1-quota-ledger';
import type { QuotaError } from '../quota/contracts';
import { quotaPolicyFor } from '../quota/policy';
import { buildRetentionSnapshot } from '../retention/retention';
import type {
  LiveStoryCommitInput,
  LiveStoryCreateInput,
  LiveStoryGenerateInput,
  LiveStoryHome,
  LiveStoryResult,
  LiveStorySession,
} from './contracts';
import { D1LiveStoryRepository, type StoredLiveSession } from './d1-live-story-repository';

type Clock = () => number;

export class LiveStoryService {
  private readonly stories: D1LiveStoryRepository;
  private readonly entitlements: D1EntitlementRepository;
  private readonly quota: D1QuotaLedger;
  private readonly publisher: D1EpisodePublisher;
  private readonly choices: D1ChoiceCommitter;

  constructor(
    private readonly db: D1Database,
    private readonly generator: StoryGenerator,
    private readonly clock: Clock = Date.now,
  ) {
    this.stories = new D1LiveStoryRepository(db);
    this.entitlements = new D1EntitlementRepository(db, clock);
    this.quota = new D1QuotaLedger(db, clock);
    this.publisher = new D1EpisodePublisher(db);
    this.choices = new D1ChoiceCommitter(db);
  }

  async loadHome(userId: string): Promise<LiveStoryResult<LiveStoryHome>> {
    if (!userId.trim()) return invalidInput('User identifier is required.');
    const entitlement = await this.entitlements.getEntitlement(userId);
    const policy = quotaPolicyFor(entitlement.tier);
    const utcDay = utcDayFromMillis(this.clock());
    const usage = await this.quota.getDailyUsage(userId, utcDay);
    const [recentPlots, activity] = await Promise.all([
      this.stories.listOwnedPlots(userId),
      this.stories.loadRetentionActivity(userId),
    ]);
    return {
      ok: true,
      value: {
        recentPlots,
        quota: {
          textRemaining: remaining(policy.textEpisodesPerUtcDay, usage.textConsumed, usage.textReserved),
          textLimit: policy.textEpisodesPerUtcDay,
          voiceRemaining: remaining(policy.voiceEpisodesPerUtcDay, usage.voiceConsumed, usage.voiceReserved),
          voiceLimit: policy.voiceEpisodesPerUtcDay,
          resetAt: nextUtcReset(utcDay),
        },
        retention: buildRetentionSnapshot(activity, recentPlots.length, this.clock()),
      },
    };
  }

  async createPlot(input: LiveStoryCreateInput): Promise<LiveStoryResult<{ story: LiveStorySession; created: boolean }>> {
    const invalid = validateCreate(input);
    if (invalid) return invalidInput(invalid);
    const created = await this.stories.createOrLoadPlot(input);
    if (!created.ok) return created;

    const existing = await this.stories.loadSession(input.userId, created.value.id);
    if (existing) {
      const settled = await this.settleExistingReadyQuota(input.userId, existing);
      if (!settled.ok) return settled;
      return { ok: true, value: { story: existing.session, created: created.value.created } };
    }

    const generated = await this.generateForPlot(input.userId, created.value.id, input.generationKey);
    if (!generated.ok) return generated;
    return { ok: true, value: { story: generated.value, created: created.value.created } };
  }

  async loadPlot(userId: string, plotId: string): Promise<LiveStoryResult<LiveStorySession>> {
    if (!userId.trim() || !plotId.trim()) return invalidInput('User and plot identifiers are required.');
    const stored = await this.stories.loadSession(userId, plotId);
    if (!stored) return notFound();
    return { ok: true, value: stored.session };
  }

  async generateNext(input: LiveStoryGenerateInput): Promise<LiveStoryResult<LiveStorySession>> {
    if (!validKey(input.generationKey) || !input.userId.trim() || !input.plotId.trim()) {
      return invalidInput('User, plot, and generation key are required.');
    }
    return this.generateForPlot(input.userId, input.plotId, input.generationKey);
  }

  async commitChoice(input: LiveStoryCommitInput): Promise<LiveStoryResult<LiveStorySession>> {
    if (!input.userId.trim() || !input.plotId.trim() || !input.episodeId.trim() || !input.choiceId.trim()) {
      return invalidInput('User, plot, episode, and choice identifiers are required.');
    }
    const expected = await this.stories.loadExpectedChoiceStateVersion(input.userId, input.plotId, input.episodeId);
    if (expected === null) return notFound();
    const result = await this.choices.commit({ ...input, expectedStateVersion: expected });
    if (!result.ok) return mapChoiceError(result.error);
    const stored = await this.stories.loadSession(input.userId, input.plotId);
    return stored ? { ok: true, value: stored.session } : persistenceError('Committed story could not be reloaded.');
  }

  private async generateForPlot(userId: string, plotId: string, generationKey: string): Promise<LiveStoryResult<LiveStorySession>> {
    const existing = await this.stories.loadSession(userId, plotId);
    if (existing?.session.episode.status === 'awaiting_choice') {
      const settled = await this.settleExistingReadyQuota(userId, existing);
      return settled.ok ? { ok: true, value: existing.session } : settled;
    }

    const context = await this.stories.loadGenerationContext(userId, plotId);
    if (!context) return notFound();
    const reserved = await this.reserveTextQuota(userId, generationKey);
    if (!reserved.ok) return reserved;

    const generated = await this.generator.generate(context.input);
    if (!generated.ok) return this.releaseAfterGenerationFailure(userId, generationKey, generated.error);
    const published = await this.publisher.publish({
      userId,
      plotId,
      generationKey,
      expectedStateVersion: context.stateVersion,
      proposal: generated.value.proposal,
      generation: generated.value,
    });
    if (!published.ok) return this.resolvePublicationFailure(userId, plotId, generationKey, published.error);
    return this.consumeAndReload(userId, plotId, generationKey, published.value.id);
  }

  private async reserveTextQuota(userId: string, generationKey: string): Promise<LiveStoryResult<true>> {
    const entitlement = await this.entitlements.getEntitlement(userId);
    const result = await this.quota.reserve({ userId, reservationKey: generationKey, resourceType: 'text_episode', tier: entitlement.tier });
    return result.ok ? { ok: true, value: true } : mapQuotaError(result.error);
  }

  private async releaseAfterGenerationFailure(
    userId: string,
    generationKey: string,
    error: StoryGenerationError,
  ): Promise<LiveStoryResult<never>> {
    await this.quota.release({ userId, reservationKey: generationKey });
    return mapGenerationError(error);
  }

  private async resolvePublicationFailure(
    userId: string,
    plotId: string,
    generationKey: string,
    error: EpisodePublicationError,
  ): Promise<LiveStoryResult<LiveStorySession>> {
    await this.quota.release({ userId, reservationKey: generationKey });
    if (error.code !== 'pending_episode') return mapPublicationError(error);
    const stored = await this.stories.loadSession(userId, plotId);
    if (!stored) return persistenceError('Published story could not be reloaded after a race.');
    const settled = await this.settleExistingReadyQuota(userId, stored);
    return settled.ok ? { ok: true, value: stored.session } : settled;
  }

  private async consumeAndReload(
    userId: string,
    plotId: string,
    generationKey: string,
    episodeId: string,
  ): Promise<LiveStoryResult<LiveStorySession>> {
    const consumed = await this.quota.consume({ userId, reservationKey: generationKey, resourceId: episodeId });
    if (!consumed.ok) return persistenceError('Published episode quota could not be finalized.');
    const stored = await this.stories.loadSession(userId, plotId);
    return stored ? { ok: true, value: stored.session } : persistenceError('Published story could not be reloaded.');
  }

  private async settleExistingReadyQuota(userId: string, stored: StoredLiveSession): Promise<LiveStoryResult<true>> {
    if (stored.session.episode.status !== 'awaiting_choice' || !stored.generationKey) return { ok: true, value: true };
    const result = await this.quota.consume({
      userId,
      reservationKey: stored.generationKey,
      resourceId: stored.session.episode.id,
    });
    if (result.ok || result.error.code === 'not_found') return { ok: true, value: true };
    return persistenceError('Existing episode quota could not be finalized.');
  }
}

function validateCreate(input: LiveStoryCreateInput): string | null {
  if (!input.userId.trim()) return 'User identifier is required.';
  if (!validKey(input.creationKey) || !validKey(input.generationKey)) return 'Creation and generation keys must be 8–128 non-padded characters.';
  if (input.premise !== input.premise.trim() || input.premise.length < 12 || input.premise.length > 600) return 'Premise must be 12–600 trimmed characters.';
  if (!['tense', 'romantic', 'mysterious', 'hopeful'].includes(input.mood)) return 'Story mood is invalid.';
  if (input.characterName !== input.characterName.trim() || input.characterName.length < 1 || input.characterName.length > 50) return 'Character name must be 1–50 trimmed characters.';
  if (input.locale !== input.locale.trim() || input.locale.length < 2 || input.locale.length > 20) return 'Locale is invalid.';
  return null;
}

function validKey(value: string): boolean {
  return value === value.trim() && value.length >= 8 && value.length <= 128;
}

function mapGenerationError(error: StoryGenerationError): LiveStoryResult<never> {
  if (error.code === 'provider_unavailable') {
    return { ok: false, error: { code: 'provider_unavailable', message: error.message } };
  }
  if (error.code === 'invalid_response') {
    return { ok: false, error: { code: 'invalid_generation', message: error.message } };
  }
  return { ok: false, error: { code: 'invalid_generation', message: error.message } };
}

function mapPublicationError(error: EpisodePublicationError): LiveStoryResult<never> {
  if (error.code === 'not_found') return notFound();
  if (error.code === 'pending_episode') return { ok: false, error: { code: 'choice_required', message: error.message } };
  if (error.code === 'stale_state') return { ok: false, error: { code: 'stale_state', message: error.message, currentStateVersion: error.currentStateVersion } };
  if (error.code === 'invalid_input') return invalidInput(error.message);
  return persistenceError(error.message);
}

function mapChoiceError(error: ChoiceCommitError): LiveStoryResult<never> {
  if (error.code === 'not_found') return notFound();
  if (error.code === 'already_committed') {
    return { ok: false, error: { code: 'choice_conflict', message: error.message, committedChoiceId: error.committedChoiceId } };
  }
  if (error.code === 'stale_state') return { ok: false, error: { code: 'stale_state', message: error.message, currentStateVersion: error.currentStateVersion } };
  if (error.code === 'episode_not_ready') return { ok: false, error: { code: 'choice_required', message: error.message } };
  if (error.code === 'invalid_input') return invalidInput(error.message);
  return persistenceError(error.message);
}

function mapQuotaError(error: QuotaError): LiveStoryResult<never> {
  if (error.code === 'quota_exceeded') {
    return { ok: false, error: { code: 'quota_exceeded', message: error.message, limit: error.limit, utcDay: error.utcDay } };
  }
  if (error.code === 'invalid_input') return invalidInput(error.message);
  if (error.code === 'not_found') return notFound();
  return persistenceError(error.message);
}

function invalidInput(message: string): LiveStoryResult<never> {
  return { ok: false, error: { code: 'invalid_input', message } };
}

function notFound(): LiveStoryResult<never> {
  return { ok: false, error: { code: 'not_found', message: 'Story not found.' } };
}

function persistenceError(message: string): LiveStoryResult<never> {
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
