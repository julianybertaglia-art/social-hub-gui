'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './whatsapp.module.css';

const STAGES = ['Novo lead', 'Conversando', 'Interessado', 'Link enviado', 'Venda', 'Perdido'];
const SMART_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'reply', label: 'Para responder' },
  { id: 'followup', label: 'Para chamar' },
  { id: 'hot', label: 'Quentes' },
  { id: 'imersao', label: 'Imersão' },
  { id: 'mentoria', label: 'Mentoria' },
  { id: 'argo', label: 'ARGO' },
  { id: 'treinamento', label: 'Treinamento' },
];

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return '+55 (' + digits.slice(2, 4) + ') ' + digits.slice(4, 9) + '-' + digits.slice(9);
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return '+55 (' + digits.slice(2, 4) + ') ' + digits.slice(4, 8) + '-' + digits.slice(8);
  }
  return digits ? '+' + digits : 'Sem número';
}

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function matchesFilter(contact, filter) {
  if (filter === 'all') return true;
  if (filter === 'reply') return Boolean(contact.needs_reply);
  if (filter === 'followup') return Boolean(contact.needs_follow_up);
  if (filter === 'hot') return contact.smart_priority === 'high';

  const categories = contact.smart_categories || [];
  if (filter === 'imersao') return categories.includes('Imersão');
  if (filter === 'mentoria') return categories.includes('Mentoria');
  if (filter === 'argo') return categories.includes('ARGO');
  if (filter === 'treinamento') return categories.includes('Treinamento');
  return true;
}

function contactAction(contact) {
  if (!contact) return 'Selecione um lead';
  if (contact.needs_reply) return 'Responder agora';
  if (contact.needs_follow_up) return 'Fazer follow-up';
  if (contact.smart_priority === 'high') return 'Lead quente — acompanhar de perto';
  return 'Sem ação urgente';
}

