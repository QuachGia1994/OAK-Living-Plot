import type { DramaMood } from '../domain/drama';
import type { DramaSeedSuggestion, DramaSeedSuggestionRequest } from './suggestion-contracts';

export function normalizeSuggestionRequest(input: DramaSeedSuggestionRequest): DramaSeedSuggestionRequest | null {
  const requestKey = normalizeText(input.requestKey);
  if (!requestKey || requestKey !== input.requestKey || requestKey.length < 8 || requestKey.length > 128) return null;
  if (!isMood(input.mood)) return null;

  const characterName = normalizeOptionalCharacterName(input.characterName);
  if (characterName === null) return null;
  const inspiration = normalizeOptionalText(input.inspiration, 600);
  if (input.inspiration !== undefined && inspiration === null) return null;

  return {
    requestKey,
    mood: input.mood,
    ...(characterName ? { characterName } : {}),
    ...(inspiration ? { inspiration } : {}),
  };
}

export function validatePublicSuggestions(suggestions: DramaSeedSuggestion[]): string[] {
  if (suggestions.length !== 3) return ['Exactly three suggestions are required.'];
  const errors: string[] = [];
  const labels = new Set<string>();
  const premises = new Set<string>();
  for (const [index, suggestion] of suggestions.entries()) {
    const label = boundedNormalizedText(suggestion.label, 3, 48);
    const premise = boundedNormalizedText(suggestion.premise, 12, 600);
    const characterName = boundedNormalizedText(suggestion.characterName, 2, 50);
    if (!label || !premise || !characterName || !isMood(suggestion.mood)) errors.push(`Suggestion ${index + 1} is invalid.`);
    if (label && /^(?:option\s*)?[abc]$/iu.test(label)) errors.push(`Suggestion ${index + 1} uses a reserved choice label.`);
    if (label) labels.add(semanticKey(label));
    if (premise) premises.add(semanticKey(premise));
    if (premise && !premise.includes('?')) errors.push(`Suggestion ${index + 1} needs an unanswered dramatic question.`);
  }
  if (labels.size !== 3) errors.push('Suggestion labels must be distinct.');
  if (premises.size !== 3) errors.push('Suggestion premises must be distinct.');
  for (let left = 0; left < suggestions.length; left += 1) {
    for (let right = left + 1; right < suggestions.length; right += 1) {
      if (tokenSimilarity(suggestions[left].premise, suggestions[right].premise) > 0.72) errors.push('Suggestion premises are too similar.');
    }
  }
  return errors;
}

export function boundedNormalizedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeText(value);
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

export function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function normalizeOptionalCharacterName(value: string | undefined): string | null {
  if (value === undefined) return '';
  const normalized = normalizeText(value);
  if (normalized.length > 50) return null;
  return normalized.length >= 2 ? normalized : '';
}

function normalizeOptionalText(value: string | undefined, max: number): string | null {
  if (value === undefined) return '';
  const normalized = normalizeText(value);
  return normalized.length <= max ? normalized : null;
}

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(semanticKey(left).split(' ').filter(Boolean));
  const b = new Set(semanticKey(right).split(' ').filter(Boolean));
  if (a.size === 0 || b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

function semanticKey(value: string): string {
  return normalizeText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

function isMood(value: unknown): value is DramaMood {
  return value === 'tense' || value === 'mysterious' || value === 'romantic' || value === 'hopeful';
}
