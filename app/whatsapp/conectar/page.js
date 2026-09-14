'use client';

import Link from 'next/link';
import ConnectWhatsApp from './ConnectWhatsApp';

export default function ConnectWhatsAppPage() {
  return (
    <main className="connect-page">
      <section className="connect-card">
        <Link href="/whatsapp" className="back">← Voltar para o WhatsApp CRM</Link>
        <span className="eyebrow">WHATSAPP BUSINESS + HUB</span>
        <h1>Conectar seu WhatsApp</h1>
        <p className="lead">
          O Hub vai usar o fluxo oficial da Meta para manter o número funcionando no WhatsApp Business do celular e também conectá-lo ao CRM.
        </p>
        <div className="connector"><ConnectWhatsApp /></div>
      </section>

      <style jsx>{`
        .connect-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 32px 18px;
          background: #f3f5f4;
          color: #17211d;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .connect-card {
          width: min(680px, 100%);
          padding: 36px;
          border: 1px solid #dfe6e2;
          border-radius: 24px;
          background: white;
          box-shadow: 0 20px 60px rgba(20, 48, 35, .08);
        }
        .back {
          display: inline-block;
          margin-bottom: 30px;
          color: #587067;
          text-decoration: none;
          font-size: 13px;
        }
        .eyebrow {
          display: block;
          margin-bottom: 8px;
          color: #138a5b;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .13em;
        }
        h1 {
          margin: 0;
          font-size: clamp(32px, 6vw, 48px);
          line-height: 1;
          letter-spacing: -.04em;
        }
        .lead {
          max-width: 560px;
          margin: 18px 0 28px;
          color: #617069;
          font-size: 15px;
          line-height: 1.6;
        }
        .connector :global(label) {
          display: block;
          margin: 0 0 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .connector :global(input) {
          width: 100%;
          box-sizing: border-box;
          min-height: 48px;
          margin-bottom: 10px;
          padding: 0 14px;
          border: 1px solid #cfd9d4;
          border-radius: 12px;
          outline: none;
          font: inherit;
        }
        .connector :global(input:focus) {
          border-color: #138a5b;
          box-shadow: 0 0 0 3px rgba(19, 138, 91, .10);
        }
        .connector :global(button) {
          min-height: 46px;
          padding: 0 18px;
          border: 0;
          border-radius: 12px;
          background: #138a5b;
          color: white;
          font-weight: 750;
          cursor: pointer;
        }
        .connector :global(button:disabled) {
          opacity: .45;
          cursor: wait;
        }
        .connector :global(p) {
          color: #617069;
          line-height: 1.5;
        }
        .connector :global(h2) {
          margin-bottom: 8px;
          color: #138a5b;
        }
        .connector :global(a) {
          color: #138a5b;
          font-weight: 700;
        }
        @media (max-width: 640px) {
          .connect-page { padding: 12px; }
          .connect-card { padding: 24px 20px; border-radius: 18px; }
        }
      `}</style>
    </main>
  );
}
