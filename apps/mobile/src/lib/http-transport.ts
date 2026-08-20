export type TokenProvider = () => Promise<string | null>;
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type HttpTransportErrorCode = 'not_configured' | 'auth_required' | 'timeout' | 'network';

export class HttpTransportError extends Error {
  constructor(
    readonly code: HttpTransportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpTransportError';
  }
}

export interface JsonHttpResponse {
  ok: boolean;
  status: number;
  payload: unknown;
  jsonValid: boolean;
}

const MAX_INLINE_MEDIA_BYTES = 4 * 1024 * 1024;
const INLINE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class AuthenticatedJsonTransport {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly tokenProvider: TokenProvider,
    private readonly fetcher: FetchLike = fetch,
    private readonly timeoutMs = 12_000,
  ) {}

  async request(path: string, method: 'GET' | 'POST', body?: unknown, timeoutMs = this.timeoutMs): Promise<JsonHttpResponse> {
    const base = this.baseUrl();
    const attempts = method === 'GET' ? 2 : 1;
    let lastTransportError: HttpTransportError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const token = await this.requireToken();
      try {
        const result = await fetchJsonAttempt(
          this.fetcher,
          `${base}${path}`,
          {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          },
          timeoutMs,
        );
        if (method === 'GET' && attempt < attempts && result.status >= 500) continue;
        return result;
      } catch (error) {
        const normalized = normalizeTransportError(error);
        lastTransportError = normalized;
        if (method !== 'GET' || attempt === attempts) throw normalized;
      }
    }

    throw lastTransportError ?? new HttpTransportError('network', 'The server could not be reached.');
  }

  async authorizedSource(path: string): Promise<{ uri: string; headers: Record<string, string> }> {
    const base = this.baseUrl();
    const token = await this.requireToken();
    return { uri: `${base}${path}`, headers: { Authorization: `Bearer ${token}` } };
  }

  async authorizedDataUriSource(path: string, timeoutMs = this.timeoutMs): Promise<{ uri: string }> {
    const base = this.baseUrl();
    let lastTransportError: HttpTransportError | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const token = await this.requireToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetcher(`${base}${path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if ((response.status === 401 || response.status >= 500) && attempt < 2) continue;
        if (response.status === 401) throw new HttpTransportError('auth_required', 'Signed-in session token was rejected.');
        if (!response.ok) throw new HttpTransportError('network', 'Private media could not be loaded.');

        const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
        if (!INLINE_MEDIA_TYPES.has(contentType)) throw new HttpTransportError('network', 'Private media type is invalid.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_MEDIA_BYTES) {
          throw new HttpTransportError('network', 'Private media size is invalid.');
        }
        return { uri: `data:${contentType};base64,${bytesToBase64(bytes)}` };
      } catch (error) {
        const normalized = controller.signal.aborted
          ? new HttpTransportError('timeout', 'The request timed out.')
          : normalizeTransportError(error);
        lastTransportError = normalized;
        if (normalized.code === 'auth_required' || attempt === 2) throw normalized;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastTransportError ?? new HttpTransportError('network', 'Private media could not be loaded.');
  }

  private baseUrl(): string {
    const base = this.apiBaseUrl.trim().replace(/\/$/u, '');
    if (!base) throw new HttpTransportError('not_configured', 'Living Plot API URL is not configured.');
    return base;
  }

  private async requireToken(): Promise<string> {
    const token = await this.tokenProvider();
    if (!token?.trim()) throw new HttpTransportError('auth_required', 'Signed-in session token is unavailable.');
    return token;
  }
}

async function fetchJsonAttempt(
  fetcher: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<JsonHttpResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    let payload: unknown = null;
    let jsonValid = true;
    try {
      payload = await response.json();
    } catch {
      jsonValid = false;
    }
    return { ok: response.ok, status: response.status, payload, jsonValid };
  } catch (error) {
    if (controller.signal.aborted) throw new HttpTransportError('timeout', 'The request timed out.');
    throw new HttpTransportError('network', error instanceof Error ? error.message : 'The network request failed.');
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTransportError(error: unknown): HttpTransportError {
  return error instanceof HttpTransportError
    ? error
    : new HttpTransportError('network', 'The network request failed.');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
