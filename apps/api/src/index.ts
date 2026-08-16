import type { AppEnv } from './env';
import { handleRequest } from './http/app';

const worker: ExportedHandler<AppEnv> = {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

export default worker;
