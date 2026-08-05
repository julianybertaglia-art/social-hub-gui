import './globals.css';

export const metadata = {
  title: 'Gui Social Hub',
  description: 'Central estratégica do Instagram do Gui Nonato',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
