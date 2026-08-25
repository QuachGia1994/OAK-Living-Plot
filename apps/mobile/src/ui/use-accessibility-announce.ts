import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

const MIN_ANNOUNCE_INTERVAL_MS = 900;

export function useAccessibilityAnnouncement(message: string | null | undefined): void {
  const previous = useRef<string | null>(null);
  const lastAnnouncedAt = useRef(0);

  useEffect(() => {
    const text = message?.trim();
    if (!text || text === previous.current) return;
    previous.current = text;
    const now = Date.now();
    if (now - lastAnnouncedAt.current < MIN_ANNOUNCE_INTERVAL_MS) return;
    lastAnnouncedAt.current = now;
    AccessibilityInfo.announceForAccessibility(text);
  }, [message]);
}
