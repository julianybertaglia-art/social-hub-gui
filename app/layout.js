import './globals.css';
import './home-cleanup.css';
import CloudGate from './CloudGate';
import HubFrame from './HubFrame';
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
          <HubFrame>{children}</HubFrame>
          <InstagramAccountEvidence />
          <AutomationShortcut />
        </CloudGate>
      </body>
    </html>
  );
}
