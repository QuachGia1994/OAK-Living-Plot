import type { AccountDeleteResult, AccountExportDrama, AccountExportScene, AccountExportSnapshot } from './contracts';
import { ACCOUNT_DELETE_CONFIRMATION } from './contracts';
import { D1UserPreferencesRepository } from '../preferences/d1-user-preferences';

interface PlotRow { id: string; title: string; premise: string; status: 'active' | 'completed' | 'archived'; locale: string; mood: string; summary: string }
interface CharacterRow { plot_id: string; name: string; role: string; traits_json: string }
interface EpisodeRow { id: string; plot_id: string; episode_number: number; title: string; script_json: string; summary: string; status: 'ready' | 'completed' }
interface ChoiceRow { episode_id: string; choice_key: string; label: string; intent: string | null; consequence: string | null; committed_choice_id: string | null; id: string }
interface AudioRow { episode_id: string; voice_variant: string; status: string; input_characters: number; attempts: number; ready_at: number | null }
interface PortraitRow { plot_id: string; status: string; attempts: number; created_at: number; ready_at: number | null }
interface ArtworkRow { episode_id: string; status: string; attempts: number; created_at: number; ready_at: number | null }

export class D1AccountService {
  constructor(
    private readonly db: D1Database,
    private readonly audioBucket: R2Bucket,
    private readonly clock: () => number = Date.now,
  ) {}

  async export(userId: string): Promise<AccountExportSnapshot> {
    const [preferences, entitlement, usage, referral, plots, characters, portraits, episodes, choices, audio, artworks] = await Promise.all([
      new D1UserPreferencesRepository(this.db).get(userId),
      this.loadEntitlement(userId),
      this.loadUsage(userId),
      this.loadReferral(userId),
      this.loadPlots(userId),
      this.loadCharacters(userId),
      this.loadPortraits(userId),
      this.loadEpisodes(userId),
      this.loadChoices(userId),
      this.loadAudio(userId),
      this.loadArtworks(userId),
    ]);
    return {
      schemaVersion: 3,
      exportedAt: new Date(this.clock()).toISOString(),
      preferences,
      entitlement,
      usage,
      referral,
      dramas: assembleDramas(plots, characters, portraits, episodes, choices, audio, artworks),
    };
  }

  async delete(userId: string, confirmation: string): Promise<AccountDeleteResult> {
    if (confirmation !== ACCOUNT_DELETE_CONFIRMATION) return { ok: false, code: 'invalid_confirmation' };
    const [audioObjects, plots] = await Promise.all([
      this.db
        .prepare(
          `SELECT a.object_key AS object_key
           FROM audio_assets a JOIN episodes e ON e.id = a.episode_id JOIN plots p ON p.id = e.plot_id
           WHERE p.user_id = ? AND a.object_key IS NOT NULL`,
        )
        .bind(userId)
        .all<{ object_key: string }>(),
      this.db
        .prepare('SELECT id FROM plots WHERE user_id = ? ORDER BY id')
        .bind(userId)
        .all<{ id: string }>(),
    ]);
    try {
      const derivedImageObjectKeys = await this.listDerivedImageObjects(plots.results.map((plot) => plot.id));
      for (const objectKey of new Set([...audioObjects.results.map((row) => row.object_key), ...derivedImageObjectKeys])) {
        await this.audioBucket.delete(objectKey);
      }
    } catch {
      return { ok: false, code: 'audio_cleanup_failed' };
    }
    try {
      await this.db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
      return { ok: true };
    } catch {
      return { ok: false, code: 'persistence_error' };
    }
  }

  private async listDerivedImageObjects(plotIds: string[]): Promise<string[]> {
    const objectKeys: string[] = [];
    for (const plotId of plotIds) {
      for (const prefix of [`portraits/${plotId}/`, `scene-artworks/${plotId}/`]) {
        let cursor: string | undefined;
        do {
          const listed = await this.audioBucket.list({ prefix, cursor });
          objectKeys.push(...listed.objects.map((object) => object.key));
          cursor = listed.truncated ? listed.cursor : undefined;
        } while (cursor);
      }
    }
    return objectKeys;
  }

