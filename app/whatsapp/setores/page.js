import Link from 'next/link';

export default function SectorInboxRoute() {
  // HubFrame renders the Vital Decor sector inbox for the Vital workspace.
  // In other workspaces this route must not expose Vital messages.
  return (
    <main style={{ maxWidth: 720, padding: '44px 28px', margin: 'auto' }}>
      <h1>Meus setores · Vital Decor</h1>
      <p>Esta caixa pertence exclusivamente ao workspace Vital Decor.</p>
      <Link href="/whatsapp">Voltar à caixa de entrada</Link>
    </main>
  );
}
