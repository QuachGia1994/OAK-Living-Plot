import { describe, expect, it } from 'vitest';
import wranglerText from '../wrangler.jsonc?raw';

type QueueConfig = {
  vars: { TTS_DLQ_NAME: string; QUOTA_MODE: string };
  queues: { consumers: Array<{ queue: string; dead_letter_queue?: string }> };
};

type WranglerConfig = QueueConfig & { env: { development: QueueConfig & { ai: { binding: string } } } };

const config = JSON.parse(wranglerText) as WranglerConfig;

describe('Wrangler queue routing config', () => {
  it('keeps the runtime DLQ name aligned with each configured DLQ consumer', () => {
    expect(config.vars.TTS_DLQ_NAME).toBe(config.queues.consumers[1]?.queue);
    expect(config.env.development.vars.TTS_DLQ_NAME).toBe(config.env.development.queues.consumers[1]?.queue);
  });

  it('keeps production quotas enforced while development preview is unlimited', () => {
    expect(config.vars.QUOTA_MODE).toBe('enforced');
    expect(config.env.development.vars.QUOTA_MODE).toBe('preview_unlimited');
  });

  it('binds Workers AI in the development environment where portraits run', () => {
    expect(config.env.development.ai.binding).toBe('AI');
  });
});
