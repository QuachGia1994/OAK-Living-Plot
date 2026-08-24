import { describe, expect, it } from 'vitest';
import type { DramaDraft, DramaSeedSuggestion } from '../src/features/drama/contracts';
import {
  applyDramaSeedSuggestion,
  beginSuggestionRequest,
  buildSuggestionInput,
  completeSuggestionRequest,
  failSuggestionRequest,
  initialSuggestionPanelState,
  shouldClearSuggestionAttempt,
  SuggestionSingleFlight,
  suggestionErrorMessage,
  suggestionInputFingerprint,
} from '../src/features/drama/suggestion-action';
import { DramaClientError } from '../src/features/drama/contracts';

const draft: DramaDraft = { premise: 'Keep this original draft untouched.', mood: 'tense', characterName: 'Original' };
const suggestions: [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion] = [
  { label: 'Lost call', premise: 'Mina receives a call from her missing sister and must decide whether to answer before police arrive. Who is really calling?', mood: 'mysterious', characterName: 'Mina' },
  { label: 'False promise', premise: 'Kai discovers a friend used his identity for a secret engagement and must confront them before the ceremony. Why was his name necessary?', mood: 'romantic', characterName: 'Kai' },
  { label: 'Hidden room', premise: 'Linh finds a sealed room marked with her name and must enter before the house is demolished. What did her family hide there?', mood: 'hopeful', characterName: 'Linh' },
];

describe('suggestion form action mapping', () => {
  it('guards suggestion requests synchronously so a double tap cannot start two flights', () => {
    const flight = new SuggestionSingleFlight();
    expect(flight.tryBegin()).toBe(true);
    expect(flight.tryBegin()).toBe(false);
    expect(flight.active).toBe(true);
    flight.end();
    expect(flight.tryBegin()).toBe(true);
  });

  it('receiving suggestions does not overwrite the current draft', () => {
    const loading = beginSuggestionRequest(initialSuggestionPanelState, 1);
    const completed = completeSuggestionRequest(loading, 1, suggestions);
    expect(draft).toEqual({ premise: 'Keep this original draft untouched.', mood: 'tense', characterName: 'Original' });
    expect(completed.suggestions).toEqual(suggestions);
  });

  it('selecting a suggestion maps exactly premise, mood, and characterName', () => {
    expect(applyDramaSeedSuggestion(draft, suggestions[1])).toEqual({
      premise: suggestions[1].premise,
      mood: suggestions[1].mood,
      characterName: suggestions[1].characterName,
    });
  });

  it('keeps old suggestions visible while a new batch loads and if it fails', () => {
    const first = completeSuggestionRequest(beginSuggestionRequest(initialSuggestionPanelState, 1), 1, suggestions);
    const loadingMore = beginSuggestionRequest(first, 2);
    expect(loadingMore.suggestions).toEqual(suggestions);
    const failed = failSuggestionRequest(loadingMore, 2, 'Could not refresh suggestions.');
    expect(failed.suggestions).toEqual(suggestions);
    expect(failed.error).toBe('Could not refresh suggestions.');
  });

  it('ignores a stale response from an older request id', () => {
    const requestOne = beginSuggestionRequest(initialSuggestionPanelState, 1);
    const requestTwo = beginSuggestionRequest(requestOne, 2);
    expect(completeSuggestionRequest(requestTwo, 1, suggestions)).toEqual(requestTwo);
    expect(failSuggestionRequest(requestTwo, 1, 'stale')).toEqual(requestTwo);
  });

  it('normalizes optional inspiration and name for a stable request fingerprint', () => {
    const input = buildSuggestionInput({ premise: '  A   strange\nmessage  ', mood: 'mysterious', characterName: '  Mina  ' });
    expect(input).toEqual({ mood: 'mysterious', inspiration: 'A strange message', characterName: 'Mina' });
    expect(suggestionInputFingerprint(input)).toBe(suggestionInputFingerprint({ ...input }));
  });

  it('omits a one-character partial name so the AI must return a valid 2–50 character name', () => {
    expect(buildSuggestionInput({ premise: '', mood: 'tense', characterName: ' M ' })).toEqual({ mood: 'tense' });
  });

  it('keeps uncertain failures on the same request key but clears definite invalid/conflict attempts', () => {
    expect(shouldClearSuggestionAttempt(new DramaClientError('backend_unavailable', 'timeout'))).toBe(false);
    expect(shouldClearSuggestionAttempt(new DramaClientError('provider_unavailable', 'provider'))).toBe(false);
    expect(shouldClearSuggestionAttempt(new DramaClientError('suggestion_in_progress', 'pending'))).toBe(false);
    expect(shouldClearSuggestionAttempt(new DramaClientError('suggestion_conflict', 'conflict'))).toBe(true);
    expect(shouldClearSuggestionAttempt(new DramaClientError('invalid_suggestion_response', 'invalid'))).toBe(true);
  });

  it('provides suggestion-specific English and Vietnamese error copy without Scene-generation wording', () => {
    const errors = [
      new DramaClientError('suggestion_unavailable', 'old server'),
      new DramaClientError('suggestion_in_progress', 'pending'),
      new DramaClientError('suggestion_rate_limited', 'limited'),
      new DramaClientError('suggestion_conflict', 'conflict'),
      new DramaClientError('invalid_suggestion_response', 'invalid'),
      new DramaClientError('provider_unavailable', 'provider'),
      new DramaClientError('backend_unavailable', 'The AI suggestion service took too long to respond.'),
    ];
    for (const error of errors) {
      expect(suggestionErrorMessage(error, 'en')).not.toMatch(/Scene generation|drama engine/i);
      expect(suggestionErrorMessage(error, 'vi').length).toBeGreaterThan(20);
    }
    expect(suggestionErrorMessage(new DramaClientError('suggestion_rate_limited', 'limited'), 'en')).toContain('12');
    expect(suggestionErrorMessage(new DramaClientError('suggestion_rate_limited', 'limited'), 'vi')).toContain('12');
  });
});
