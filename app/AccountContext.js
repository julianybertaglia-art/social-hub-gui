'use client';

import { createContext, useContext } from 'react';

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  return <AccountContext.Provider value={{}}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  return useContext(AccountContext);
}
