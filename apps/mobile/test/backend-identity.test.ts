import { describe, expect, it, vi } from 'vitest';
import { loadBackendUserId } from '../src/features/auth/backend-identity';

describe('loadBackendUserId', () => {
  it('uses the current Clerk bearer token and returns only the backend internal user ID', async () => {
    const getToken = vi.fn(async () => 'fresh-session-token');
    const fetcher = vi.fn<TestFetch>(async () => Response.json({ user: { id: 'internal-user-123' } }));

    const id = await loadBackendUserId('https://api.living-plot.test/', getToken, fetcher);

    expect(id).toBe('internal-user-123');
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://api.living-plot.test/v1/me');
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer fresh-session-token');
  });

  it('fails closed when the token or backend identity is unavailable', async () => {
    await expect(loadBackendUserId('https://api.test', async () => null)).rejects.toThrow('session token');
    await expect(loadBackendUserId('https://api.test', async () => 'token', async () => Response.json({ user: {} })))
      .rejects.toThrow('identity response');
  });
});

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
