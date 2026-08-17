export function shouldRefreshOnAppState(previous: string, next: string): boolean {
  return previous !== 'active' && next === 'active';
}
