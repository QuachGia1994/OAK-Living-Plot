import { ClerkSessionVerifier } from '../auth/clerk-session-verifier';
import type { SessionVerifier } from '../auth/session-verifier';
import type { AppEnv } from '../env';
import { D1StoryRepository } from '../persistence/d1-story-repository';
import { D1UserRepository } from '../persistence/d1-user-repository';

export interface RequestDependencies {
  sessionVerifier?: SessionVerifier;
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

  const route = matchProtectedRoute(url.pathname);
  if (!route) return json({ error: 'not_found' }, 404);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

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

  if (route.kind === 'me') {
    return json({ user: { id: user.id } });
  }

  const stories = new D1StoryRepository(env.DB);
  const memory = await stories.loadOwnedPlotMemory(user.id, route.plotId);
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

type ProtectedRoute = { kind: 'me' } | { kind: 'plot'; plotId: string };

function matchProtectedRoute(pathname: string): ProtectedRoute | null {
  if (pathname === '/v1/me') return { kind: 'me' };

  const match = /^\/v1\/plots\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  try {
    const plotId = decodeURIComponent(match[1]).trim();
    return plotId ? { kind: 'plot', plotId } : null;
  } catch {
    return null;
  }
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
