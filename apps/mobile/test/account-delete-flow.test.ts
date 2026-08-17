import { describe, expect, it, vi } from 'vitest';
import type { AccountDataClient, AccountExportSnapshot } from '../src/features/account/contracts';
import { deleteAccountThenSignOut } from '../src/features/account/delete-flow';

function account(deleteAccount: AccountDataClient['deleteAccount']): AccountDataClient {
  return {
    configured: true,
    loadExport: async () => ({}) as AccountExportSnapshot,
    deleteAccount,
  };
}

describe('deleteAccountThenSignOut', () => {
  it('does not sign out when backend deletion fails', async () => {
    const signOut = vi.fn(async () => undefined);
    const failure = new Error('deletion failed');

    await expect(deleteAccountThenSignOut(account(async () => { throw failure; }), 'confirm', signOut)).rejects.toBe(failure);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('reports deleted state separately when Clerk sign-out fails', async () => {
    const deleteAccount = vi.fn(async () => undefined);
    const signOut = vi.fn(async () => { throw new Error('clerk unavailable'); });

    await expect(deleteAccountThenSignOut(account(deleteAccount), 'confirm', signOut)).resolves.toBe('deleted_signout_failed');
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('reports complete convergence after delete and sign-out succeed', async () => {
    await expect(deleteAccountThenSignOut(account(async () => undefined), 'confirm', async () => undefined)).resolves.toBe('deleted_and_signed_out');
  });
});
