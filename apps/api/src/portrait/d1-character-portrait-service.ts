import { CHARACTER_PORTRAIT_FALLBACK_MODEL, CHARACTER_PORTRAIT_MODEL, type CharacterPortraitDelivery, type CharacterPortraitResult, type CharacterPortraitSnapshot } from './contracts';
import { decodedImageFromPayload, type DecodedImage } from '../media/image-payload';

const GENERATION_LEASE_MS = 120_000;

type Clock = () => number;

interface PortraitContextRow {
  plot_id: string;
  premise: string;
  mood: string;
  plot_summary: string;
  character_id: string;
  character_name: string;
  traits_json: string;
  episode_number: number;
  episode_title: string;
  scene_summary: string;
  committed_choice_label: string | null;
  committed_choice_intent: string | null;
  committed_consequence: string | null;
}

interface PortraitRow {
  story_fingerprint: string;
  object_key: string | null;
  status: 'stale' | 'generating' | 'ready' | 'failed';
  generation_token: string | null;
  attempts: number;
  updated_at: number;
  ready_at: number | null;
}

export class D1CharacterPortraitService {
  constructor(
    private readonly db: D1Database,
    private readonly bucket: R2Bucket,
    private readonly ai: Ai | undefined,
    private readonly clock: Clock = Date.now,
  ) {}

  async status(userId: string, plotId: string): Promise<CharacterPortraitResult<CharacterPortraitSnapshot>> {
    const context = await this.loadContext(userId, plotId);
    if (!context) return notFound();
    const fingerprint = await storyFingerprint(context);
    const current = await this.loadPortrait(plotId, fingerprint);
    if (current?.status === 'ready') return { ok: true, value: snapshot(current, true) };
    const fallback = await this.loadLatestReady(plotId);
    if (fallback) {
      return {
        ok: true,
        value: {
          ...snapshot(fallback, false),
          status: 'stale',
          current: false,
          attempts: current?.attempts ?? fallback.attempts,
          updatedAt: current?.updated_at ?? fallback.updated_at,
        },
      };
    }
    return {
      ok: true,
      value: current
        ? snapshot(current, true)
        : { status: 'missing', current: false, attempts: 0, updatedAt: null, readyAt: null },
    };
  }

  async delivery(userId: string, plotId: string): Promise<CharacterPortraitResult<CharacterPortraitDelivery>> {
    const context = await this.loadContext(userId, plotId);
    if (!context) return notFound();
    const fingerprint = await storyFingerprint(context);
    const current = await this.loadPortrait(plotId, fingerprint);
    if (current?.status === 'ready' && current.object_key) {
      return { ok: true, value: { snapshot: snapshot(current, true), objectKey: current.object_key } };
    }
    const fallback = await this.loadLatestReady(plotId);
    return {
      ok: true,
      value: fallback?.object_key
        ? { snapshot: { ...snapshot(fallback, false), status: 'stale', current: false }, objectKey: fallback.object_key }
        : { snapshot: current ? snapshot(current, true) : { status: 'missing', current: false, attempts: 0, updatedAt: null, readyAt: null }, objectKey: null },
    };
  }

