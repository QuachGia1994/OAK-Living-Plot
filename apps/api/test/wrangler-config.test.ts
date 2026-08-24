import { describe, expect, it } from 'vitest';
import wranglerText from '../wrangler.jsonc?raw';
import testWranglerText from '../wrangler.test.jsonc?raw';

type QueueConfig = {
  vars: { TTS_DLQ_NAME: string; QUOTA_MODE: string; SCENE_GENERATOR_PROVIDER: string };
  queues: { consumers: Array<{ queue: string; dead_letter_queue?: string }> };
};

type WranglerConfig = QueueConfig & {
  ai: { binding: string };
  env: { development: QueueConfig & { ai: { binding: string }; analytics_engine_datasets: unknown[] } };
};

const config = JSON.parse(wranglerText) as WranglerConfig;
const testConfig = JSON.parse(testWranglerText) as QueueConfig & { ai?: unknown };

describe('Wrangler queue routing config', () => {
  it('keeps the runtime DLQ name aligned with each configured DLQ consumer', () => {
    expect(config.vars.TTS_DLQ_NAME).toBe(config.queues.consumers[1]?.queue);
    expect(config.env.development.vars.TTS_DLQ_NAME).toBe(config.env.development.queues.consumers[1]?.queue);
  });

  it('keeps production quotas enforced while development preview is unlimited', () => {
    expect(config.vars.QUOTA_MODE).toBe('enforced');
    expect(config.env.development.vars.QUOTA_MODE).toBe('preview_unlimited');
  });

  it('binds Workers AI wherever AI suggestions are served without changing the explicit Scene provider', () => {
    expect(config.ai.binding).toBe('AI');
    expect(config.env.development.ai.binding).toBe('AI');
    expect(config.vars.SCENE_GENERATOR_PROVIDER).toBe('gemini');
    expect(config.env.development.vars.SCENE_GENERATOR_PROVIDER).toBe('workers_ai');
  });

  it('keeps unavailable development analytics explicitly fail-open', () => {
    expect(config.env.development.analytics_engine_datasets).toEqual([]);
  });

  it('keeps the local Vitest runtime free of a billable Workers AI binding', () => {
    expect(testConfig.ai).toBeUndefined();
    expect(testConfig.vars.QUOTA_MODE).toBe('enforced');
    expect(testConfig.vars.SCENE_GENERATOR_PROVIDER).toBe('gemini');
  });
});
