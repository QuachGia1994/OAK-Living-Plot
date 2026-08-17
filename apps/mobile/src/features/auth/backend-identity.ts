import { AuthenticatedJsonTransport, HttpTransportError, type FetchLike, type JsonHttpResponse, type TokenProvider } from '../../lib/http-transport';

export type { TokenProvider } from '../../lib/http-transport';

export async function loadBackendUserId(
  apiBaseUrl: string,
  tokenProvider: TokenProvider,
  fetcher: FetchLike = fetch,
  timeoutMs = 12_000,
): Promise<string> {
  const transport = new AuthenticatedJsonTransport(apiBaseUrl, tokenProvider, fetcher, timeoutMs);
  let response: JsonHttpResponse;
  try {
    response = await transport.request('/v1/me', 'GET');
  } catch (error) {
    if (error instanceof HttpTransportError && error.code === 'auth_required') {
      throw new Error('Signed-in session token is unavailable.');
    }
    throw new Error(
      error instanceof HttpTransportError && error.code === 'timeout'
        ? 'Living Plot identity request timed out.'
        : 'Living Plot identity could not be resolved.',
    );
  }
  if (!response.ok) throw new Error('Living Plot identity could not be resolved.');
  if (!response.jsonValid) throw new Error('Living Plot identity response is invalid.');
  const payload = response.payload;
  if (!isRecord(payload) || !isRecord(payload.user) || typeof payload.user.id !== 'string' || !payload.user.id.trim()) {
    throw new Error('Living Plot identity response is invalid.');
  }
  return payload.user.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
