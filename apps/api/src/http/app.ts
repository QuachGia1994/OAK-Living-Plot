import type { SceneGenerator } from '../ai/contracts';
import { D1AccountService } from '../account/d1-account-service';
import { createSceneGenerator } from '../ai/scene-generator-factory';
import { D1AudioService } from '../audio/d1-audio-service';
import type { AudioQueue, MediaAsset } from '../audio/contracts';
import { ClerkSessionVerifier } from '../auth/clerk-session-verifier';
import { D1EntitlementRepository } from '../billing/d1-entitlement-repository';
import type { EntitlementSnapshot, RevenueCatSubscriberProvider } from '../billing/contracts';
import { handleRevenueCatWebhookRequest } from '../billing/revenuecat-webhook-handler';
import type { SessionVerifier } from '../auth/session-verifier';
import type { AppEnv } from '../env';
import type { DramaMood } from '../domain/drama';
import type { DramaError } from '../drama-runtime/contracts';
import { DramaService } from '../drama-runtime/drama-service';
import { D1UserRepository } from '../persistence/d1-user-repository';
import { D1CharacterPortraitService } from '../portrait/d1-character-portrait-service';
import { isDramaLocale, isNarratorVariant, isUiLocale } from '../preferences/contracts';
import { quotaModeFromEnv } from '../quota/policy';
import { D1VoiceQuota } from '../quota/voice-quota';
import { D1ReferralService } from '../referrals/d1-referral-service';
import { D1UserPreferencesRepository } from '../preferences/d1-user-preferences';
import { CloudflareProductTelemetrySink } from '../telemetry/cloudflare-product-telemetry';
import type { ProductTelemetrySink } from '../telemetry/product-events';

const MAX_JSON_BODY_CHARACTERS = 16_384;

export interface RequestDependencies {
  sessionVerifier?: SessionVerifier;
  audioQueue?: AudioQueue;
  revenueCatSubscriberProvider?: RevenueCatSubscriberProvider;
  revenueCatWebhookClock?: () => number;
  sceneGenerator?: SceneGenerator;
  dramaClock?: () => number;
  productTelemetry?: ProductTelemetrySink;
}

export async function handleRequest(
  request: Request,
  env: AppEnv,
  dependencies: RequestDependencies = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ service: 'living-plot-api', status: 'ok' });
  }
  if (url.pathname === '/v1/webhooks/revenuecat') {
    return handleRevenueCatWebhookRequest(request, env, {
      subscriberProvider: dependencies.revenueCatSubscriberProvider,
      clock: dependencies.revenueCatWebhookClock,
    });
  }

  const route = matchProtectedRoute(url.pathname);
  if (!route) return json({ error: 'not_found' }, 404);
  if (!methodAllowed(route, request.method)) return json({ error: 'method_not_allowed' }, 405);
  if (requestBodyTooLarge(request)) return json({ error: 'payload_too_large' }, 413);

  let principal;
  try {
    const verifier = dependencies.sessionVerifier ?? new ClerkSessionVerifier(env);
    principal = await verifier.authenticate(request);
  } catch {
    return json({ error: 'auth_unavailable' }, 503);
  }
  if (!principal) return unauthorized();

  const users = new D1UserRepository(env.DB);
  let user;
  try {
    user = await users.resolveOrCreate(principal.subject);
  } catch {
    return json({ error: 'internal_error' }, 500);
  }

  if (route.kind === 'me') return json({ user: { id: user.id } });
  if (route.kind === 'preferences') return handlePreferences(request, env.DB, user.id);
  if (route.kind === 'referral') return handleReferral(request, env.DB, user.id);
  if (route.kind === 'referral_claim') return handleReferralClaim(request, env.DB, user.id);
  if (route.kind === 'account_export') {
    const account = new D1AccountService(env.DB, env.AUDIO_BUCKET, dependencies.dramaClock);
    const snapshot = await account.export(user.id);
    return json({ export: url.searchParams.get('schema') === '3' ? snapshot : legacyAccountExportV2(snapshot) });
  }
  if (route.kind === 'account_delete') return handleAccountDelete(request, env, user.id, dependencies.dramaClock);
  if (route.kind === 'drama_portrait_status') return handlePortraitStatus(env, user.id, route.dramaId);
  if (route.kind === 'drama_portrait') return handlePortrait(request, env, user.id, route.dramaId);
  if (isDramaRoute(route)) return handleDramaRoute(request, env, user.id, route, dependencies);

  const entitlements = new D1EntitlementRepository(env.DB);
  if (route.kind === 'entitlement') {
    return json({ entitlement: clientEntitlement(await entitlements.getEntitlement(user.id)) });
  }

  const productTelemetry = dependencies.productTelemetry ?? new CloudflareProductTelemetrySink(env.ANALYTICS);
  const audio = new D1AudioService(
    env.DB,
    dependencies.audioQueue ?? env.TTS_QUEUE,
    new D1VoiceQuota(env.DB, dependencies.dramaClock ?? Date.now, quotaModeFromEnv(env.QUOTA_MODE)),
    productTelemetry,
  );
  if (route.kind === 'scene_voice') {
    const entitlement = await entitlements.getEntitlement(user.id);
    return handleVoiceRequest(request, audio, user.id, route.sceneId, entitlement.tier);
  }
  if (route.kind === 'media_status') return handleMediaStatus(audio, user.id, route.assetId);
  return handleMediaRead(env, audio, user.id, route.assetId);
}

