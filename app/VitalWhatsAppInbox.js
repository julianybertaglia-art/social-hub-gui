'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './CloudGate';
import styles from './vital-whatsapp-inbox.module.css';

function clock(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function phoneLabel(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13) {
    return '+55 (' + digits.slice(2,4) + ') ' + digits.slice(4,9) + '-' + digits.slice(9);
  }
  return digits ? '+' + digits : 'Sem número';
}

export default function VitalWhatsAppInbox() {
  const [contacts, setContacts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routesReady, setRoutesReady] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [account, setAccount] = useState(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const selected = contacts.find(item => item.id === selectedId) || null;

  const request = useCallback(async (path, options = {}) => {
    if (!supabase) throw new Error('A conexão com TidePlace está indisponível.');
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data?.session?.access_token) throw new Error('Entre novamente no TidePlace.');
    const response = await fetch(path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + data.session.access_token,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o WhatsApp da Vital.');
    return payload;
  }, []);

  const load = useCallback(async (contactId = '', background = false) => {
    if (!background) setLoading(true);
    else setRefreshing(true);
    try {
      const suffix = contactId ? '?contact=' + encodeURIComponent(contactId) : '';
      const [data, routing] = await Promise.all([
        request('/api/vital-whatsapp/conversations' + suffix),
        request('/api/vital-whatsapp/argo-routing'),
      ]);
      setRoutes(routing.assignments || []);
      setRoutesReady(true);
      if (data.workspace !== 'vital-decor') throw new Error('Resposta recebida de outro workspace.');
      setContacts(data.contacts || []);
      setAccount(data.account || null);
      setSelectedId(current => {
        const next = (data.contacts || []).some(item => item.id === current) ? current : (data.contacts?.[0]?.id || '');
        return next;
      });
      if (contactId) setMessages(data.messages || []);
      else if (!data.contacts?.length) setMessages([]);
      setError('');
    } catch (failure) {
      setRoutesReady(false);
      setError(failure.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request]);

  useEffect(() => {
    void load(selectedId);
    const timer = window.setInterval(() => { void load(selectedId, true); }, 10000);
    return () => window.clearInterval(timer);
  }, [selectedId, load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter(item => !term ||
      [item.name, item.phone, item.lastMessage].some(v => String(v || '').toLowerCase().includes(term)));
  }, [contacts, search]);

  const lastInbound = selected?.lastInboundAt || null;
  const activeRoute = routes.find(item => item.contact_wa_id === selectedId);
  const inArgo = Boolean(activeRoute && activeRoute.assigned_to !== 'tide' && activeRoute.status !== 'closed');
  const canReply = Boolean(lastInbound && selected?.canReply && routesReady && !inArgo);

  async function returnToTide() {
    if (!activeRoute || !selected) return;
    setError('');
    try {
      await request('/api/vital-whatsapp/argo-routing', {
        method: 'POST',
        body: JSON.stringify({ action:'assign',phone:selected.id,sector:activeRoute.sector,assignee:'tide' }),
      });
      setNotice('Conversa transferida de volta para seu atendimento no TidePlace.');
      await load(selected.id,true);
    } catch (failure) { setError(failure.message); }
  }

  async function send(event) {
    event.preventDefault();
    if (sending || !selected || !canReply || !draft.trim()) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const payload = await request('/api/vital-whatsapp/conversations/send', {
        method: 'POST',
        body: JSON.stringify({ to: selected.id, text: draft.trim() }),
      });
      setDraft('');
      setNotice(payload.warning || 'Mensagem enviada pelo WhatsApp da Vital Decor.');
      await load(selected.id, true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>TIDEPLACE · VITAL DECOR · WHATSAPP</p>
          <h1>Caixa de entrada</h1>
          <p>Converse com os clientes da loja, sem misturar os leads do Gui Nonato.</p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.connected}><i /> WhatsApp Vital conectado</span>
          <button type="button" onClick={() => load(selectedId, true)} disabled={refreshing}>
            {refreshing ? 'Atualizando...' : '↻ Atualizar'}
          </button>
          <Link href="/conexoes/vital-decor">Conexões</Link>
        </div>
      </header>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Conversas da Vital Decor">
          <div className={styles.sidebarTop}>
            <div className={styles.sectionTitle}>
              <h2>Conversas</h2>
              <span>{contacts.length}</span>
            </div>
            <input aria-label="Buscar contatos" placeholder="Buscar nome, número ou mensagem..."
              value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <div className={styles.contacts}>
            {loading && !contacts.length ? <p className={styles.empty}>Carregando conversas...</p> : null}
            {!loading && !visible.length ? <p className={styles.empty}>Nenhuma conversa encontrada. Novas mensagens aparecerão aqui automaticamente.</p> : null}
            {visible.map(contact => (
              <button key={contact.id} type="button" onClick={() => { setSelectedId(contact.id); setDraft(''); setNotice(''); }}
                className={contact.id === selectedId ? styles.selectedContact : styles.contact}
                aria-pressed={contact.id === selectedId}>
                <span className={styles.avatar}>{(contact.name || 'V').slice(0,1).toUpperCase()}</span>
                <span className={styles.contactText}>
                  <strong>{contact.name || phoneLabel(contact.phone)}</strong>
                  <small>{phoneLabel(contact.phone)}{routes.find(r => r.contact_wa_id === contact.id && r.status !== 'closed' && r.assigned_to !== 'tide') ? ' · Argo' : ''}</small>
                  <span>{contact.lastDirection === 'outbound' ? 'Você: ' : ''}{contact.lastMessage || 'Mensagem recebida'}</span>
                </span>
                <time>{clock(contact.lastMessageAt)}</time>
              </button>
            ))}
          </div>
        </aside>
        <section className={styles.chat} aria-label="Mensagens do WhatsApp">
          {selected ? (
            <>
              <div className={styles.chatHead}>
                <span className={styles.avatar}>{(selected.name || 'V').slice(0,1).toUpperCase()}</span>
                <div><strong>{selected.name}</strong><span>{phoneLabel(selected.phone)}</span></div>
                <span className={styles.manual}>{inArgo ? 'Com ' + activeRoute.assigned_to + ' no Argo' : 'Atendimento TidePlace'}</span>
              </div>
              <div className={styles.messages}>
                {!messages.length && loading ? <p className={styles.empty}>Carregando mensagens...</p> : null}
                {!messages.length && !loading ? <p className={styles.empty}>Sem mensagens sincronizadas para este contato.</p> : null}
                {messages.map(msg => (
                  <article key={msg.id} className={msg.direction === 'outbound' ? styles.sent : styles.received}>
                    <p>{msg.body || '[' + (msg.type || 'mídia') + ']'}</p>
                    <time>{clock(msg.sentAt)} · {msg.direction === 'outbound' ? (msg.status || 'enviado') : 'recebido'}</time>
                  </article>
                ))}
              </div>
              {inArgo ? (
                <div className={styles.outsideWindow}>
                  <strong>Atendimento atribuído a {activeRoute.assigned_to} no Argo</strong>
                  <span>Você pode acompanhar o histórico aqui. Para assumir e responder pelo TidePlace, transfira primeiro.</span>
                  <button type="button" onClick={returnToTide} style={{marginTop:8,alignSelf:'start',border:'1px solid var(--border)',padding:'9px 12px',borderRadius:8,background:'var(--surface)',color:'var(--text)',cursor:'pointer'}}>Assumir no TidePlace</button>
                </div>
              ) : canReply ? (
                <form className={styles.composer} onSubmit={send}>
                  <textarea value={draft} onChange={event => setDraft(event.target.value)}
                    placeholder="Escreva sua resposta para o cliente..." aria-label="Escrever mensagem"
                    maxLength={4096} rows={2} disabled={sending} />
                  <button type="submit" disabled={!draft.trim() || sending}>{sending ? 'Enviando...' : 'Enviar →'}</button>
                </form>
              ) : (
                <div className={styles.outsideWindow}>
                  <strong>{!routesReady ? 'Verificando atribuição da conversa' : 'Janela de atendimento encerrada'}</strong>
                  <span>Para enviar uma nova mensagem fora das 24 horas, a Meta exige um modelo aprovado. O envio livre permanece bloqueado para sua segurança.</span>
                </div>
              )}
            </>
          ) : (
            <div className={styles.welcome}>
              <div className={styles.bigIcon}>◉</div>
              <h2>WhatsApp da Vital Decor</h2>
              <p>Selecione uma conversa à esquerda para visualizar e responder os clientes.</p>
              <small>{account?.number ? 'Número conectado: ' + account.number : 'Aguardando mensagens da conta conectada'}</small>
            </div>
          )}
        </section>
      </div>
      <p className={styles.footnote}>Mensagens sincronizadas pela Meta · A Vivi pausa quando o atendimento passa para uma pessoa · Conversas atribuídas ao Argo são acompanhadas aqui, mas respondidas no Argo.</p>
    </main>
  );
}
