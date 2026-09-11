'use client';

import { createContext, useContext, useState } from 'react';

const AccountContext = createContext(null);
const profiles = [
  { id: 'gui-nonato', name: 'Gui Nonato', username: 'gui_nonato', initials: 'GN', status: 'connected' },
  { id: 'vital-decor', name: 'Vital Decor', username: '', initials: 'VD', status: 'setup_needed' },
];

export function AccountProvider({ children }) {
  const [activeAccount, setActiveAccount] = useState(profiles[0]);
  const selectAccount = (id) => {
    const next = profiles.find((item) => item.id === id);
    if (next) setActiveAccount(next);
  };
  return <AccountContext.Provider value={{ profiles, activeAccount, selectAccount }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  return useContext(AccountContext);
}