type DramaRoute =
  | { kind: 'drama_home' }
  | { kind: 'drama_library' }
  | { kind: 'drama_collection' }
  | { kind: 'drama'; dramaId: string }
  | { kind: 'drama_history'; dramaId: string }
  | { kind: 'drama_archive'; dramaId: string }
  | { kind: 'drama_restore'; dramaId: string }
  | { kind: 'drama_generate'; dramaId: string }
  | { kind: 'drama_choice'; dramaId: string; sceneId: string; choiceId: string };

type ProtectedRoute =
  | { kind: 'me' }
  | { kind: 'entitlement' }
  | { kind: 'preferences' }
  | { kind: 'referral' }
  | { kind: 'referral_claim' }
  | { kind: 'account_export' }
  | { kind: 'account_delete' }
  | { kind: 'scene_voice'; sceneId: string }
  | { kind: 'media_status'; assetId: string }
  | { kind: 'media'; assetId: string }
  | { kind: 'drama_portrait_status'; dramaId: string }
  | { kind: 'drama_portrait'; dramaId: string }
  | DramaRoute;

function matchProtectedRoute(pathname: string): ProtectedRoute | null {
  if (pathname === '/v1/me') return { kind: 'me' };
  if (pathname === '/v1/entitlement') return { kind: 'entitlement' };
  if (pathname === '/v1/preferences') return { kind: 'preferences' };
  if (pathname === '/v1/referrals/me') return { kind: 'referral' };
  if (pathname === '/v1/referrals/claim') return { kind: 'referral_claim' };
  if (pathname === '/v1/account/export') return { kind: 'account_export' };
  if (pathname === '/v1/account/delete') return { kind: 'account_delete' };
  if (pathname === '/v1/dramas/home') return { kind: 'drama_home' };
  if (pathname === '/v1/dramas/library') return { kind: 'drama_library' };
  if (pathname === '/v1/dramas') return { kind: 'drama_collection' };

  const portraitStatus = matchId(pathname, /^\/v1\/dramas\/([^/]+)\/portrait\/status$/);
  if (portraitStatus) return { kind: 'drama_portrait_status', dramaId: portraitStatus };
  const portrait = matchId(pathname, /^\/v1\/dramas\/([^/]+)\/portrait$/);
  if (portrait) return { kind: 'drama_portrait', dramaId: portrait };

  const dramaChoice = matchIds(pathname, /^\/v1\/dramas\/([^/]+)\/scenes\/([^/]+)\/choices\/([^/]+)$/);
  if (dramaChoice) return { kind: 'drama_choice', dramaId: dramaChoice[0], sceneId: dramaChoice[1], choiceId: dramaChoice[2] };
  const dramaGenerate = matchId(pathname, /^\/v1\/dramas\/([^/]+)\/scenes$/);
  if (dramaGenerate) return { kind: 'drama_generate', dramaId: dramaGenerate };
  const dramaHistory = matchId(pathname, /^\/v1\/dramas\/([^/]+)\/history$/);
  if (dramaHistory) return { kind: 'drama_history', dramaId: dramaHistory };
  const dramaArchive = matchId(pathname, /^\/v1\/dramas\/([^/]+)\/archive$/);
  if (dramaArchive) return { kind: 'drama_archive', dramaId: dramaArchive };
  const dramaRestore = matchId(pathname, /^\/v1\/dramas\/([^/]+)\/restore$/);
  if (dramaRestore) return { kind: 'drama_restore', dramaId: dramaRestore };
  const drama = matchId(pathname, /^\/v1\/dramas\/([^/]+)$/);
  if (drama) return { kind: 'drama', dramaId: drama };
  const sceneVoice = matchId(pathname, /^\/v1\/scenes\/([^/]+)\/voice$/);
  if (sceneVoice) return { kind: 'scene_voice', sceneId: sceneVoice };
  const mediaStatus = matchId(pathname, /^\/v1\/media\/([^/]+)\/status$/);
  if (mediaStatus) return { kind: 'media_status', assetId: mediaStatus };
  const media = matchId(pathname, /^\/v1\/media\/([^/]+)$/);
  if (media) return { kind: 'media', assetId: media };
  return null;
}

