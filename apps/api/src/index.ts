import { handleAudioQueue } from './audio/queue-handler';
import type { MediaJob } from './audio/contracts';
import type { AppEnv } from './env';
import { handleRequest } from './http/app';

const worker: ExportedHandler<AppEnv, MediaJob> = {
  fetch(request, env, context) {
    return handleRequest(request, env, {}, context);
  },
  queue(batch, env) {
    return handleAudioQueue(batch, env);
  },
};

export default worker;