  async generate(userId: string, plotId: string): Promise<CharacterPortraitResult<CharacterPortraitSnapshot>> {
    const context = await this.loadContext(userId, plotId);
    if (!context) return notFound();
    if (!this.ai) return providerUnavailable('Workers AI is not configured for character portraits.');

    const fingerprint = await storyFingerprint(context);
    let row = await this.loadPortrait(plotId, fingerprint);
    if (row?.status === 'ready') return { ok: true, value: snapshot(row, true), replayed: true };
    if (row?.status === 'generating' && row.updated_at > this.clock() - GENERATION_LEASE_MS) {
      return { ok: true, value: snapshot(row, true), replayed: true };
    }

    const now = this.clock();
    const generationToken = crypto.randomUUID();
    try {
      if (!row) {
        await this.db
          .prepare(
            `INSERT OR IGNORE INTO character_portraits
               (plot_id, character_id, story_fingerprint, status, generation_token, provider, model, attempts, created_at, updated_at)
             VALUES (?, ?, ?, 'generating', ?, 'workers-ai', ?, 1, ?, ?)`,
          )
          .bind(plotId, context.character_id, fingerprint, generationToken, CHARACTER_PORTRAIT_MODEL, now, now)
          .run();
      } else {
        await this.db
          .prepare(
            `UPDATE character_portraits
             SET status = 'generating', generation_token = ?, attempts = attempts + 1, failure_code = NULL, updated_at = ?
             WHERE plot_id = ? AND story_fingerprint = ?
               AND (status IN ('stale', 'failed') OR (status = 'generating' AND updated_at <= ?))`,
          )
          .bind(generationToken, now, plotId, fingerprint, now - GENERATION_LEASE_MS)
          .run();
      }
    } catch {
      return persistence('Character portrait generation could not be claimed.');
    }

    row = await this.loadPortrait(plotId, fingerprint);
    if (!row) return persistence('Character portrait generation could not be claimed.');
    if (row.status === 'ready') return { ok: true, value: snapshot(row, true), replayed: true };
    if (row.status !== 'generating' || row.generation_token !== generationToken) {
      return { ok: true, value: snapshot(row, true), replayed: true };
    }

    const reference = await this.loadLatestReady(plotId);
    const referenceObject = reference?.object_key ? await this.bucket.get(reference.object_key) : null;
    const generated = await generatePortraitImage(this.ai, context, referenceObject);
    if (!generated.ok) {
      await this.fail(plotId, fingerprint, generationToken, generated.code);
      return generated.code === 'provider_unavailable'
        ? providerUnavailable('Character portrait provider is temporarily unavailable.')
        : { ok: false, error: { code: 'invalid_response', message: 'Character portrait provider returned invalid image bytes.' } };
    }
    const { image, model } = generated;

    const objectKey = `portraits/${plotId}/${fingerprint}/${generationToken}.${image.extension}`;
    try {
      await this.bucket.put(objectKey, image.bytes, { httpMetadata: { contentType: image.contentType } });
      const readyAt = this.clock();
      await this.db
        .prepare(
          `UPDATE character_portraits
           SET status = 'ready', generation_token = NULL, object_key = ?, model = ?, failure_code = NULL, ready_at = ?, updated_at = ?
           WHERE plot_id = ? AND story_fingerprint = ? AND status = 'generating' AND generation_token = ?`,
        )
        .bind(objectKey, model, readyAt, readyAt, plotId, fingerprint, generationToken)
        .run();
    } catch {
      await this.fail(plotId, fingerprint, generationToken, 'r2_write_failed');
      await this.safeDelete(objectKey);
      return persistence('Character portrait could not be stored privately.');
    }

    const ready = await this.loadPortrait(plotId, fingerprint);
    if (ready?.status === 'ready' && ready.object_key === objectKey) {
      return { ok: true, value: snapshot(ready, true), replayed: false };
    }
    await this.safeDelete(objectKey);
    return ready
      ? { ok: true, value: snapshot(ready, true), replayed: true }
      : persistence('Character portrait did not reach ready state.');
  }

  private async loadContext(userId: string, plotId: string): Promise<PortraitContextRow | null> {
    if (!userId.trim() || !plotId.trim()) return null;
    return this.db
      .prepare(
        `SELECT p.id AS plot_id, p.premise, p.mood, p.summary AS plot_summary,
                c.id AS character_id, c.name AS character_name, c.traits_json,
                e.episode_number, e.title AS episode_title, e.summary AS scene_summary,
                ec.label AS committed_choice_label, cc.intent AS committed_choice_intent,
                cc.consequence AS committed_consequence
         FROM plots p
         JOIN characters c ON c.plot_id = p.id AND c.role = 'protagonist'
         JOIN episodes e ON e.plot_id = p.id
         LEFT JOIN choice_commits cc ON cc.episode_id = e.id AND cc.plot_id = p.id
         LEFT JOIN episode_choices ec ON ec.id = cc.choice_id AND ec.episode_id = e.id
         WHERE p.id = ? AND p.user_id = ?
           AND e.episode_number = (SELECT MAX(e2.episode_number) FROM episodes e2 WHERE e2.plot_id = p.id)
         ORDER BY c.created_at, c.id LIMIT 1`,
      )
      .bind(plotId, userId)
      .first<PortraitContextRow>();
  }

  private loadPortrait(plotId: string, fingerprint: string): Promise<PortraitRow | null> {
    return this.db
      .prepare(
        `SELECT story_fingerprint, object_key, status, generation_token, attempts, updated_at, ready_at
         FROM character_portraits WHERE plot_id = ? AND story_fingerprint = ?`,
      )
      .bind(plotId, fingerprint)
      .first<PortraitRow>();
  }

  private loadLatestReady(plotId: string): Promise<PortraitRow | null> {
    return this.db
      .prepare(
        `SELECT story_fingerprint, object_key, status, generation_token, attempts, updated_at, ready_at
         FROM character_portraits WHERE plot_id = ? AND status = 'ready' AND object_key IS NOT NULL
         ORDER BY ready_at DESC, updated_at DESC LIMIT 1`,
      )
      .bind(plotId)
      .first<PortraitRow>();
  }

  private async fail(plotId: string, fingerprint: string, generationToken: string, code: string): Promise<void> {
    try {
      await this.db
        .prepare(
          `UPDATE character_portraits
           SET status = 'failed', generation_token = NULL, failure_code = ?, updated_at = ?
           WHERE plot_id = ? AND story_fingerprint = ? AND status = 'generating' AND generation_token = ?`,
        )
        .bind(code, this.clock(), plotId, fingerprint, generationToken)
        .run();
    } catch {
      // Failure metadata is diagnostic and must not affect the canonical story.
    }
  }