function matchId(pathname: string, pattern: RegExp): string | null {
  const match = pattern.exec(pathname);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]).trim();
    return value || null;
  } catch {
    return null;
  }
}

function matchIds(pathname: string, pattern: RegExp): [string, string, string] | null {
  const match = pattern.exec(pathname);
  if (!match) return null;
  try {
    const values = match.slice(1, 4).map((value) => decodeURIComponent(value).trim());
    return values.every(Boolean) ? values as [string, string, string] : null;
  } catch {
    return null;
  }
}

function methodAllowed(route: ProtectedRoute, method: string): boolean {
  if (route.kind === 'preferences') return method === 'GET' || method === 'POST';
  if (route.kind === 'referral') return method === 'GET';
  if (route.kind === 'referral_claim') return method === 'POST';
  if (route.kind === 'drama_portrait_status') return method === 'GET';
  if (route.kind === 'drama_portrait') return method === 'GET' || method === 'POST';
  if (
    route.kind === 'scene_voice' || route.kind === 'drama_collection' || route.kind === 'drama_generate' ||
    route.kind === 'drama_choice' || route.kind === 'drama_archive' || route.kind === 'drama_restore' ||
    route.kind === 'account_delete'
  ) {
    return method === 'POST';
  }
  return method === 'GET';
}

function isDramaRoute(route: ProtectedRoute): route is DramaRoute {
  return route.kind === 'drama' || route.kind === 'drama_home' || route.kind === 'drama_library' ||
    route.kind === 'drama_collection' || route.kind === 'drama_history' || route.kind === 'drama_archive' ||
    route.kind === 'drama_restore' || route.kind === 'drama_generate' || route.kind === 'drama_choice';
}

