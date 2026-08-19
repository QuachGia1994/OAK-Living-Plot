import { AuthenticatedJsonTransport, HttpTransportError, type FetchLike, type TokenProvider } from '../../lib/http-transport';

export interface ReferralSnapshot {
  code: string;
  claimedCode: string | null;
  bonusVoiceCredits: number;
  successfulReferrals: number;
}

export type ReferralClientErrorCode = 'auth_required' | 'invalid_code' | 'not_found' | 'self_referral' | 'already_claimed' | 'plus_already_active' | 'backend_unavailable';

export class ReferralClientError extends Error {
  constructor(
    readonly code: ReferralClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReferralClientError';
  }
}

export class HttpReferralClient {
  private readonly transport: AuthenticatedJsonTransport;

  constructor(apiBaseUrl: string, tokenProvider: TokenProvider, fetcher: FetchLike = fetch) {
    this.transport = new AuthenticatedJsonTransport(apiBaseUrl, tokenProvider, fetcher);
  }

  async load(): Promise<ReferralSnapshot> {
    return this.parse(await this.request('/v1/referrals/me', 'GET'));
  }

  async claim(code: string): Promise<ReferralSnapshot> {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{8,24}$/u.test(normalized)) throw new ReferralClientError('invalid_code', 'Referral code is invalid.');
    return this.parse(await this.request('/v1/referrals/claim', 'POST', { code: normalized }));
  }

  private async request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    try {
      const response = await this.transport.request(path, method, body);
      if (!response.ok) throw mapReferralError(response.status, response.payload);
      return response.payload;
    } catch (error) {
      if (error instanceof ReferralClientError) throw error;
      if (error instanceof HttpTransportError && error.code === 'auth_required') {
        throw new ReferralClientError('auth_required', 'Sign in to use referrals.');
      }
      throw new ReferralClientError('backend_unavailable', 'Referral service could not be reached.');
    }
  }

  private parse(payload: unknown): ReferralSnapshot {
    if (!isRecord(payload) || !isRecord(payload.referral)) throw new ReferralClientError('backend_unavailable', 'Referral response is invalid.');
    const value = payload.referral;
    if (
      typeof value.code !== 'string' ||
      (value.claimedCode !== null && typeof value.claimedCode !== 'string') ||
      !Number.isInteger(value.bonusVoiceCredits) || Number(value.bonusVoiceCredits) < 0 ||
      !Number.isInteger(value.successfulReferrals) || Number(value.successfulReferrals) < 0
    ) throw new ReferralClientError('backend_unavailable', 'Referral response is invalid.');
    return {
      code: value.code,
      claimedCode: value.claimedCode as string | null,
      bonusVoiceCredits: Number(value.bonusVoiceCredits),
      successfulReferrals: Number(value.successfulReferrals),
    };
  }
}

function mapReferralError(status: number, payload: unknown): ReferralClientError {
  const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
  if (status === 401) return new ReferralClientError('auth_required', 'Sign in to use referrals.');
  if (code === 'self_referral') return new ReferralClientError('self_referral', 'You cannot claim your own referral code.');
  if (code === 'already_claimed') return new ReferralClientError('already_claimed', 'This account already has a referral code.');
  if (code === 'plus_already_active') return new ReferralClientError('plus_already_active', 'Referral codes must be linked before Plus activates.');
  if (status === 404 || code === 'not_found') return new ReferralClientError('not_found', 'Referral code was not found.');
  if (status === 400 || code === 'invalid_request' || code === 'invalid_input') return new ReferralClientError('invalid_code', 'Referral code is invalid.');
  return new ReferralClientError('backend_unavailable', 'Referral service could not complete the request.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
