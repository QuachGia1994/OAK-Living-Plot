import { createContext, useContext, type ReactNode } from 'react';
import type { BillingSession } from './contracts';

const BillingSessionContext = createContext<BillingSession | null>(null);

export function BillingSessionProvider({
  session,
  children,
}: {
  session: BillingSession | null;
  children: ReactNode;
}) {
  return <BillingSessionContext.Provider value={session}>{children}</BillingSessionContext.Provider>;
}

export function useBillingSession(): BillingSession | null {
  return useContext(BillingSessionContext);
}
