import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export const ANDROID_TAB_ROUTES = ['index', 'create', 'library', 'settings'] as const;

export const ANDROID_MINI_NAV_METRICS = {
  expandedHeight: 58,
  compactRailHeight: 44,
  compactRailMaxWidth: 248,
  compactSideMargin: 20,
  minimumTapTarget: 44,
} as const;

export const ANDROID_TAB_GLYPHS: Record<(typeof ANDROID_TAB_ROUTES)[number], string> = {
  index: '⌂',
  create: '＋',
  library: '▤',
  settings: '⚙',
};

export function androidMiniRailWidth(viewportWidth: number): number {
  return Math.min(
    ANDROID_MINI_NAV_METRICS.compactRailMaxWidth,
    Math.max(ANDROID_MINI_NAV_METRICS.minimumTapTarget * ANDROID_TAB_ROUTES.length, viewportWidth - ANDROID_MINI_NAV_METRICS.compactSideMargin * 2),
  );
}

const TOP_RESET_Y = 8;
const MIN_COMPACT_Y = 20;
const DOWN_THRESHOLD = 12;
const UP_THRESHOLD = 14;
const JITTER_DELTA = 1;

export interface AndroidTabBarScrollState {
  compact: boolean;
  lastY: number;
  direction: 'up' | 'down' | null;
  travel: number;
}

export const initialAndroidTabBarScrollState: AndroidTabBarScrollState = {
  compact: false,
  lastY: 0,
  direction: null,
  travel: 0,
};

export function nextAndroidTabBarScrollState(
  current: AndroidTabBarScrollState,
  rawY: number,
): AndroidTabBarScrollState {
  const y = Number.isFinite(rawY) ? Math.max(0, rawY) : current.lastY;
  if (y <= TOP_RESET_Y) return { ...initialAndroidTabBarScrollState, lastY: y };

  const delta = y - current.lastY;
  if (Math.abs(delta) < JITTER_DELTA) return { ...current, lastY: y };
  const direction = delta > 0 ? 'down' : 'up';
  const travel = direction === current.direction ? current.travel + Math.abs(delta) : Math.abs(delta);

  let compact = current.compact;
  if (!compact && direction === 'down' && y >= MIN_COMPACT_Y && travel >= DOWN_THRESHOLD) compact = true;
  if (compact && direction === 'up' && travel >= UP_THRESHOLD) compact = false;

  return { compact, lastY: y, direction, travel: compact === current.compact ? travel : 0 };
}

interface AndroidTabBarContextValue {
  compact: boolean;
  reportScroll(y: number): void;
  reset(): void;
}

const AndroidTabBarContext = createContext<AndroidTabBarContextValue | null>(null);

export function AndroidTabBarStateProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef(initialAndroidTabBarScrollState);
  const [compact, setCompact] = useState(false);

  const reportScroll = useCallback((y: number) => {
    const next = nextAndroidTabBarScrollState(stateRef.current, y);
    const changed = next.compact !== stateRef.current.compact;
    stateRef.current = next;
    if (changed) setCompact(next.compact);
  }, []);

  const reset = useCallback(() => {
    const changed = stateRef.current.compact;
    stateRef.current = initialAndroidTabBarScrollState;
    if (changed) setCompact(false);
  }, []);

  const value = useMemo(() => ({ compact, reportScroll, reset }), [compact, reportScroll, reset]);
  return <AndroidTabBarContext.Provider value={value}>{children}</AndroidTabBarContext.Provider>;
}

export function useAndroidTabBarState(): AndroidTabBarContextValue | null {
  return useContext(AndroidTabBarContext);
}
