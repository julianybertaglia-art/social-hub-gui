import './globals.css';
import './home-cleanup.css';
import './styles/tokens.css';
import './styles/ui.css';
import '@fontsource-variable/hanken-grotesk';
import SiteShell from './SiteShell';

export const metadata = {
  title: 'TidePlace',
  description: 'Flow with your audience.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <SiteShell isPreview={process.env.VERCEL_ENV==='preview'}>{children}</SiteShell>
      </body>
    </html>
  );
}