async function handleDramaRoute(
  request: Request,
  env: AppEnv,
  userId: string,
  route: DramaRoute,
  dependencies: RequestDependencies,
): Promise<Response> {
  const service = new DramaService(
    env.DB,
    dependencies.sceneGenerator ?? createSceneGenerator(env),
    dependencies.dramaClock,
    dependencies.productTelemetry ?? new CloudflareProductTelemetrySink(env.ANALYTICS),
    quotaModeFromEnv(env.QUOTA_MODE),
  );
  if (route.kind === 'drama_home') return dramaResponse(await service.loadHome(userId), 'home');
  if (route.kind === 'drama_library') return dramaResponse(await service.loadLibrary(userId), 'library');
  if (route.kind === 'drama') return dramaResponse(await service.loadDrama(userId, route.dramaId), 'drama');
  if (route.kind === 'drama_history') return dramaResponse(await service.loadHistory(userId, route.dramaId), 'history');
  if (route.kind === 'drama_archive') return dramaResponse(await service.archiveDrama(userId, route.dramaId), 'dramaSummary');
  if (route.kind === 'drama_restore') return dramaResponse(await service.restoreDrama(userId, route.dramaId), 'dramaSummary');
  if (route.kind === 'drama_choice') {
    return dramaResponse(await service.commitChoice({ userId, dramaId: route.dramaId, sceneId: route.sceneId, choiceId: route.choiceId }), 'drama');
  }

  const body = await parseJsonObject(request);
  if (!body) return json({ error: 'invalid_request' }, 400);
  if (route.kind === 'drama_generate') {
    if (typeof body.generationKey !== 'string') return json({ error: 'invalid_request' }, 400);
    return dramaResponse(await service.generateNext({ userId, dramaId: route.dramaId, generationKey: body.generationKey }), 'drama');
  }

  if (
    typeof body.creationKey !== 'string' ||
    typeof body.generationKey !== 'string' ||
    typeof body.premise !== 'string' ||
    typeof body.characterName !== 'string' ||
    !isDramaLocale(body.locale) ||
    !isDramaMood(body.mood)
  ) {
    return json({ error: 'invalid_request' }, 400);
  }
  const result = await service.createDrama({
    userId,
    creationKey: body.creationKey,
    generationKey: body.generationKey,
    premise: body.premise,
    mood: body.mood,
    characterName: body.characterName,
    locale: body.locale,
  });
  if (!result.ok) return dramaErrorResponse(result.error);
  return json({ drama: result.value.drama }, result.value.created ? 201 : 200);
}

async function parseJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await request.text();
    if (raw.length > MAX_JSON_BODY_CHARACTERS) return null;
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function requestBodyTooLarge(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) return false;
  const parsed = Number(contentLength);
  return Number.isFinite(parsed) && parsed > MAX_JSON_BODY_CHARACTERS;
}

function isDramaMood(value: unknown): value is DramaMood {
  return value === 'tense' || value === 'romantic' || value === 'mysterious' || value === 'hopeful';
}

function dramaResponse<T>(
  result: { ok: true; value: T } | { ok: false; error: DramaError },
  key: 'home' | 'drama' | 'library' | 'history' | 'dramaSummary',
): Response {
  if (!result.ok) return dramaErrorResponse(result.error);
  return json({ [key]: result.value });
}

function dramaErrorResponse(error: DramaError): Response {
  if (error.code === 'invalid_input') return json({ error: error.code }, 400);
  if (error.code === 'not_found') return json({ error: error.code }, 404);
  if (error.code === 'quota_exceeded') {
    return json({ error: error.code, limit: error.limit, utcDay: error.utcDay, resetAt: error.utcDay ? nextUtcReset(error.utcDay) : undefined }, 429);
  }
  if (error.code === 'provider_unavailable') return json({ error: error.code, providerStatus: error.providerStatus }, 503);
  if (error.code === 'invalid_generation') return json({ error: error.code }, 502);
  if (error.code === 'persistence_error') return json({ error: 'internal_error' }, 500);
  return json({
    error: error.code,
    currentStateVersion: error.currentStateVersion,
    committedChoiceId: error.committedChoiceId,
  }, 409);
}

async function handlePortraitStatus(env: AppEnv, userId: string, dramaId: string): Promise<Response> {
  const result = await new D1CharacterPortraitService(env.DB, env.AUDIO_BUCKET, env.AI).status(userId, dramaId);
  if (!result.ok) return result.error.code === 'not_found' ? json({ error: 'not_found' }, 404) : json({ error: 'internal_error' }, 500);
  return json({ portrait: clientPortrait(result.value) });
}

