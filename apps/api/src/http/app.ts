import type { StoryGenerator } from '../ai/contracts';
import { createStoryGenerator } from '../ai/story-generator-factory';
import { D1AudioService } from '../audio/d1-audio-service';
import type { AudioAssetSnapshot, AudioQueue } from '../audio/contracts';
import { ClerkSessionVerifier } from '../auth/clerk-session-verifier';
import { D1EntitlementRepository } from '../billing/d1-entitlement-repository';
import type { EntitlementSnapshot, RevenueCatSubscriberProvider } from '../billing/contracts';
import { handleRevenueCatWebhookRequest } from '../billing/revenuecat-webhook-handler';
import type { SessionVerifier } from '../auth/session-verifier';
import type { AppEnv } from '../env';
import type { LiveStoryError, LiveStoryMood } from '../live-story/contracts';
import { LiveStoryService } from '../live-story/live-story-service';
import { D1StoryRepository } from '../persistence/d1-story-repository';
import { D1UserRepository } from '../persistence/d1-user-repository';

export interface RequestDependencies {
  sessionVerifier?: SessionVerifier;
  audioQueue?: AudioQueue;
  revenueCatSubscriberProvider?: RevenueCatSubscriberProvider;
  revenueCatWebhookClock?: () => number;
  storyGenerator?: StoryGenerator;
  storyClock?: () => number;
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
  if (route.kind === 'plot') return handlePlotRead(env, user.id, route.plotId);
  if (isStoryRoute(route)) return handleStoryRoute(request, env, user.id, route, dependencies);

  const entitlements = new D1EntitlementRepository(env.DB);
  if (route.kind === 'entitlement') {
    return json({ entitlement: clientEntitlement(await entitlements.getEntitlement(user.id)) });
  }

  const audio = new D1AudioService(env.DB, dependencies.audioQueue ?? env.TTS_QUEUE);
  if (route.kind === 'episode_audio') {
    const entitlement = await entitlements.getEntitlement(user.id);
    return handleAudioRequest(request, audio, user.id, route.episodeId, entitlement.tier);
  }
  return handleAudioRead(env, audio, user.id, route.assetId);
}

type StoryRoute =
  | { kind: 'story_home' }
  | { kind: 'story_collection' }
  | { kind: 'story_plot'; plotId: string }
  | { kind: 'story_generate'; plotId: string }
  | { kind: 'story_choice'; plotId: string; episodeId: string; choiceId: string };

type ProtectedRoute =
  | { kind: 'me' }
  | { kind: 'plot'; plotId: string }
  | { kind: 'entitlement' }
  | { kind: 'episode_audio'; episodeId: string }
  | { kind: 'audio'; assetId: string }
  | StoryRoute;

function matchProtectedRoute(pathname: string): ProtectedRoute | null {
  if (pathname === '/v1/me') return { kind: 'me' };
  if (pathname === '/v1/entitlement') return { kind: 'entitlement' };
  if (pathname === '/v1/story/home') return { kind: 'story_home' };
  if (pathname === '/v1/story/plots') return { kind: 'story_collection' };

  const storyChoice = matchIds(pathname, /^\/v1\/story\/plots\/([^/]+)\/episodes\/([^/]+)\/choices\/([^/]+)$/);
  if (storyChoice) return { kind: 'story_choice', plotId: storyChoice[0], episodeId: storyChoice[1], choiceId: storyChoice[2] };
  const storyGenerate = matchId(pathname, /^\/v1\/story\/plots\/([^/]+)\/episodes$/);
  if (storyGenerate) return { kind: 'story_generate', plotId: storyGenerate };
  const storyPlot = matchId(pathname, /^\/v1\/story\/plots\/([^/]+)$/);
  if (storyPlot) return { kind: 'story_plot', plotId: storyPlot };
  const plot = matchId(pathname, /^\/v1\/plots\/([^/]+)$/);
  if (plot) return { kind: 'plot', plotId: plot };
  const episodeAudio = matchId(pathname, /^\/v1\/episodes\/([^/]+)\/audio$/);
  if (episodeAudio) return { kind: 'episode_audio', episodeId: episodeAudio };
  const audio = matchId(pathname, /^\/v1\/audio\/([^/]+)$/);
  if (audio) return { kind: 'audio', assetId: audio };
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
  if (route.kind === 'episode_audio' || route.kind === 'story_collection' || route.kind === 'story_generate' || route.kind === 'story_choice') {
    return method === 'POST';
  }
  return method === 'GET';
}

function isStoryRoute(route: ProtectedRoute): route is StoryRoute {
  return route.kind.startsWith('story_');
}

