import type { AccessTokenProvider, AccessTokenResult, SpeechError } from './contracts';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const ASSERTION_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const TOKEN_LIFETIME_SECONDS = 3600;
const CACHE_SKEW_MILLIS = 60_000;

type Clock = () => number;
type FetchLike = typeof fetch;

interface TokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
}

export class GoogleAccessTokenProvider implements AccessTokenProvider {
  private cached: AccessTokenResult | null = null;

  constructor(
    private readonly serviceAccountEmail: string,
    private readonly privateKeyPem: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly clock: Clock = Date.now,
  ) {}

  async getAccessToken(): Promise<{ ok: true; value: AccessTokenResult } | { ok: false; error: SpeechError }> {
    const now = this.clock();
    if (this.cached && this.cached.expiresAtMillis - CACHE_SKEW_MILLIS > now) {
      return { ok: true, value: this.cached };
    }

    const email = this.serviceAccountEmail.trim();
    if (!email || !this.privateKeyPem.trim()) return authFailure('Google service-account credentials are missing.', false);

    let assertion: string;
    try {
      assertion = await createSignedAssertion(email, this.privateKeyPem, now);
    } catch {
      return authFailure('Google service-account private key is invalid.', false);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: ASSERTION_GRANT_TYPE, assertion }).toString(),
      });
    } catch {
      return authFailure('Google OAuth token exchange failed.', true);
    }

    if (!response.ok) {
      return authFailure('Google OAuth token exchange was rejected.', response.status >= 500 || response.status === 429);
    }

    let payload: TokenResponse;
    try {
      payload = (await response.json()) as TokenResponse;
    } catch {
      return authFailure('Google OAuth token response is invalid.', true);
    }

    if (typeof payload.access_token !== 'string' || !payload.access_token.trim()) {
      return authFailure('Google OAuth response did not contain an access token.', true);
    }
    if (typeof payload.expires_in !== 'number' || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) {
      return authFailure('Google OAuth response did not contain a valid expiry.', true);
    }

    this.cached = {
      accessToken: payload.access_token,
      expiresAtMillis: now + Math.floor(payload.expires_in * 1000),
    };
    return { ok: true, value: this.cached };
  }
}

async function createSignedAssertion(email: string, privateKeyPem: string, nowMillis: number): Promise<string> {
  const issuedAt = Math.floor(nowMillis / 1000);
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = base64UrlJson({
    iss: email,
    scope: CLOUD_PLATFORM_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
  });
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function base64UrlJson(value: unknown): string {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToArrayBuffer(raw: string): ArrayBuffer {
  const normalized = raw.replace(/\\n/g, '\n').trim();
  const base64 = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  if (!base64) throw new Error('Empty key');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function authFailure(message: string, retryable: boolean): { ok: false; error: SpeechError } {
  return { ok: false, error: { code: 'auth_failed', message, retryable } };
}
