import { handleAudioQueue } from './audio/queue-handler';
import type { AudioJob } from './audio/contracts';
import type { AppEnv } from './env';
import { handleRequest } from './http/app';

const worker: ExportedHandler<AppEnv, AudioJob> = {
  fetch(request, env) {
    return handleRequest(request, env);
  },
  queue(batch, env) {
    return handleAudioQueue(batch, env);
  },
};

export default worker;
