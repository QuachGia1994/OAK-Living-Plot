import { verifyToken } from '@clerk/backend';
import type { AppEnv } from '../env';
import type { AuthenticatedPrincipal, SessionVerifier } from './session-verifier';

export class ClerkSessionVerifier implements SessionVerifier {
  private readonly jwtKey: string;
  private readonly authorizedParties: string[];

  constructor(env: Pick<AppEnv, 'CLERK_JWT_KEY' | 'CLERK_AUTHORIZED_PARTIES'>) {
    this.jwtKey = requirePublicKey(env.CLERK_JWT_KEY);
    this.authorizedParties = parseAuthorizedParties(env.CLERK_AUTHORIZED_PARTIES);
  }

  async authenticate(request: Request): Promise<AuthenticatedPrincipal | null> {
    const token = bearerToken(request.headers.get('Authorization'));
    if (!token) return null;

    try {
      const payload = await verifyToken(token, {
        authorizedParties: this.authorizedParties,
        jwtKey: this.jwtKey,
      });
      const subject = typeof payload.sub === 'string' ? payload.sub.trim() : '';
      return subject ? { subject } : null;
    } catch {
      return null;
    }
  }
}

function bearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function parseAuthorizedParties(raw: string): string[] {
  const parties = raw
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean);
  if (parties.length === 0) {
    throw new Error('CLERK_AUTHORIZED_PARTIES must contain at least one allowed party.');
  }
  return parties;
}

function requirePublicKey(value: string): string {
  const normalized = value.trim().replaceAll('\\n', '\n');
  if (!normalized.includes('-----BEGIN PUBLIC KEY-----') || !normalized.includes('-----END PUBLIC KEY-----')) {
    throw new Error('CLERK_JWT_KEY must be a PEM public key.');
  }
  return normalized;
}
