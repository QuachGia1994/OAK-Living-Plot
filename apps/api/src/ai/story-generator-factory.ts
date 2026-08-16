import type { AppEnv } from '../env';
import type { StoryGenerator } from './contracts';
import { GeminiStoryGenerator } from './gemini-story-generator';

export function createStoryGenerator(env: Pick<AppEnv, 'GEMINI_API_KEY'>): StoryGenerator {
  return new GeminiStoryGenerator(env.GEMINI_API_KEY);
}
