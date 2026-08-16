import { createClerkClient } from '@clerk/backend';
import type { AppEnv } from '../env';
import type { AuthenticatedPrincipal, SessionVerifier } from './session-verifier';

export class ClerkSessionVerifier implements SessionVerifier {
  private readonly client;
  private readonly jwtKey: string;
  private readonly authorizedParties: string[];

  constructor(env: Pick<AppEnv, 'CLERK_PUBLISHABLE_KEY' | 'CLERK_JWT_KEY' | 'CLERK_AUTHORIZED_PARTIES'>) {
    const publishableKey = requireValue(env.CLERK_PUBLISHABLE_KEY, 'CLERK_PUBLISHABLE_KEY');
    this.jwtKey = requireValue(env.CLERK_JWT_KEY, 'CLERK_JWT_KEY');
    this.authorizedParties = parseAuthorizedParties(env.CLERK_AUTHORIZED_PARTIES);
    this.client = createClerkClient({ publishableKey, jwtKey: this.jwtKey });
  }

  async authenticate(request: Request): Promise<AuthenticatedPrincipal | null> {
    const state = await this.client.authenticateRequest(request, {
      acceptsToken: 'session_token',
      authorizedParties: this.authorizedParties,
      jwtKey: this.jwtKey,
    });
    if (!state.isAuthenticated) return null;

    const auth = state.toAuth();
    const subject = auth.userId?.trim();
    return subject ? { subject } : null;
  }
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

function requireValue(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}
