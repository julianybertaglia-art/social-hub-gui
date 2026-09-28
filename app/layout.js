import './globals.css';
import './home-cleanup.css';
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
