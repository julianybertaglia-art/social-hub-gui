'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './whatsapp.module.css';

const STAGES = ['Novo lead', 'Conversando', 'Interessado', 'Link enviado', 'Venda', 'Perdido'];

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return digits ? `+${digits}` : 'Sem número';
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

export default function WhatsAppPage() {
  const [status, setStatus] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  const selected = contacts.find((contact) => contact.id === selectedId) || null;

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
    const response = await fetch(`/api/whatsapp/conversations?contact=${encodeURIComponent(contactId)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar a conversa.');
    setMessages(data.messages || []);
    if (data.contacts) setContacts(data.contacts);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/whatsapp/status', { cache: 'no-store' }).then((response) => response.json()),
      loadContacts(),
    ])
      .then(([connection]) => setStatus(connection))
      .catch((error) => setNotice(error.message));
  }, [loadContacts]);

  useEffect(() => {
    loadMessages(selectedId).catch((error) => setNotice(error.message));
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadContacts().catch(() => {});
      if (selectedId) loadMessages(selectedId).catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [selectedId, loadContacts, loadMessages]);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) =>
      [contact.profile_name, contact.phone, contact.stage, ...(contact.tags || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [contacts, search]);

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
      setContacts((current) => current.map((contact) => contact.id === data.contact.id ? data.contact : contact));
      setNotice('Alteração salva.');
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
          <p>Leads, conversas e follow-up no mesmo lugar.</p>
        </div>
        <div className={`${styles.connection} ${status?.configured ? styles.online : styles.pending}`}>
          <span />
          {status?.configured ? 'WhatsApp conectado' : 'Conexão pendente'}
        </div>
      </header>

      {!status?.configured && (
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
      )}

      {notice && <button className={styles.notice} onClick={() => setNotice('')}>{notice} ×</button>}

      <section className={styles.workspace}>
        <aside className={styles.contactsPane}>
          <div className={styles.paneHeading}>
            <div><span className={styles.eyebrow}>LEADS</span><h2>Conversas</h2></div>
            <span className={styles.count}>{contacts.length}</span>
          </div>
          <input
            className={styles.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar nome, número ou etapa..."
          />
          <div className={styles.contactList}>
            {!filteredContacts.length && <div className={styles.empty}>Nenhuma conversa recebida ainda.</div>}
            {filteredContacts.map((contact) => (
              <button
                type="button"
                key={contact.id}
                className={`${styles.contact} ${selectedId === contact.id ? styles.selected : ''}`}
                onClick={() => setSelectedId(contact.id)}
              >
                <div className={styles.avatar}>{(contact.profile_name || 'W').slice(0, 1).toUpperCase()}</div>
                <div className={styles.contactCopy}>
                  <strong>{contact.profile_name || formatPhone(contact.phone)}</strong>
                  <span>{contact.profile_name ? formatPhone(contact.phone) : contact.source}</span>
                  <small>{contact.stage}</small>
                </div>
                <time>{formatTime(contact.last_message_at)}</time>
              </button>
            ))}
          </div>
        </aside>

        <section className={styles.chatPane}>
          {!selected ? (
            <div className={styles.chatEmpty}>
              <strong>As conversas vão aparecer aqui.</strong>
              <span>Assim que um lead mandar mensagem para o número conectado, o Hub cria o contato automaticamente.</span>
            </div>
          ) : (
            <>
              <div className={styles.chatHeader}>
                <div>
                  <strong>{selected.profile_name || formatPhone(selected.phone)}</strong>
                  <span>{formatPhone(selected.phone)} · {selected.source}</span>
                </div>
                <select value={selected.stage} onChange={(event) => updateContact({ stage: event.target.value })} disabled={saving}>
                  {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
                </select>
              </div>

              <div className={styles.messages}>
                {!messages.length && <div className={styles.empty}>Ainda não há mensagens salvas para este lead.</div>}
                {messages.map((message) => (
                  <div key={message.id} className={`${styles.bubble} ${message.direction === 'outbound' ? styles.outbound : styles.inbound}`}>
                    <p>{message.body || `[${message.message_type}]`}</p>
                    <span>{formatTime(message.sent_at)}{message.direction === 'outbound' && message.status ? ` · ${message.status}` : ''}</span>
                  </div>
                ))}
              </div>

              <form className={styles.composer} onSubmit={sendMessage}>
                <textarea
                  rows="2"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={status?.configured ? 'Digite sua mensagem...' : 'Conecte o número para responder pelo Hub'}
                  disabled={!status?.configured || sending}
                />
                <button disabled={!status?.configured || sending || !draft.trim()}>{sending ? 'Enviando...' : 'Enviar'}</button>
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
              <label>Origem<input value={selected.source || 'WhatsApp'} readOnly /></label>
              <label>Etapa<select value={selected.stage} onChange={(event) => updateContact({ stage: event.target.value })} disabled={saving}>{STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
              <label>Tags<input defaultValue={(selected.tags || []).join(', ')} key={`tags-${selected.id}-${(selected.tags || []).join('|')}`} onBlur={(event) => updateContact({ tags: event.target.value.split(',') })} placeholder="Imersão, Mentoria, Argoplace..." /></label>
              <label>Observações<textarea rows="7" defaultValue={selected.notes || ''} key={`notes-${selected.id}-${selected.notes || ''}`} onBlur={(event) => updateContact({ notes: event.target.value })} placeholder="O que esse lead quer? O que falta para fechar?" /></label>
              <small>{saving ? 'Salvando...' : 'Alterações são salvas ao sair do campo.'}</small>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
