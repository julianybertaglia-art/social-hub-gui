import { Suspense } from 'react';
import './globals.css';
import './home-cleanup.css';
import './lynna-theme.css';
import CloudGate from './CloudGate';
import HubFrame from './HubFrame';

export const metadata = {
  title: 'Lynna · your social space.',
  description: 'Conteúdo, relacionamento e performance em um só espaço.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <CloudGate>
          <Suspense fallback={children}>
            <HubFrame>{children}</HubFrame>
          </Suspense>
        </CloudGate>
      </body>
    </html>
  );
}
