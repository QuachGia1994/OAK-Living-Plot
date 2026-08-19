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
