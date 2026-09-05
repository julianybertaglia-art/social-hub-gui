import './globals.css';
import CloudGate from './CloudGate';
import AutomationShortcut from './AutomationShortcut';
import InstagramAccountEvidence from './InstagramAccountEvidence';

export const metadata = {
  title: 'Gui Social Hub',
  description: 'Central estratégica do Instagram do Gui Nonato',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <CloudGate>
          {children}
          <InstagramAccountEvidence />
          <AutomationShortcut />
        </CloudGate>
      </body>
    </html>
  );
}