async function handlePortrait(request: Request, env: AppEnv, userId: string, dramaId: string): Promise<Response> {
  const service = new D1CharacterPortraitService(env.DB, env.AUDIO_BUCKET, env.AI);
  if (request.method === 'POST') {
    const generated = await service.generate(userId, dramaId);
    if (!generated.ok) {
      if (generated.error.code === 'not_found') return json({ error: 'not_found' }, 404);
      if (generated.error.code === 'provider_unavailable') return json({ error: 'provider_unavailable' }, 503);
      if (generated.error.code === 'invalid_response') return json({ error: 'invalid_generation' }, 502);
      return json({ error: 'internal_error' }, 500);
    }
    return json({ portrait: clientPortrait(generated.value), replayed: generated.replayed ?? false });
  }

  const delivery = await service.delivery(userId, dramaId);
  if (!delivery.ok) return delivery.error.code === 'not_found' ? json({ error: 'not_found' }, 404) : json({ error: 'internal_error' }, 500);
  if (!delivery.value.objectKey) return json({ portrait: clientPortrait(delivery.value.snapshot) }, 202);
  const object = await env.AUDIO_BUCKET.get(delivery.value.objectKey);
  if (!object) return json({ error: 'portrait_unavailable' }, 503);
  const headers = new Headers({
    'Cache-Control': 'private, max-age=3600',
    'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
  });
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { status: 200, headers });
}

function clientPortrait(value: { status: string; current: boolean; attempts: number; updatedAt: number | null; readyAt: number | null }) {
  return {
    status: value.status,
    current: value.current,
    attempts: value.attempts,
    updatedAt: value.updatedAt === null ? null : new Date(value.updatedAt).toISOString(),
    readyAt: value.readyAt === null ? null : new Date(value.readyAt).toISOString(),
  };
}

async function handleReferral(request: Request, db: D1Database, userId: string): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  try {
    return json({ referral: await new D1ReferralService(db).snapshot(userId) });
  } catch {
    return json({ error: 'internal_error' }, 500);
  }
}

async function handleReferralClaim(request: Request, db: D1Database, userId: string): Promise<Response> {
  const body = await parseJsonObject(request);
  if (!body || typeof body.code !== 'string') return json({ error: 'invalid_request' }, 400);
  const entitlement = await new D1EntitlementRepository(db).getEntitlement(userId);
  if (entitlement.tier === 'plus') return json({ error: 'plus_already_active' }, 409);
  const result = await new D1ReferralService(db).claim(userId, body.code);
  if (result.ok) return json({ referral: result.value, replayed: result.replayed });
  if (result.error.code === 'invalid_input' || result.error.code === 'self_referral') return json({ error: result.error.code }, 400);
  if (result.error.code === 'not_found') return json({ error: result.error.code }, 404);
  if (result.error.code === 'already_claimed') return json({ error: result.error.code }, 409);
  return json({ error: 'internal_error' }, 500);
}

async function handlePreferences(request: Request, db: D1Database, userId: string): Promise<Response> {
  const preferences = new D1UserPreferencesRepository(db);
  if (request.method === 'GET') return json({ preferences: await preferences.get(userId) });
  const body = await parseJsonObject(request);
  if (!body || !isUiLocale(body.uiLocale) || !isDramaLocale(body.dramaLocale) || !isNarratorVariant(body.narratorVariant)) {
    return json({ error: 'invalid_request' }, 400);
  }
  return json({
    preferences: await preferences.set(userId, {
      uiLocale: body.uiLocale,
      dramaLocale: body.dramaLocale,
      narratorVariant: body.narratorVariant,
    }),
  });
}

async function handleAccountDelete(
  request: Request,
  env: AppEnv,
  userId: string,
  clock?: () => number,
): Promise<Response> {
  const body = await parseJsonObject(request);
  if (!body || typeof body.confirmation !== 'string') return json({ error: 'invalid_request' }, 400);
  const account = new D1AccountService(env.DB, env.AUDIO_BUCKET, clock);
  const result = await account.delete(userId, body.confirmation);
  if (result.ok) return json({ deleted: true });
  if (result.code === 'invalid_confirmation') return json({ error: result.code }, 400);
  if (result.code === 'audio_cleanup_failed') return json({ error: result.code }, 503);
  return json({ error: 'internal_error' }, 500);
}

