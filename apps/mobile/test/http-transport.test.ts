import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedJsonTransport, HttpTransportError } from '../src/lib/http-transport';

describe('AuthenticatedJsonTransport', () => {
  it('retries a safe GET once with a fresh bearer token', async () => {
    const tokens = ['token-one', 'token-two'];
    const getToken = vi.fn(async () => tokens.shift() ?? null);
    let attempt = 0;
    const fetcher = vi.fn<TestFetch>(async (_input, init) => {
      attempt += 1;
      if (attempt === 1) throw new Error('offline once');
      return Response.json({ ok: true });
    });
    const transport = new AuthenticatedJsonTransport('https://api.test', getToken, fetcher, 100);

    const response = await transport.request('/v1/me', 'GET');

    expect(response.ok).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token-one');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer token-two');
  });

  it('retries one 5xx GET but never retries a POST transport failure', async () => {
    let reads = 0;
    const readFetcher = vi.fn<TestFetch>(async () => {
      reads += 1;
      return reads === 1 ? Response.json({ error: 'temporary' }, { status: 503 }) : Response.json({ value: 'ready' });
    });
    const readTransport = new AuthenticatedJsonTransport('https://api.test', async () => 'token', readFetcher, 100);
    const read = await readTransport.request('/v1/story/home', 'GET');
    expect(read.status).toBe(200);
    expect(readFetcher).toHaveBeenCalledTimes(2);

    const writeFetcher = vi.fn<TestFetch>(async () => { throw new Error('response lost'); });
    const writeTransport = new AuthenticatedJsonTransport('https://api.test', async () => 'token', writeFetcher, 100);
    await expect(writeTransport.request('/v1/story/plots', 'POST', { creationKey: 'stable' })).rejects.toMatchObject({ code: 'network' });
    expect(writeFetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts a hanging request at the configured timeout', async () => {
    const fetcher = vi.fn<TestFetch>(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const transport = new AuthenticatedJsonTransport('https://api.test', async () => 'token', fetcher, 5);

    await expect(transport.request('/v1/story/plots', 'POST', {})).rejects.toEqual(
      new HttpTransportError('timeout', 'The request timed out.'),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