export default function WhatsAppPage() {
  const [status, setStatus] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const selected = contacts.find((contact) => contact.id === selectedId) || null;
  const isBaileys = status?.provider === 'baileys';
  const connectionReady = Boolean(status?.connected || status?.configured);
  const bridgeWaiting = ['starting', 'connecting', 'reconnecting'].includes(status?.state);

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/whatsapp/status', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar o status do WhatsApp.');
    setStatus(data);
    return data;
  }, []);

  const loadContacts = useCallback(async () => {
    const response = await fetch('/api/whatsapp/conversations', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar os leads.');
    setContacts(data.contacts || []);
    setSelectedId((current) => current || data.contacts?.[0]?.id || null);
  }, []);

  const loadMessages = useCallback(async (contactId) => {
    if (!contactId) {
      setMessages([]);
      return;
    }
    const response = await fetch('/api/whatsapp/conversations?contact=' + encodeURIComponent(contactId), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar a conversa.');
    setMessages(data.messages || []);
    if (data.contacts) setContacts(data.contacts);
  }, []);

  useEffect(() => {
    Promise.all([loadStatus(), loadContacts()])
      .catch((error) => setNotice(error.message));
  }, [loadStatus, loadContacts]);

  useEffect(() => {
    loadMessages(selectedId).catch((error) => setNotice(error.message));
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadStatus().catch(() => {});
      loadContacts().catch(() => {});
      if (selectedId) loadMessages(selectedId).catch(() => {});
    }, isBaileys ? 3000 : 8000);
    return () => clearInterval(timer);
  }, [isBaileys, selectedId, loadStatus, loadContacts, loadMessages]);

  const filterCounts = useMemo(() => {
    const counts = {};
    for (const filter of SMART_FILTERS) {
      counts[filter.id] = contacts.filter((contact) => matchesFilter(contact, filter.id)).length;
    }
    return counts;
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (!matchesFilter(contact, activeFilter)) return false;
      if (!term) return true;
      return [
        contact.profile_name,
        contact.phone,
        contact.stage,
        contact.last_message_body,
        ...(contact.tags || []),
        ...(contact.smart_categories || []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [contacts, search, activeFilter]);

  function chooseFilter(filterId) {
    setActiveFilter(filterId);
    setSearch('');
    const first = contacts.find((contact) => matchesFilter(contact, filterId));
    if (first) setSelectedId(first.id);
  }

  async function handleBridgeAction(action) {
    setBridgeBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/whatsapp/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível controlar a conexão.');
      setStatus((current) => ({ ...(current || {}), ...data }));
      await loadStatus();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBridgeBusy(false);
    }
  }

  async function updateContact(patch) {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch('/api/whatsapp/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...patch }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível salvar.');
      setContacts((current) => current.map((contact) =>
        contact.id === data.contact.id ? { ...contact, ...data.contact } : contact
      ));
      setNotice('Alteração salva.');
      loadContacts().catch(() => {});
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!selected || !text) return;
    setSending(true);
    setNotice('');
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: selected.wa_id, text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível enviar.');
      setDraft('');
      await Promise.all([loadContacts(), loadMessages(selected.id)]);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>← Voltar para o Hub</Link>
          <span className={styles.eyebrow}>ATENDIMENTO & CRM</span>
          <h1>WhatsApp</h1>
          <p>O Hub organiza quem precisa de atenção e separa os leads por interesse.</p>
        </div>
        <div className={styles.connectionGroup}>
          <div className={styles.connection + ' ' + (connectionReady ? styles.online : styles.pending)}>
            <span />
            {connectionReady
              ? 'WhatsApp conectado'
              : isBaileys && status?.state === 'awaiting_qr'
                ? 'Aguardando leitura do QR'
                : isBaileys && status?.state === 'reconnecting'
                  ? 'Reconectando WhatsApp'
                  : 'Conexão pendente'}
          </div>
          {isBaileys && connectionReady && (
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={() => handleBridgeAction('disconnect')}
              disabled={bridgeBusy}
            >
              {bridgeBusy ? 'Desconectando...' : 'Desconectar'}
            </button>
          )}
        </div>
      </header>

      {isBaileys ? (
        !connectionReady && (
          <section className={styles.setupCard}>
            <div>
              <span className={styles.eyebrow}>CONEXÃO POR QR CODE</span>
              <h2>{status?.state === 'awaiting_qr' && status?.qrDataUrl ? 'Escaneie o QR Code do WhatsApp.' : 'Conecte o WhatsApp pelo QR Code.'}</h2>
              <p>Use o número do atendimento aos leads. Esta conexão é separada da Meta e do número da Vital.</p>
              {status?.error && <p className={styles.bridgeError}>{status.error}</p>}
            </div>
            <div className={styles.bridgeSetup}>
              {status?.qrDataUrl ? (
                <div className={styles.qrBox}>
                  <img className={styles.qrImage} src={status.qrDataUrl} alt="QR Code para conectar o WhatsApp" />
                  <span>WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho.</span>
                </div>
              ) : (
                <div className={styles.bridgeState}>
                  <strong>{bridgeWaiting ? 'Preparando a conexão...' : 'Pronto para gerar um QR Code.'}</strong>
                  <span>O QR aparecerá aqui quando a ponte estiver online.</span>
                </div>
              )}
              <button
                type="button"
                className={styles.bridgeAction}
                onClick={() => handleBridgeAction(status?.qrDataUrl ? 'relink' : 'connect')}
                disabled={bridgeBusy || bridgeWaiting}
              >
                {bridgeBusy ? 'Abrindo conexão...' : status?.qrDataUrl ? 'Gerar outro QR Code' : 'Conectar WhatsApp'}
              </button>
            </div>
          </section>
        )
      ) : (
        !status?.configured && (
          <section className={styles.setupCard}>
            <div>
              <span className={styles.eyebrow}>ÚLTIMO PASSO</span>
              <h2>O Hub já está pronto para receber o WhatsApp.</h2>
              <p>Agora falta vincular o número na Meta e cadastrar as credenciais no ambiente do Hub.</p>
            </div>
            <div className={styles.setupGrid}>
              <div><span>Callback do webhook</span><code>{status?.webhookUrl || '/api/whatsapp/webhook'}</code></div>
              <div><span>Variáveis necessárias</span><code>META_WHATSAPP_ACCESS_TOKEN</code><code>META_WHATSAPP_PHONE_NUMBER_ID</code><code>META_WHATSAPP_VERIFY_TOKEN</code><code>META_APP_SECRET</code></div>
            </div>
          </section>
        )
      )}

      {notice && <button className={styles.notice} onClick={() => setNotice('')}>{notice} ×</button>}

      <section className={styles.smartBar}>
        <div className={styles.smartBarIntro}>
          <strong>Fila inteligente</strong>
          <span>Escolha o que você quer resolver agora.</span>
        </div>
        <div className={styles.smartFilters}>
          {SMART_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.id}
              className={styles.smartFilter + ' ' + (activeFilter === filter.id ? styles.smartFilterActive : '')}
              onClick={() => chooseFilter(filter.id)}
            >
              <span>{filter.label}</span>
              <b>{filterCounts[filter.id] || 0}</b>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.workspace}>
        <aside className={styles.contactsPane}>
          <div className={styles.paneHeading}>
            <div><span className={styles.eyebrow}>LEADS</span><h2>{SMART_FILTERS.find((item) => item.id === activeFilter)?.label || 'Conversas'}</h2></div>
            <span className={styles.count}>{filteredContacts.length}</span>
          </div>
          <input
            className={styles.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar dentro desta fila..."
          />
          <div className={styles.contactList}>
            {!filteredContacts.length && <div className={styles.empty}>Nenhum lead nesta fila agora.</div>}
            {filteredContacts.map((contact) => {
              const topic = contact.smart_categories?.[0];
              const attention = contact.needs_reply
                ? 'Responder agora'
                : contact.needs_follow_up
                  ? 'Chamar novamente'
                  : topic || contact.stage;
              return (
                <button
                  type="button"
                  key={contact.id}
                  className={styles.contact + ' ' + (selectedId === contact.id ? styles.selected : '')}
                  onClick={() => setSelectedId(contact.id)}
                >
                  <div className={styles.avatar}>{(contact.profile_name || 'W').slice(0, 1).toUpperCase()}</div>
                  <div className={styles.contactCopy}>
                    <strong>{contact.profile_name || formatPhone(contact.phone)}</strong>
                    <span>{contact.profile_name ? formatPhone(contact.phone) : contact.source}</span>
                    <small className={contact.needs_reply ? styles.needsReply : contact.needs_follow_up ? styles.needsFollowUp : ''}>{attention}</small>
                  </div>
                  <time>{formatTime(contact.last_message_sent_at || contact.last_message_at)}</time>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={styles.chatPane}>
          {!selected ? (
            <div className={styles.chatEmpty}>
              <strong>Escolha um lead para começar.</strong>
              <span>Use os filtros acima para ver quem precisa de resposta, follow-up ou separar por assunto.</span>
            </div>
          ) : (
            <>
              <div className={styles.chatHeader}>
                <div>
                  <strong>{selected.profile_name || formatPhone(selected.phone)}</strong>
                  <span>{formatPhone(selected.phone)} · {(selected.smart_categories || []).join(' · ') || selected.source}</span>
                </div>
                <select value={selected.stage} onChange={(event) => updateContact({ stage: event.target.value })} disabled={saving}>
                  {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
                </select>
              </div>

              <div className={styles.messages}>
                {!messages.length && <div className={styles.empty}>Ainda não há mensagens salvas para este lead.</div>}
                {messages.map((message) => (
                  <div key={message.id} className={styles.bubble + ' ' + (message.direction === 'outbound' ? styles.outbound : styles.inbound)}>
                    <p>{message.body || '[' + message.message_type + ']'}</p>
                    <span>{formatTime(message.sent_at)}{message.direction === 'outbound' && message.status ? ' · ' + message.status : ''}</span>
                  </div>
                ))}
              </div>

              <form className={styles.composer} onSubmit={sendMessage}>
                <textarea
                  rows="2"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={connectionReady ? 'Digite sua mensagem...' : 'Conecte o número para responder pelo Hub'}
                  disabled={!connectionReady || sending}
                />
                <button disabled={!connectionReady || sending || !draft.trim()}>{sending ? 'Enviando...' : 'Enviar'}</button>
              </form>
            </>
          )}
        </section>

        <aside className={styles.crmPane}>
          <span className={styles.eyebrow}>CRM DO LEAD</span>
          {!selected ? (
            <div className={styles.empty}>Selecione uma conversa para ver os dados do lead.</div>
          ) : (
            <div className={styles.crmForm}>
              <div className={styles.smartCard}>
                <span>PRÓXIMA AÇÃO</span>
                <strong>{contactAction(selected)}</strong>
                <p>{(selected.smart_categories || []).length ? selected.smart_categories.join(' · ') : 'Assunto ainda não identificado'}</p>
              </div>
              <label>Origem<input value={selected.source || 'WhatsApp'} readOnly /></label>
              <label>Etapa<select value={selected.stage} onChange={(event) => updateContact({ stage: event.target.value })} disabled={saving}>{STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
              <label>Tags<input defaultValue={(selected.tags || []).join(', ')} key={'tags-' + selected.id + '-' + (selected.tags || []).join('|')} onBlur={(event) => updateContact({ tags: event.target.value.split(',') })} placeholder="Imersão, Mentoria, ARGO..." /></label>
              <label>Observações<textarea rows="7" defaultValue={selected.notes || ''} key={'notes-' + selected.id + '-' + (selected.notes || '')} onBlur={(event) => updateContact({ notes: event.target.value })} placeholder="O que esse lead quer? O que falta para fechar?" /></label>
              <small>{saving ? 'Salvando...' : 'Alterações são salvas ao sair do campo.'}</small>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
