import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 4,
  },
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: {
        configPath: './wrangler.test.jsonc',
      },
    }),
  ],
});
