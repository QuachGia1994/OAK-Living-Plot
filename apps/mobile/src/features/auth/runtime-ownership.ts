import type { MobileAuthSession } from './mobile-auth-context';

export function runtimeOwnershipKey(
  apiBaseUrl: string,
  auth: Pick<MobileAuthSession, 'configured' | 'isLoaded' | 'isSignedIn' | 'clerkUserId'>,
): string {
  if (!apiBaseUrl.trim() || !auth.configured) return 'preview';
  if (!auth.isLoaded) return 'live:loading';
  if (!auth.isSignedIn || !auth.clerkUserId) return 'live:signed-out';
  return `live:user:${auth.clerkUserId}`;
}