async function handleVoiceRequest(
  request: Request,
  audio: D1AudioService,
  userId: string,
  sceneId: string,
  tier: 'free' | 'plus',
): Promise<Response> {
  const body = await parseJsonObject(request);
  if (!body || typeof body.voiceVariant !== 'string' || typeof body.reservationKey !== 'string') {
    return json({ error: 'invalid_request' }, 400);
  }

  const result = await audio.request({
    userId,
    sceneId,
    voiceVariant: body.voiceVariant,
    reservationKey: body.reservationKey,
    tier,
  });
  if (!result.ok) {
    if (result.error.code === 'invalid_input') return json({ error: result.error.code }, 400);
    if (result.error.code === 'not_found') return json({ error: result.error.code }, 404);
    if (result.error.code === 'quota_exceeded') {
      return json(
        {
          error: result.error.code,
          limit: result.error.limit,
          utcDay: result.error.utcDay,
          resetAt: nextUtcReset(result.error.utcDay),
        },
        429,
      );
    }
    if (result.error.code === 'queue_unavailable') return json({ error: result.error.code }, 503);
    return json({ error: 'internal_error' }, 500);
  }

  return json(
    { media: clientMedia(result.value) },
    result.value.status === 'ready' ? 200 : 202,
  );
}

async function handleMediaStatus(
  audio: D1AudioService,
  userId: string,
  assetId: string,
): Promise<Response> {
  const asset = await audio.getOwnedMediaAsset(userId, assetId);
  return asset ? json({ media: clientMedia(asset) }) : json({ error: 'not_found' }, 404);
}

async function handleMediaRead(
  env: AppEnv,
  audio: D1AudioService,
  userId: string,
  assetId: string,
): Promise<Response> {
  const delivery = await audio.getOwnedDeliveryAsset(userId, assetId);
  if (!delivery) return json({ error: 'not_found' }, 404);
  if (delivery.persistenceStatus !== 'ready' || !delivery.objectKey) {
    return json({ media: clientMedia(delivery.media) }, 202);
  }

  const object = await env.AUDIO_BUCKET.get(delivery.objectKey);
  if (!object) return json({ error: 'audio_unavailable' }, 503);

  const headers = new Headers({
    'Cache-Control': 'private, max-age=3600',
    'Content-Type': object.httpMetadata?.contentType ?? 'audio/mpeg',
  });
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

function legacyAccountExportV2(snapshot: Awaited<ReturnType<D1AccountService['export']>>) {
  return {
    schemaVersion: 2 as const,
    exportedAt: snapshot.exportedAt,
    preferences: snapshot.preferences,
    entitlement: snapshot.entitlement,
    usage: snapshot.usage,
    dramas: snapshot.dramas.map((drama) => ({
      title: drama.title,
      premise: drama.premise,
      status: drama.status,
      locale: drama.locale,
      mood: drama.mood,
      summary: drama.summary,
      characters: drama.characters,
      scenes: drama.scenes,
    })),
  };
}

function clientEntitlement(entitlement: EntitlementSnapshot) {
  return {
    tier: entitlement.tier,
    plusActive: entitlement.tier === 'plus',
    expiresAt: entitlement.plusExpiresAt === null ? null : new Date(entitlement.plusExpiresAt).toISOString(),
    syncedAt: entitlement.syncedAt === 0 ? null : new Date(entitlement.syncedAt).toISOString(),
  };
}

function clientMedia(asset: MediaAsset) {
  return {
    id: asset.id,
    sceneId: asset.sceneId,
    kind: asset.kind,
    variant: asset.variant,
    status: asset.status,
    attempts: asset.attempts,
    cached: asset.cached,
    failureCode: asset.failureCode,
  };
}

function nextUtcReset(utcDay: string): string {
  const value = new Date(`${utcDay}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}

function unauthorized(): Response {
  const response = json({ error: 'unauthorized' }, 401);
  response.headers.set('WWW-Authenticate', 'Bearer');
  return response;
}

function json(body: unknown, status = 200): Response {
  const response = Response.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
