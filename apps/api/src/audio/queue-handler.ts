import type { AppEnv } from '../env';
import { D1SceneArtworkService } from '../artwork/d1-scene-artwork-service';
import type { SpeechSynthesizer } from '../tts/contracts';
import { createSpeechSynthesizer } from '../tts/factory';
import { AudioProcessor } from './audio-processor';
import type { MediaJob } from './contracts';

export interface AudioQueueDependencies {
  synthesizer?: SpeechSynthesizer;
}

export async function handleAudioQueue(
  batch: MessageBatch<MediaJob>,
  env: AppEnv,
  dependencies: AudioQueueDependencies = {},
): Promise<void> {
  const processor = new AudioProcessor(
    env.DB,
    env.AUDIO_BUCKET,
    dependencies.synthesizer ?? createSpeechSynthesizer(env),
  );
  const isDeadLetterBatch = batch.queue === env.TTS_DLQ_NAME;

  for (const message of batch.messages) {
    if (message.body.kind === 'scene_artwork') {
      const artwork = new D1SceneArtworkService(env.DB, env.AUDIO_BUCKET, env.AI);
      if (isDeadLetterBatch) {
        await artwork.failDeadLetter(message.body.userId, message.body.sceneId);
        message.ack();
        continue;
      }
      try {
        const result = await artwork.generate(message.body.userId, message.body.sceneId);
        if (
          result.ok || result.error.code === 'not_found' || result.error.code === 'invalid_response' ||
          message.attempts >= 4
        ) {
          message.ack();
        } else {
          message.retry({ delaySeconds: Math.min(300, 30 * message.attempts) });
        }
      } catch {
        message.retry({ delaySeconds: Math.min(300, 30 * message.attempts) });
      }
      continue;
    }
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
