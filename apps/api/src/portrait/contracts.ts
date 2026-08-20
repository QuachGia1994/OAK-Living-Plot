export const CHARACTER_PORTRAIT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
export const CHARACTER_PORTRAIT_FALLBACK_MODEL = '@cf/black-forest-labs/flux-1-schnell';

export type CharacterPortraitStatus = 'missing' | 'generating' | 'ready' | 'stale' | 'failed';

export interface CharacterPortraitSnapshot {
  status: CharacterPortraitStatus;
  current: boolean;
  attempts: number;
  updatedAt: number | null;
  readyAt: number | null;
}

export interface CharacterPortraitDelivery {
  snapshot: CharacterPortraitSnapshot;
  objectKey: string | null;
}

export type CharacterPortraitResult<T> =
  | { ok: true; value: T; replayed?: boolean }
  | { ok: false; error: { code: 'not_found' | 'provider_unavailable' | 'invalid_response' | 'persistence_error'; message: string } };
