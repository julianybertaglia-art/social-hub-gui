import { Suspense } from 'react';
import './globals.css';
import './lynna-theme.css';
import './home-cleanup.css';
import './typography.css';
import './editorial.css';
import CloudGate from './CloudGate';
import HubFrame from './HubFrame';
import { AccountProvider } from './AccountContext';

export const metadata = {
  title: 'Lynna · your social space.',
  description: 'Conteúdo, relacionamento e performance em um só espaço.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <CloudGate>
          <AccountProvider>
            <Suspense fallback={children}>
              <HubFrame>{children}</HubFrame>
            </Suspense>
          </AccountProvider>
        </CloudGate>
      </body>
    </html>
  );
}
