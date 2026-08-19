import { AuthenticatedJsonTransport, HttpTransportError, type FetchLike, type TokenProvider } from '../../lib/http-transport';

export type AuthenticatedApiReason =
  | 'unchecked'
  | 'ok'
  | 'token_unavailable'
  | 'auth_rejected'
  | 'auth_unavailable'
  | 'request_rejected'
  | 'server_error'
  | 'invalid_response'
  | 'timeout'
  | 'network_error';

export interface AuthenticatedApiDiagnostic {
  tokenPresent: boolean;
  httpStatus: number | null;
  reason: AuthenticatedApiReason;
}

export const uncheckedAuthenticatedApiDiagnostic: AuthenticatedApiDiagnostic = {
  tokenPresent: false,
  httpStatus: null,
  reason: 'unchecked',
};

export async function probeAuthenticatedApi(
  apiBaseUrl: string,
  tokenProvider: TokenProvider,
  fetcher: FetchLike = fetch,
): Promise<AuthenticatedApiDiagnostic> {
  let tokenPresent = false;
  const observedTokenProvider: TokenProvider = async () => {
    const token = await tokenProvider();
    tokenPresent = Boolean(token?.trim());
    return token;
  };
  const transport = new AuthenticatedJsonTransport(apiBaseUrl, observedTokenProvider, fetcher, 5_000);

  try {
    const response = await transport.request('/v1/me', 'GET');
    if (!response.jsonValid) return { tokenPresent, httpStatus: response.status, reason: 'invalid_response' };
    if (response.status === 200 && response.ok) return { tokenPresent, httpStatus: 200, reason: 'ok' };
    if (response.status === 401 || response.status === 403) return { tokenPresent, httpStatus: response.status, reason: 'auth_rejected' };
    if (response.status === 503 && responseError(response.payload) === 'auth_unavailable') return { tokenPresent, httpStatus: 503, reason: 'auth_unavailable' };
    if (response.status >= 500) return { tokenPresent, httpStatus: response.status, reason: 'server_error' };
    return { tokenPresent, httpStatus: response.status, reason: 'request_rejected' };
  } catch (error) {
    if (error instanceof HttpTransportError) {
      if (error.code === 'auth_required') return { tokenPresent: false, httpStatus: null, reason: 'token_unavailable' };
      if (error.code === 'timeout') return { tokenPresent, httpStatus: null, reason: 'timeout' };
    }
    return { tokenPresent, httpStatus: null, reason: 'network_error' };
  }
}

export function authenticatedApiDiagnosticLabel(diagnostic: AuthenticatedApiDiagnostic): string {
  const status = diagnostic.httpStatus === null ? '—' : String(diagnostic.httpStatus);
  return `${status} · ${diagnostic.reason}`;
}

function responseError(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const error = (payload as { error?: unknown }).error;
  return typeof error === 'string' ? error : null;
}
