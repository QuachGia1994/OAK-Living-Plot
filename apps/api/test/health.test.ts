import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('health endpoint', () => {
  it('reports the API as healthy', async () => {
    const response = await SELF.fetch('https://living-plot.test/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: 'living-plot-api',
      status: 'ok',
    });
  });
});