  private async loadEntitlement(userId: string) {
    const row = await this.db
      .prepare('SELECT tier, plus_expires_at, synced_at FROM user_entitlements WHERE user_id = ?')
      .bind(userId)
      .first<{ tier: 'free' | 'plus'; plus_expires_at: number | null; synced_at: number }>();
    return {
      tier: row?.tier ?? 'free' as const,
      expiresAt: row?.plus_expires_at ? new Date(row.plus_expires_at).toISOString() : null,
      syncedAt: row?.synced_at ? new Date(row.synced_at).toISOString() : null,
    };
  }

  private async loadUsage(userId: string) {
    const rows = await this.db
      .prepare('SELECT usage_date, text_episodes, voiced_episodes FROM daily_usage WHERE user_id = ? ORDER BY usage_date')
      .bind(userId)
      .all<{ usage_date: string; text_episodes: number; voiced_episodes: number }>();
    return rows.results.map((row) => ({ utcDay: row.usage_date, generatedScenes: row.text_episodes, voicedScenes: row.voiced_episodes }));
  }

  private async loadReferral(userId: string) {
    const [code, claim, balance, successes] = await Promise.all([
      this.db.prepare('SELECT code FROM referral_codes WHERE user_id = ?').bind(userId).first<{ code: string }>(),
      this.db.prepare('SELECT code FROM referral_claims WHERE referred_user_id = ?').bind(userId).first<{ code: string }>(),
      this.db
        .prepare('SELECT available_credits, earned_credits, spent_credits FROM voice_bonus_accounts WHERE user_id = ?')
        .bind(userId)
        .first<{ available_credits: number; earned_credits: number; spent_credits: number }>(),
      this.db
        .prepare('SELECT COUNT(*) AS count FROM referral_claims WHERE inviter_user_id = ? AND reward_granted_at IS NOT NULL')
        .bind(userId)
        .first<{ count: number }>(),
    ]);
    return {
      code: code?.code ?? null,
      claimedCode: claim?.code ?? null,
      successfulReferrals: successes?.count ?? 0,
      voiceCredits: {
        available: balance?.available_credits ?? 0,
        earned: balance?.earned_credits ?? 0,
        spent: balance?.spent_credits ?? 0,
      },
    };
  }

  private async loadPlots(userId: string) {
    return (await this.db
      .prepare('SELECT id, title, premise, status, locale, mood, summary FROM plots WHERE user_id = ? ORDER BY created_at, id')
      .bind(userId)
      .all<PlotRow>()).results;
  }

  private async loadCharacters(userId: string) {
    return (await this.db
      .prepare(`SELECT c.plot_id, c.name, c.role, c.traits_json FROM characters c JOIN plots p ON p.id = c.plot_id WHERE p.user_id = ? ORDER BY c.created_at, c.id`)
      .bind(userId)
      .all<CharacterRow>()).results;
  }

  private async loadPortraits(userId: string) {
    return (await this.db
      .prepare(
        `SELECT cp.plot_id, cp.status, cp.attempts, cp.created_at, cp.ready_at
         FROM character_portraits cp JOIN plots p ON p.id = cp.plot_id
         WHERE p.user_id = ? ORDER BY cp.plot_id, cp.created_at, cp.story_fingerprint`,
      )
      .bind(userId)
      .all<PortraitRow>()).results;
  }

  private async loadEpisodes(userId: string) {
    return (await this.db
      .prepare(`SELECT e.id, e.plot_id, e.episode_number, e.title, e.script_json, e.summary, e.status FROM episodes e JOIN plots p ON p.id = e.plot_id WHERE p.user_id = ? ORDER BY e.plot_id, e.episode_number`)
      .bind(userId)
      .all<EpisodeRow>()).results;
  }

