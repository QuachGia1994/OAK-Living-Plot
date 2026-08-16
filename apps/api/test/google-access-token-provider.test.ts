import { describe, expect, it } from 'vitest';
import { GoogleAccessTokenProvider } from '../src/tts/google-access-token-provider';

describe('GoogleAccessTokenProvider', () => {
  it('signs an RS256 service-account assertion and exchanges it for a cached access token', async () => {
    const keys = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const privateKeyPem = toPem(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
    const now = Date.UTC(2026, 7, 16, 9, 0, 0);
    let calls = 0;
    let assertion = '';
    const fetchImpl = (async (...args: Parameters<typeof fetch>) => {
      calls += 1;
      const [, init] = args;
      const body = new URLSearchParams(String(init?.body ?? ''));
      assertion = body.get('assertion') ?? '';
      expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
      return Response.json({ access_token: 'access-token', expires_in: 3600, token_type: 'Bearer' });
    }) as typeof fetch;

    const provider = new GoogleAccessTokenProvider(
      'tts@example.iam.gserviceaccount.com',
      privateKeyPem,
      fetchImpl,
      () => now,
    );

    const first = await provider.getAccessToken();
    const second = await provider.getAccessToken();

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(calls).toBe(1);

    const [encodedHeader, encodedClaims, encodedSignature] = assertion.split('.');
    expect(JSON.parse(decodeBase64Url(encodedHeader))).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(decodeBase64Url(encodedClaims))).toEqual({
      iss: 'tts@example.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 3600,
    });
    const verified = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keys.publicKey,
      toArrayBuffer(decodeBase64UrlBytes(encodedSignature)),
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
    );
    expect(verified).toBe(true);
  });

  it('fails closed when service-account credentials are missing', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return Response.json({});
    }) as typeof fetch;
    const provider = new GoogleAccessTokenProvider('tts@example.com', '', fetchImpl);

    const result = await provider.getAccessToken();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.retryable).toBe(false);
    expect(called).toBe(false);
  });

  it('normalizes token endpoint network failure as retryable auth failure', async () => {
    const keys = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const privateKeyPem = toPem(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const provider = new GoogleAccessTokenProvider('tts@example.com', privateKeyPem, fetchImpl);

    const result = await provider.getAccessToken();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'auth_failed', retryable: true });
  });
});

function toPem(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? base64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
