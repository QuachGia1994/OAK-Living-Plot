import type { AppEnv } from '../env';
import type { SpeechSynthesizer } from '../tts/contracts';
import { createSpeechSynthesizer } from '../tts/factory';
import { AudioProcessor } from './audio-processor';
import type { AudioJob } from './contracts';

const TTS_DLQ_NAME = 'living-plot-tts-dlq';

export interface AudioQueueDependencies {
  synthesizer?: SpeechSynthesizer;
}

export async function handleAudioQueue(
  batch: MessageBatch<AudioJob>,
  env: AppEnv,
  dependencies: AudioQueueDependencies = {},
): Promise<void> {
  const processor = new AudioProcessor(
    env.DB,
    env.AUDIO_BUCKET,
    dependencies.synthesizer ?? createSpeechSynthesizer(env),
  );
  const isDeadLetterBatch = batch.queue === TTS_DLQ_NAME;

  for (const message of batch.messages) {
    try {
      const result = isDeadLetterBatch
        ? await processor.failDeadLetter(message.body)
        : await processor.process(message.body);
      if (result.action === 'ack') message.ack();
      else message.retry({ delaySeconds: result.delaySeconds });
    } catch {
      message.retry({ delaySeconds: 30 });
    }
  }
}
