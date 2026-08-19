export const ACCOUNT_DELETE_CONFIRMATION = 'DELETE MY LIVING PLOT DATA';

export interface AccountExportSnapshot {
  schemaVersion: 3;
  exportedAt: string;
  preferences: Record<string, unknown>;
  entitlement: Record<string, unknown>;
  usage: unknown[];
  referral: Record<string, unknown>;
  dramas: unknown[];
}

export interface AccountDataClient {
  readonly configured: boolean;
  loadExport(): Promise<AccountExportSnapshot>;
  deleteAccount(confirmation: string): Promise<void>;
}
