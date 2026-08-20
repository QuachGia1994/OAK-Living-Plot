import type { Result, SceneGenerationError, SceneGenerationInput, SceneGenerationSuccess, SceneGenerator } from './contracts';

export class FailoverSceneGenerator implements SceneGenerator {
  constructor(
    private readonly primary: SceneGenerator,
    private readonly fallback: SceneGenerator,
  ) {}

  async generate(input: SceneGenerationInput): Promise<Result<SceneGenerationSuccess, SceneGenerationError>> {
    const primary = await this.primary.generate(input);
    if (primary.ok || primary.error.code === 'invalid_input') return primary;
    safeProviderWarning('primary_failed', primary.error);

    const fallback = await this.fallback.generate(input);
    if (!fallback.ok) safeProviderWarning('fallback_failed', fallback.error);
    return fallback;
  }
}

function safeProviderWarning(stage: 'primary_failed' | 'fallback_failed', error: SceneGenerationError): void {
  try {
    console.info('[scene-generation]', {
      stage,
      code: error.code,
      providerStatus: error.code === 'provider_unavailable' ? error.providerStatus ?? null : null,
      retryable: error.code === 'provider_unavailable' ? error.retryable : null,
    });
  } catch {
    // Provider diagnostics are privacy-safe and observational only.
  }
}
