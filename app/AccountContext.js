'use client';

import { createContext, useContext, useState } from 'react';

const AccountContext = createContext(null);
const gui = { id: 'gui-nonato', name: 'Gui Nonato', username: 'gui_nonato' };

export function AccountProvider({ children }) {
  const [activeAccount, setActiveAccount] = useState(gui);
  return <AccountContext.Provider value={{ activeAccount, setActiveAccount }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  return useContext(AccountContext);
}