  private async safeDelete(objectKey: string): Promise<void> {
    try {
      await this.bucket.delete(objectKey);
    } catch {
      // Best-effort cleanup only; canonical story and the winning portrait row remain authoritative.
    }
  }
}

type GeneratedPortraitImage =
  | { ok: true; image: DecodedImage; model: string }
  | { ok: false; code: 'provider_unavailable' | 'invalid_response' };

async function generatePortraitImage(
  ai: Ai,
  context: PortraitContextRow,
  referenceObject: R2ObjectBody | null,
): Promise<GeneratedPortraitImage> {
  try {
    const form = new FormData();
    form.append('prompt', portraitPrompt(context, Boolean(referenceObject)));
    form.append('width', '480');
    form.append('height', '480');
    if (referenceObject) {
      const referenceBytes = await referenceObject.arrayBuffer();
      form.append(
        'input_image_0',
        new Blob([referenceBytes], { type: referenceObject.httpMetadata?.contentType ?? 'image/jpeg' }),
        'reference.jpg',
      );
    }
    const encoded = new Response(form);
    const body = encoded.body;
    const contentType = encoded.headers.get('content-type');
    if (!body || !contentType) throw new Error('Portrait multipart encoding failed.');
    const payload = await ai.run(CHARACTER_PORTRAIT_MODEL, {
      multipart: { body: body as unknown as object, contentType },
    });
    const image = decodedImageFromPayload(payload);
    if (image) return { ok: true, image, model: CHARACTER_PORTRAIT_MODEL };
  } catch {
    // The multi-reference partner model is best effort; a hosted fallback keeps portraits available.
  }

  try {
    const payload = await ai.run(CHARACTER_PORTRAIT_FALLBACK_MODEL, {
      prompt: portraitPrompt(context, false),
      steps: 4,
    });
    const image = decodedImageFromPayload(payload);
    return image
      ? { ok: true, image, model: CHARACTER_PORTRAIT_FALLBACK_MODEL }
      : { ok: false, code: 'invalid_response' };
  } catch {
    return { ok: false, code: 'provider_unavailable' };
  }
}

function portraitPrompt(context: PortraitContextRow, hasReference: boolean): string {
  const traits = compactTraits(context.traits_json);
  return [
    'Cinematic premium 3D anime character portrait for a mobile interactive drama app.',
    hasReference ? 'Use input image 0 as the identity reference. Preserve the same face, apparent age, hair, eye shape, and core visual identity while evolving wardrobe, expression, and lighting to match the current story.' : '',
    `Keep one consistent protagonist identity: ${context.character_name}.`,
    traits ? `Character traits: ${traits}.` : '',
    `Drama premise: ${context.premise}.`,
    `Current mood: ${context.mood}.`,
    `Current story development: ${context.scene_summary || context.plot_summary || context.episode_title}.`,
    branchContext(context),
    'Portrait framing from chest up, expressive eyes, believable wardrobe adapted to the current story, dramatic cinematic lighting, dark premium background.',
    'No text, no logo, no watermark, no UI, no collage, no extra people, no duplicated face.',
  ].filter(Boolean).join(' ' ).slice(0, 2000);
}

async function storyFingerprint(context: PortraitContextRow): Promise<string> {
  const payload = JSON.stringify({
    characterId: context.character_id,
    characterName: context.character_name,
    traits: compactTraits(context.traits_json),
    premise: context.premise,
    mood: context.mood,
    plotSummary: context.plot_summary,
    episodeNumber: context.episode_number,
    episodeTitle: context.episode_title,
    sceneSummary: context.scene_summary,
    committedChoice: context.committed_choice_label,
    committedIntent: context.committed_choice_intent,
    committedConsequence: context.committed_consequence,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest)).slice(0, 16).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function branchContext(context: PortraitContextRow): string {
  if (!context.committed_consequence) return '';
  const choice = context.committed_choice_label ? `Chosen branch: ${context.committed_choice_label}. ` : '';
  const intent = context.committed_choice_intent ? `Branch intent: ${context.committed_choice_intent}. ` : '';
  return `${choice}${intent}Immediate canonical consequence: ${context.committed_consequence}.`;
}

function compactTraits(raw: string): string {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return '';
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === 'string' && item.trim())
      .map(([key, item]) => `${key}: ${String(item).trim()}`)
      .join('; ')
      .slice(0, 500);
  } catch {
    return '';
  }
}

function snapshot(row: PortraitRow, current: boolean): CharacterPortraitSnapshot {
  return {
    status: row.status,
    current,
    attempts: row.attempts,
    updatedAt: row.updated_at,
    readyAt: row.ready_at,
  };
}

function notFound(): CharacterPortraitResult<never> {
  return { ok: false, error: { code: 'not_found', message: 'Drama not found.' } };
}

function providerUnavailable(message: string): CharacterPortraitResult<never> {
  return { ok: false, error: { code: 'provider_unavailable', message } };
}

function persistence(message: string): CharacterPortraitResult<never> {
  return { ok: false, error: { code: 'persistence_error', message } };
}
