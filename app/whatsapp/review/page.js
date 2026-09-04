'use client';

import { useState } from 'react';
import Link from 'next/link';

const card = {
  background: '#ffffff',
  border: '1px solid #e7e9ee',
  borderRadius: 18,
  padding: 24,
  boxShadow: '0 12px 35px rgba(15,23,42,.06)',
};

const inputStyle = {
  width: '100%',
  border: '1px solid #d9dee8',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
};

const buttonStyle = {
  border: 0,
  borderRadius: 12,
  padding: '12px 18px',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  background: '#2563eb',
  color: '#fff',
};

function Result({ result }) {
  if (!result) return null;
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: result.ok ? '#ecfdf5' : '#fef2f2', color: result.ok ? '#065f46' : '#991b1b', fontSize: 14 }}>
      <strong>{result.ok ? 'Concluído' : 'Erro'}</strong>
      <div style={{ marginTop: 5 }}>{result.message}</div>
    </div>
  );
}

export default function WhatsAppReviewPage() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('Olá! Esta é uma mensagem de teste enviada pelo Social Hub para a análise da Meta.');
  const [sendResult, setSendResult] = useState(null);
  const [sending, setSending] = useState(false);

  const [templateName, setTemplateName] = useState('');
  const [templateText, setTemplateText] = useState('Olá! Esta é uma mensagem de teste do Social Hub para a análise da Meta.');
  const [templateResult, setTemplateResult] = useState(null);
  const [creating, setCreating] = useState(false);

  async function sendMessage(event) {
    event.preventDefault();
    setSending(true);
    setSendResult(null);
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, text: message }),
      });
      const data = await response.json();
      setSendResult({ ok: Boolean(data.ok), message: data.ok ? `Mensagem enviada. ID: ${data.messageId || 'ok'}` : (data.error || 'Falha ao enviar.') });
    } catch (error) {
      setSendResult({ ok: false, message: error instanceof Error ? error.message : 'Falha ao enviar.' });
    } finally {
      setSending(false);
    }
  }

  async function createTemplate(event) {
    event.preventDefault();
    setCreating(true);
    setTemplateResult(null);
    try {
      const response = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName, text: templateText }),
      });
      const data = await response.json();
      setTemplateResult({
        ok: Boolean(data.ok),
        message: data.ok
          ? `Modelo criado: ${data.name}. Status retornado pela Meta: ${data.result?.status || 'enviado para análise'}.`
          : (data.error || 'Falha ao criar modelo.'),
      });
    } catch (error) {
      setTemplateResult({ ok: false, message: error instanceof Error ? error.message : 'Falha ao criar modelo.' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f6f8fb', padding: '40px 22px', color: '#172033', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', marginBottom: 26, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: '#2563eb' }}>GUI SOCIAL HUB · WHATSAPP</div>
            <h1 style={{ margin: '7px 0 5px', fontSize: 32 }}>Teste para análise da Meta</h1>
            <p style={{ margin: 0, color: '#667085' }}>Use esta tela somente para demonstrar as permissões solicitadas na análise do app.</p>
          </div>
          <Link href="/whatsapp" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>← Voltar ao CRM</Link>
        </div>

        <div style={{ display: 'grid', gap: 22 }}>
          <section style={card}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#eff6ff', fontWeight: 900, color: '#2563eb' }}>1</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Enviar mensagem</h2>
                <div style={{ color: '#667085', marginTop: 3 }}>Permissão: whatsapp_business_messaging</div>
              </div>
            </div>
            <form onSubmit={sendMessage} style={{ display: 'grid', gap: 13 }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>Número destinatário
                <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ex.: 5511999999999" required />
              </label>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>Mensagem
                <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={message} onChange={(e) => setMessage(e.target.value)} required />
              </label>
              <div><button style={buttonStyle} disabled={sending}>{sending ? 'Enviando...' : 'Enviar mensagem pelo WhatsApp'}</button></div>
            </form>
            <Result result={sendResult} />
          </section>

          <section style={card}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#ecfdf5', fontWeight: 900, color: '#047857' }}>2</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Criar modelo de mensagem</h2>
                <div style={{ color: '#667085', marginTop: 3 }}>Permissão: whatsapp_business_management</div>
              </div>
            </div>
            <form onSubmit={createTemplate} style={{ display: 'grid', gap: 13 }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>Nome do modelo <span style={{ fontWeight: 400, color: '#667085' }}>(opcional; se vazio o Hub gera um nome único)</span>
                <input style={inputStyle} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="social_hub_review" />
              </label>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>Texto do modelo
                <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={templateText} onChange={(e) => setTemplateText(e.target.value)} required />
              </label>
              <div><button style={{ ...buttonStyle, background: '#047857' }} disabled={creating}>{creating ? 'Criando...' : 'Criar modelo na Meta'}</button></div>
            </form>
            <Result result={templateResult} />
          </section>
        </div>

        <div style={{ marginTop: 20, color: '#667085', fontSize: 13, lineHeight: 1.55 }}>
          Esta página não exibe tokens nem segredos. As credenciais permanecem nas variáveis de ambiente do servidor.
        </div>
      </div>
    </main>
  );
}