async function handleStoryRoute(
  request: Request,
  env: AppEnv,
  userId: string,
  route: StoryRoute,
  dependencies: RequestDependencies,
): Promise<Response> {
  const service = new LiveStoryService(
    env.DB,
    dependencies.storyGenerator ?? createStoryGenerator(env),
    dependencies.storyClock,
  );
  if (route.kind === 'story_home') return liveStoryResponse(await service.loadHome(userId), 'home');
  if (route.kind === 'story_plot') return liveStoryResponse(await service.loadPlot(userId, route.plotId), 'story');
  if (route.kind === 'story_choice') {
    return liveStoryResponse(await service.commitChoice({ userId, plotId: route.plotId, episodeId: route.episodeId, choiceId: route.choiceId }), 'story');
  }

  const body = await parseJsonObject(request);
  if (!body) return json({ error: 'invalid_request' }, 400);
  if (route.kind === 'story_generate') {
    if (typeof body.generationKey !== 'string') return json({ error: 'invalid_request' }, 400);
    return liveStoryResponse(await service.generateNext({ userId, plotId: route.plotId, generationKey: body.generationKey }), 'story');
  }

  if (
    typeof body.creationKey !== 'string' ||
    typeof body.generationKey !== 'string' ||
    typeof body.premise !== 'string' ||
    typeof body.characterName !== 'string' ||
    typeof body.locale !== 'string' ||
    !isLiveStoryMood(body.mood)
  ) {
    return json({ error: 'invalid_request' }, 400);
  }
  const result = await service.createPlot({
    userId,
    creationKey: body.creationKey,
    generationKey: body.generationKey,
    premise: body.premise,
    mood: body.mood,
    characterName: body.characterName,
    locale: body.locale,
  });
  if (!result.ok) return liveStoryErrorResponse(result.error);
  return json({ story: result.value.story }, result.value.created ? 201 : 200);
}

async function parseJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isLiveStoryMood(value: unknown): value is LiveStoryMood {
  return value === 'tense' || value === 'romantic' || value === 'mysterious' || value === 'hopeful';
}

function liveStoryResponse<T>(result: { ok: true; value: T } | { ok: false; error: LiveStoryError }, key: 'home' | 'story'): Response {
  if (!result.ok) return liveStoryErrorResponse(result.error);
  return json({ [key]: result.value });
}

function liveStoryErrorResponse(error: LiveStoryError): Response {
  if (error.code === 'invalid_input') return json({ error: error.code }, 400);
  if (error.code === 'not_found') return json({ error: error.code }, 404);
  if (error.code === 'quota_exceeded') {
    return json({ error: error.code, limit: error.limit, utcDay: error.utcDay, resetAt: error.utcDay ? nextUtcReset(error.utcDay) : undefined }, 429);
  }
  if (error.code === 'provider_unavailable') return json({ error: error.code }, 503);
  if (error.code === 'invalid_generation') return json({ error: error.code }, 502);
  if (error.code === 'persistence_error') return json({ error: 'internal_error' }, 500);
  return json({
    error: error.code,
    currentStateVersion: error.currentStateVersion,
    committedChoiceId: error.committedChoiceId,
  }, 409);
}

async function handlePlotRead(env: AppEnv, userId: string, plotId: string): Promise<Response> {
  const stories = new D1StoryRepository(env.DB);
  const memory = await stories.loadOwnedPlotMemory(userId, plotId);
  if (!memory) return json({ error: 'not_found' }, 404);

  return json({
    plot: {
      id: memory.id,
      status: memory.status,
      summary: memory.summary,
      version: memory.version,
      nextEpisodeNumber: memory.nextEpisodeNumber,
      state: memory.state,
      characters: memory.characters,
    },
  });
}

async function handleAudioRequest(
  request: Request,
  audio: D1AudioService,
  userId: string,
  episodeId: string,
  tier: 'free' | 'plus',
): Promise<Response> {
  let body: { voiceVariant?: unknown; reservationKey?: unknown };
  try {
    body = (await request.json()) as { voiceVariant?: unknown; reservationKey?: unknown };
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  if (typeof body.voiceVariant !== 'string' || typeof body.reservationKey !== 'string') {
    return json({ error: 'invalid_request' }, 400);
  }

  const result = await audio.request({
    userId,
    episodeId,
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
    { audio: clientAudio(result.value) },
    result.value.status === 'ready' ? 200 : 202,
  );
}

async function handleAudioRead(
  env: AppEnv,
  audio: D1AudioService,
  userId: string,
  assetId: string,
): Promise<Response> {
  const asset = await audio.getOwnedAsset(userId, assetId);
  if (!asset) return json({ error: 'not_found' }, 404);
  if (asset.status !== 'ready' || !asset.objectKey) {
    return json({ audio: clientAudio(asset) }, 202);
  }

  const object = await env.AUDIO_BUCKET.get(asset.objectKey);
  if (!object) return json({ error: 'audio_unavailable' }, 503);

  const headers = new Headers({
    'Cache-Control': 'private, max-age=3600',
    'Content-Type': object.httpMetadata?.contentType ?? 'audio/mpeg',
  });
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

function clientEntitlement(entitlement: EntitlementSnapshot) {
  return {
    tier: entitlement.tier,
    plusActive: entitlement.tier === 'plus',
    expiresAt: entitlement.plusExpiresAt === null ? null : new Date(entitlement.plusExpiresAt).toISOString(),
    syncedAt: entitlement.syncedAt === 0 ? null : new Date(entitlement.syncedAt).toISOString(),
  };
}

function clientAudio(asset: AudioAssetSnapshot) {
  return {
    id: asset.id,
    episodeId: asset.episodeId,
    voiceVariant: asset.voiceVariant,
    status: asset.status,
    inputCharacters: asset.inputCharacters,
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
  return response;
}
