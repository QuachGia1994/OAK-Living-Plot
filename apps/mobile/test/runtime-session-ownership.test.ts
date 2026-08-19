import { describe, expect, it } from 'vitest';
import { runtimeOwnershipKey } from '../src/features/auth/runtime-ownership';

describe('authenticated runtime ownership', () => {
  it('keeps preview state independent from live session state', () => {
    expect(runtimeOwnershipKey('', session(false, true, false, null))).toBe('preview');
    expect(runtimeOwnershipKey('https://api.test', session(false, true, false, null))).toBe('preview');
    expect(runtimeOwnershipKey('https://api.test', session(true, false, false, null))).toBe('live:loading');
    expect(runtimeOwnershipKey('https://api.test', session(true, true, false, null))).toBe('live:signed-out');
  });

  it('changes the runtime owner across sign-out and account changes so session-owned state remounts', () => {
    const ownerOne = runtimeOwnershipKey('https://api.test', session(true, true, true, 'clerk-user-1'));
    const signedOut = runtimeOwnershipKey('https://api.test', session(true, true, false, null));
    const ownerTwo = runtimeOwnershipKey('https://api.test', session(true, true, true, 'clerk-user-2'));

    expect(ownerOne).toBe('live:user:clerk-user-1');
    expect(signedOut).not.toBe(ownerOne);
    expect(ownerTwo).not.toBe(ownerOne);
    expect(ownerTwo).not.toBe(signedOut);
  });
});

function session(configured: boolean, isLoaded: boolean, isSignedIn: boolean, clerkUserId: string | null) {
  return { configured, isLoaded, isSignedIn, clerkUserId };
}
