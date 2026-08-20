import type { Result, SceneGenerationError, SceneGenerationInput, SceneGenerationSuccess, SceneGenerator } from './contracts';

export class FailoverSceneGenerator implements SceneGenerator {
  constructor(
    private readonly primary: SceneGenerator,
    private readonly fallback: SceneGenerator,
  ) {}

  async generate(input: SceneGenerationInput): Promise<Result<SceneGenerationSuccess, SceneGenerationError>> {
    const primary = await this.primary.generate(input);
    if (primary.ok || primary.error.code === 'invalid_input') return primary;
    return this.fallback.generate(input);
  }
}
