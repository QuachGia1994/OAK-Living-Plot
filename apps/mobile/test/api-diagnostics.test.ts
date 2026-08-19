import { describe, expect, it, vi } from 'vitest';
import { probeAuthenticatedApi } from '../src/features/auth/api-diagnostics';

describe('authenticated API diagnostics', () => {
  it('reports a healthy authenticated /v1/me without exposing the bearer value', async () => {
    const fetcher = vi.fn<TestFetch>(async () => Response.json({ user: { id: 'internal-user' } }));
    const diagnostic = await probeAuthenticatedApi('https://api.test', async () => 'secret-session-token', fetcher);

    expect(diagnostic).toEqual({ tokenPresent: true, httpStatus: 200, reason: 'ok' });
    expect(JSON.stringify(diagnostic)).not.toContain('secret-session-token');
  });

  it('normalizes 401 and 503 authentication failures', async () => {
    const unauthorized = await probeAuthenticatedApi(
      'https://api.test',
      async () => 'token',
      async () => Response.json({ error: 'unauthorized' }, { status: 401 }),
    );
    const unavailable = await probeAuthenticatedApi(
      'https://api.test',
      async () => 'token',
      async () => Response.json({ error: 'auth_unavailable' }, { status: 503 }),
    );

    expect(unauthorized).toEqual({ tokenPresent: true, httpStatus: 401, reason: 'auth_rejected' });
    expect(unavailable).toEqual({ tokenPresent: true, httpStatus: 503, reason: 'auth_unavailable' });
  });

  it('reports token absence without performing a network request', async () => {
    const fetcher = vi.fn<TestFetch>();
    const diagnostic = await probeAuthenticatedApi('https://api.test', async () => null, fetcher);

    expect(diagnostic).toEqual({ tokenPresent: false, httpStatus: null, reason: 'token_unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
