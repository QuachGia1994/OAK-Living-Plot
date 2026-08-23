export const SCENE_ARTWORK_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
export const SCENE_ARTWORK_FALLBACK_MODEL = '@cf/black-forest-labs/flux-1-schnell';

export type SceneArtworkStatus = 'missing' | 'generating' | 'ready' | 'stale' | 'failed';

export interface SceneArtworkSnapshot {
  status: SceneArtworkStatus;
  current: boolean;
  attempts: number;
  updatedAt: number | null;
  readyAt: number | null;
}

export interface SceneArtworkDelivery {
  snapshot: SceneArtworkSnapshot;
  objectKey: string | null;
}

export interface SceneArtworkJob {
  kind: 'scene_artwork';
  userId: string;
  sceneId: string;
}

export interface SceneArtworkQueue {
  send(message: SceneArtworkJob): Promise<unknown>;
}

export type SceneArtworkResult<T> =
  | { ok: true; value: T; replayed?: boolean }
  | {
    ok: false;
    error: {
      code: 'not_found' | 'provider_unavailable' | 'invalid_response' | 'persistence_error';
      message: string;
    };
  };
