export type TokenProvider = () => Promise<string | null>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadBackendUserId(
  apiBaseUrl: string,
  tokenProvider: TokenProvider,
  fetcher: FetchLike = fetch,
): Promise<string> {
  const base = apiBaseUrl.trim().replace(/\/$/, '');
  if (!base) throw new Error('Living Plot API URL is not configured.');
  const token = await tokenProvider();
  if (!token) throw new Error('Signed-in session token is unavailable.');
  const response = await fetcher(`${base}/v1/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Living Plot identity could not be resolved.');
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.user) || typeof payload.user.id !== 'string' || !payload.user.id.trim()) {
    throw new Error('Living Plot identity response is invalid.');
  }
  return payload.user.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
