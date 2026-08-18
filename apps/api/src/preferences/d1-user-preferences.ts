import type { DramaLocale, NarratorVariant, UiLocale, UserPreferences } from './contracts';
import { defaultUserPreferences, isDramaLocale, isNarratorVariant, isUiLocale } from './contracts';

interface PreferenceRow {
  ui_locale: string;
  story_locale: string;
  narrator_variant: string;
  updated_at: number;
}

export class D1UserPreferencesRepository {
  constructor(private readonly db: D1Database) {}

  async get(userId: string): Promise<UserPreferences> {
    const row = await this.db
      .prepare(
        `SELECT ui_locale, story_locale, narrator_variant, updated_at
         FROM user_preferences WHERE user_id = ?`,
      )
      .bind(userId)
      .first<PreferenceRow>();
    if (!row) return { ...defaultUserPreferences };
    if (!isUiLocale(row.ui_locale) || !isDramaLocale(row.story_locale) || !isNarratorVariant(row.narrator_variant)) {
      throw new Error('Stored user preferences are invalid.');
    }
    return {
      uiLocale: row.ui_locale,
      dramaLocale: row.story_locale,
      narratorVariant: row.narrator_variant,
      updatedAt: row.updated_at,
    };
  }

  async set(
    userId: string,
    input: { uiLocale: UiLocale; dramaLocale: DramaLocale; narratorVariant: NarratorVariant },
    nowMs = Date.now(),
  ): Promise<UserPreferences> {
    await this.db
      .prepare(
        `INSERT INTO user_preferences (user_id, ui_locale, story_locale, narrator_variant, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           ui_locale = excluded.ui_locale,
           story_locale = excluded.story_locale,
           narrator_variant = excluded.narrator_variant,
           updated_at = excluded.updated_at`,
      )
      .bind(userId, input.uiLocale, input.dramaLocale, input.narratorVariant, nowMs)
      .run();
    return { ...input, updatedAt: nowMs };
  }
}