  private async loadChoices(userId: string) {
    return (await this.db
      .prepare(
        `SELECT c.id, c.episode_id, c.choice_key, c.label, c.intent, c.consequence, cc.choice_id AS committed_choice_id
         FROM episode_choices c
         JOIN episodes e ON e.id = c.episode_id JOIN plots p ON p.id = e.plot_id
         LEFT JOIN choice_commits cc ON cc.episode_id = c.episode_id
         WHERE p.user_id = ? ORDER BY c.episode_id, c.position`,
      )
      .bind(userId)
      .all<ChoiceRow>()).results;
  }

  private async loadAudio(userId: string) {
    return (await this.db
      .prepare(
        `SELECT a.episode_id, a.voice_variant, a.status, a.input_characters, a.attempts, a.ready_at
         FROM audio_assets a JOIN episodes e ON e.id = a.episode_id JOIN plots p ON p.id = e.plot_id
         WHERE p.user_id = ? ORDER BY a.created_at, a.id`,
      )
      .bind(userId)
      .all<AudioRow>()).results;
  }

  private async loadArtworks(userId: string) {
    try {
      return (await this.db
        .prepare(
          `SELECT sa.scene_id AS episode_id, sa.status, sa.attempts, sa.created_at, sa.ready_at
           FROM scene_artworks sa
           JOIN episodes e ON e.id = sa.scene_id JOIN plots p ON p.id = e.plot_id
           WHERE p.user_id = ? ORDER BY sa.created_at, sa.scene_id, sa.content_fingerprint`,
        )
        .bind(userId)
        .all<ArtworkRow>()).results;
    } catch {
      // Artwork is a derived cache. Account export must remain available during migration skew.
      return [];
    }
  }
}

function assembleDramas(
  plots: PlotRow[],
  characters: CharacterRow[],
  portraits: PortraitRow[],
  episodes: EpisodeRow[],
  choices: ChoiceRow[],
  audio: AudioRow[],
  artworks: ArtworkRow[],
): AccountExportDrama[] {
  return plots.map((plot) => ({
    title: plot.title,
    premise: plot.premise,
    status: plot.status,
    locale: plot.locale,
    mood: plot.mood,
    summary: plot.summary,
    characters: characters.filter((row) => row.plot_id === plot.id).map((row) => ({ name: row.name, role: row.role, traits: parseObject(row.traits_json) })),
    portraits: portraits.filter((row) => row.plot_id === plot.id).map((row) => ({
      status: row.status,
      attempts: row.attempts,
      createdAt: new Date(row.created_at).toISOString(),
      readyAt: row.ready_at === null ? null : new Date(row.ready_at).toISOString(),
    })),
    scenes: episodes.filter((row) => row.plot_id === plot.id).map((row) => assembleScene(row, choices, audio, artworks)),
  }));
}

function assembleScene(row: EpisodeRow, choices: ChoiceRow[], audio: AudioRow[], artworks: ArtworkRow[]): AccountExportScene {
  return {
    number: row.episode_number,
    title: row.title,
    script: parseScript(row.script_json),
    summary: row.summary,
    status: row.status,
    choices: choices.filter((choice) => choice.episode_id === row.id).map((choice) => ({
      key: choice.choice_key,
      label: choice.label,
      intent: choice.intent ?? '',
      consequence: choice.consequence ?? '',
      committed: choice.committed_choice_id === choice.id,
    })),
    artworks: artworks.filter((artwork) => artwork.episode_id === row.id).map((artwork) => ({
      status: artwork.status,
      attempts: artwork.attempts,
      createdAt: new Date(artwork.created_at).toISOString(),
      readyAt: artwork.ready_at ? new Date(artwork.ready_at).toISOString() : null,
    })),
    media: audio.filter((asset) => asset.episode_id === row.id).map((asset) => ({
      kind: 'voice' as const,
      variant: asset.voice_variant,
      status: asset.status,
      attempts: asset.attempts,
      readyAt: asset.ready_at ? new Date(asset.ready_at).toISOString() : null,
    })),
  };
}

function parseScript(raw: string): string {
  try {
    const value = JSON.parse(raw) as { script?: unknown };
    return typeof value.script === 'string' ? value.script : '';
  } catch {
    return '';
  }
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
