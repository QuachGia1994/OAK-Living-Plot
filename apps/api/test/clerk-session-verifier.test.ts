import { describe, expect, it } from 'vitest';
import { ClerkSessionVerifier } from '../src/auth/clerk-session-verifier';

const AUTHORIZED_PARTY = 'https://living-plot.test';

describe('ClerkSessionVerifier', () => {
  it('verifies a signed session token networklessly with the configured JWT public key', async () => {
    const fixture = await signedSessionToken(AUTHORIZED_PARTY);
    const verifier = new ClerkSessionVerifier({
      CLERK_JWT_KEY: fixture.publicKeyPem,
      CLERK_AUTHORIZED_PARTIES: AUTHORIZED_PARTY,
    });

    const principal = await verifier.authenticate(new Request('https://api.test/v1/me', {
      headers: { Authorization: `Bearer ${fixture.token}` },
    }));

    expect(principal).toEqual({ subject: 'user_test_owner' });
  });

  it('rejects a token minted for a different authorized party', async () => {
    const fixture = await signedSessionToken('https://other-client.test');
    const verifier = new ClerkSessionVerifier({
      CLERK_JWT_KEY: fixture.publicKeyPem,
      CLERK_AUTHORIZED_PARTIES: AUTHORIZED_PARTY,
    });

    const principal = await verifier.authenticate(new Request('https://api.test/v1/me', {
      headers: { Authorization: `Bearer ${fixture.token}` },
    }));

    expect(principal).toBeNull();
  });
});

async function signedSessionToken(authorizedParty: string): Promise<{ token: string; publicKeyPem: string }> {
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
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: 'RS256', typ: 'JWT', kid: 'test-key' });
  const payload = encodeSegment({
    azp: authorizedParty,
    exp: now + 60,
    iat: now,
    iss: 'https://living-plot-test.clerk.accounts.dev',
    nbf: now - 1,
    sid: 'sess_test',
    sub: 'user_test_owner',
    v: 2,
  });
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keys.privateKey,
    new TextEncoder().encode(signingInput),
  );
  const publicKey = await crypto.subtle.exportKey('spki', keys.publicKey);
  return {
    token: `${signingInput}.${base64Url(new Uint8Array(signature))}`,
    publicKeyPem: pemPublicKey(new Uint8Array(publicKey)),
  };
}

function encodeSegment(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function pemPublicKey(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const body = base64.match(/.{1,64}/gu)?.join('\n') ?? base64;
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}
