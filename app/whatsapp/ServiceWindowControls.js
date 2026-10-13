'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../CloudGate';
import {
  isSimpleApprovedWhatsAppTemplate,
  isWhatsAppServiceWindowOpen,
  mostRecentInboundAt,
} from '../api/whatsapp/service-window.js';

function timestampLabel(value) {
  if (!value) return 'nenhuma mensagem registrada';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export default function ServiceWindowControls({ contact, messages, connected, onSent, setNotice }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState('');
  const [sending, setSending] = useState(false);
  const lastInboundAt = useMemo(() =>
    mostRecentInboundAt((messages || []).filter((message) => message.contact_id === contact?.id)),
    [messages, contact?.id]
  );
  const isOpen = isWhatsAppServiceWindowOpen(lastInboundAt);

  useEffect(() => {
    if (!contact?.id || !connected || isOpen) {
      setTemplates([]);
      setChoice('');
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    fetch('/api/whatsapp/template-audit', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || 'Falha ao consultar a Meta.');
        return (data.templates || []).filter(isSimpleApprovedWhatsAppTemplate);
      })
      .then((items) => {
        if (!active) return;
        setTemplates(items);
        setChoice(items[0] ? items[0].name + '|' + items[0].language : '');
        setError('');
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [contact?.id, connected, isOpen]);

  if (!contact || !connected || isOpen) return null;
  const selected = templates.find((item) => item.name + '|' + item.language === choice) || null;
  const sample = selected?.components?.find((item) => item.type === 'BODY')?.text || '';

  async function sendTemplate() {
    if (!selected || sending || !contact?.wa_id) return;
    if (!window.confirm('Enviar este modelo aprovado ao contato? A Meta pode cobrar pelo envio.')) return;
    setSending(true);
    setNotice('');
    try {
      if (!supabase) throw new Error('Faça login no TidePlace para enviar modelos.');
      const { data: auth, error: authError } = await supabase.auth.getSession();
      if (authError || !auth?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente no TidePlace.');
      const response = await fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.session.access_token },
        body: JSON.stringify({
          to: contact.wa_id,
          templateName: selected.name,
          templateLanguage: selected.language,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'A Meta não aceitou o envio.');
      setNotice('O modelo foi encaminhado à Meta. Aguarde a confirmação de entrega; o contato precisa responder para reabrir a conversa livre.');
      await onSent();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section role="status" style={{
      margin: 12, padding: 12, borderRadius: 12,
      border: '1px solid #e4ba75', background: '#fff8ec', color: '#50361b',
    }}>
      <strong>Janela de 24 horas encerrada</strong>
      <p style={{ margin: '8px 0' }}>
        Última mensagem do lead: {timestampLabel(lastInboundAt)}.
        A Meta não permite enviar uma mensagem comum neste momento.
      </p>
      {loading ? <p>Consultando modelos aprovados...</p> : templates.length > 0 ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              aria-label="Modelo aprovado para retomar conversa"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              style={{ flex: 1, minWidth: 180, padding: 8 }}
            >
              {templates.map((item) => (
                <option key={item.name + item.language} value={item.name + '|' + item.language}>
                  {item.name.replaceAll('_', ' ')} ({item.language})
                </option>
              ))}
            </select>
            <button type="button" onClick={sendTemplate} disabled={!selected || sending}>
              {sending ? 'Enviando...' : 'Enviar modelo aprovado'}
            </button>
          </div>
          {sample && <small style={{ display: 'block', marginTop: 8 }}>{sample}</small>}
        </>
      ) : <p style={{ margin: '6px 0' }}>
        {error || 'Ainda não há modelo de texto simples aprovado disponível. É necessário ter um modelo aprovado na Meta para retomar pelo TidePlace.'}
      </p>}
      <small>Depois que o lead responder, a janela de mensagens comuns se abre novamente.</small>
    </section>
  );
}
