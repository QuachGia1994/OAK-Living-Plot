import { useEffect } from 'react';
import { AppState } from 'react-native';
import { shouldRefreshOnAppState } from './app-state-policy';

export function useRefreshOnForeground(refresh: () => void | Promise<void>): void {
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      const shouldRefresh = shouldRefreshOnAppState(previous, next);
      previous = next;
      if (shouldRefresh) void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
}
