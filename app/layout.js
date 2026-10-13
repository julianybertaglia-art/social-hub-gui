import './globals.css';
import './home-cleanup.css';
import './styles/tokens.css';
import './styles/ui.css';
import '@fontsource-variable/hanken-grotesk';
import CloudGate from './CloudGate';
import HubFrame from './HubFrame';

export const metadata = {
  title: 'TidePlace',
  description: 'Flow with your audience.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <CloudGate>
          <HubFrame>{children}</HubFrame>
        </CloudGate>
      </body>
    </html>
  );
}
