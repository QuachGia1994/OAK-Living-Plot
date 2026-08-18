import { describe, expect, it, vi } from 'vitest';
import { HttpPreferencesClient, PreviewPreferencesClient } from '../src/features/preferences/client';

describe('preferences clients', () => {
  it('loads and saves validated live preferences with authenticated transport', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => Response.json({
      preferences: {
        uiLocale: init?.method === 'POST' ? 'vi' : 'en',
        dramaLocale: init?.method === 'POST' ? 'vi-VN' : 'en-US',
        narratorVariant: init?.method === 'POST' ? 'vi-narrator-female' : 'en-narrator-female',
        updatedAt: init?.method === 'POST' ? 123 : null,
      },
    }));
    const client = new HttpPreferencesClient('https://api.test', async () => 'token', fetcher);

    await expect(client.load()).resolves.toMatchObject({ uiLocale: 'en', dramaLocale: 'en-US' });
    await expect(client.save({ uiLocale: 'vi', dramaLocale: 'vi-VN', narratorVariant: 'vi-narrator-female' })).resolves.toMatchObject({ uiLocale: 'vi', updatedAt: 123 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported server values and keeps preview preferences local', async () => {
    const client = new HttpPreferencesClient('https://api.test', async () => 'token', async () => Response.json({ preferences: { uiLocale: 'fr' } }));
    await expect(client.load()).rejects.toThrow('Preferences response is invalid.');

    const preview = new PreviewPreferencesClient({ uiLocale: 'en', dramaLocale: 'en-US', narratorVariant: 'en-narrator-female', updatedAt: null });
    await preview.save({ uiLocale: 'vi', dramaLocale: 'vi-VN', narratorVariant: 'vi-narrator-female' });
    await expect(preview.load()).resolves.toMatchObject({ uiLocale: 'vi', dramaLocale: 'vi-VN' });
  });
});
