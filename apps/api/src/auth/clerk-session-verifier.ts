import { verifyToken } from '@clerk/backend';
import { decodeJwt } from '@clerk/backend/jwt';
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
      const hasAuthorizedParty = tokenHasAuthorizedPartyClaim(token);
      if (hasAuthorizedParty && this.authorizedParties.length === 0) return null;
      const payload = await verifyToken(token, {
        ...(hasAuthorizedParty ? { authorizedParties: this.authorizedParties } : {}),
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

function tokenHasAuthorizedPartyClaim(token: string): boolean {
  try {
    const authorizedParty = decodeJwt(token).payload.azp;
    return typeof authorizedParty === 'string' && authorizedParty.trim().length > 0;
  } catch {
    return true;
  }
}

function parseAuthorizedParties(raw: string): string[] {
  return raw
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean);
}

function requirePublicKey(value: string): string {
  const normalized = value.trim().replaceAll('\\n', '\n');
  if (!normalized.includes('-----BEGIN PUBLIC KEY-----') || !normalized.includes('-----END PUBLIC KEY-----')) {
    throw new Error('CLERK_JWT_KEY must be a PEM public key.');
  }
  return normalized;
}
