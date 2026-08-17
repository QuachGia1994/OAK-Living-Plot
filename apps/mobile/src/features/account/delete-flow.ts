import type { AccountDataClient } from './contracts';

export type AccountDeleteFlowResult = 'deleted_and_signed_out' | 'deleted_signout_failed';

export async function deleteAccountThenSignOut(
  account: AccountDataClient,
  confirmation: string,
  signOut: () => Promise<void>,
): Promise<AccountDeleteFlowResult> {
  await account.deleteAccount(confirmation);
  try {
    await signOut();
    return 'deleted_and_signed_out';
  } catch {
    return 'deleted_signout_failed';
  }
}
