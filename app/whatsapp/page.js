'use client';

import Link from 'next/link';
import {TopicFilter,TopicBadge,TopicPicker,useConversationTopics} from '../ui/ConversationTopics';
import {resolvedTopic,topicsFor} from '../lib/conversation-topics.mjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './whatsapp.module.css';
import ServiceWindowControls from './ServiceWindowControls.js';
import { mostRecentInboundAt, isWhatsAppServiceWindowOpen, whatsappFailureDescription } from '../api/whatsapp/service-window.js';

const STAGES = ['Novo lead', 'Conversando', 'Interessado', 'Agendar com Gui', 'Link enviado', 'Venda', 'Perdido'];
const PRIORITY_FILTERS = new Set(['all', 'reply', 'followup', 'hot', 'schedule']);

const SMART_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'reply', label: 'A responder' },
  { id: 'followup', label: 'Retomar contato' },
  { id: 'hot', label: 'Leads quentes' },
  { id: 'schedule', label: 'Agendar com Gui' },
  { id: 'imersao', label: 'Imersão' },
  { id: 'mentoria', label: 'Mentoria' },
  { id: 'argo', label: 'ARGO' },
  { id: 'importacao', label: 'Importação' },
  { id: 'treinamento', label: 'Treinamento' },
  { id: 'influenciadores', label: 'Influenciadores' },
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
  if (filter === 'schedule') return contact.stage === 'Agendar com Gui';

  const categories = contact.smart_categories || [];
  if (filter === 'imersao') return categories.includes('Imersão');
  if (filter === 'mentoria') return categories.includes('Mentoria');
  if (filter === 'argo') return categories.includes('ARGO');
  if (filter === 'importacao') return categories.includes('Importação');
  if (filter === 'treinamento') return categories.includes('Treinamento');
  if (filter === 'influenciadores') return categories.includes('Influenciadores');
  return true;
}

function contactAction(contact) {
  if (!contact) return 'Selecione um lead';
  if (contact.stage === 'Agendar com Gui') return '🔥 Assumir e agendar com o Gui';
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
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [search, setSearch] = useState('');
  const [activePriority, setActivePriority] = useState('all');
  const [activeTopic, setActiveTopic] = useState('all');
  const [conversationSubject,setConversationSubject]=useState('all');
  const subjectStore=useConversationTopics('gui-nonato','whatsapp');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const selected = contacts.find((contact) => contact.id === selectedId) || null;
  const lastInboundAt = mostRecentInboundAt(messages.filter((item) => item.contact_id === selectedId));
  const canSendFreeForm = isWhatsAppServiceWindowOpen(lastInboundAt);
  const isBaileys = status?.provider === 'baileys';
  const connectionReady = Boolean(status?.connected);
  const checkingConnection = status === null;
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
      setAiSuggestion(null);
      return;
    }
    const response = await fetch('/api/whatsapp/conversations?contact=' + encodeURIComponent(contactId), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar a conversa.');
    setMessages(data.messages || []);
    setAiSuggestion(data.aiSuggestion || null);
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
      // Counts always reflect the other active filter, making the two controls complementary.
      const isPriority = PRIORITY_FILTERS.has(filter.id);
      counts[filter.id] = contacts.filter((contact) => (
        matchesFilter(contact, filter.id)
        && matchesFilter(contact, isPriority ? activeTopic : activePriority)
      )).length;
    }
    return counts;
  }, [contacts, activePriority, activeTopic]);

  const subjectCounts={all:contacts.length};
  for(const option of topicsFor('gui-nonato')) subjectCounts[option.id]=contacts.filter(c=>resolvedTopic('gui-nonato',c,subjectStore.assignments)===option.id).length;

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (!matchesFilter(contact, activePriority) || !matchesFilter(contact, activeTopic)) return false;
      if(conversationSubject!=='all' && resolvedTopic('gui-nonato',contact,subjectStore.assignments)!==conversationSubject)return false;
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
  }, [contacts, search, activePriority, activeTopic, conversationSubject, subjectStore.assignments]);

  function chooseFilter(priority = activePriority, topic = activeTopic) {
    setActivePriority(priority);
    setActiveTopic(topic);
    setSearch('');
    const first = contacts.find((contact) => matchesFilter(contact, priority) && matchesFilter(contact, topic));
    setSelectedId(first?.id || null);
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
    if (!selected || !text || !canSendFreeForm) return;
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

  function handleComposerKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (!connectionReady || !canSendFreeForm || sending || !draft.trim()) return;
    event.currentTarget.form?.requestSubmit();
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
            {checkingConnection
              ? 'Verificando conexão...'
              : connectionReady
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
        status && !status.connected && (
          <section className={styles.setupCard}>
            <div>
              <span className={styles.eyebrow}>CONEXÃO OFICIAL META</span>
              <h2>{status?.readOnlyPreview ? "Esta é uma versão de testes: não reconecte a Meta aqui." : "Autorize o WhatsApp Business para ativar o Hub."}</h2>
              <p>A ponte antiga foi removida. Mensagens e envios funcionarão somente pela conexão oficial da Meta.</p>
            </div>
            <div className={styles.bridgeSetup}>
              <strong>Conexão oficial pendente</strong>
              <span>{status?.error || 'Conclua a autorização segura na janela da Meta.'}</span>
              <Link href="/whatsapp/diagnostico" className={styles.bridgeAction}>Ver diagnóstico</Link>
            </div>
          </section>
        )
      )}

      {notice && <button className={styles.notice} onClick={() => setNotice('')}>{notice} ×</button>}

      <section className={styles.queuePanel} aria-label="Organização das conversas">
        <div className={styles.queueTop}>
          <div className={styles.queueHeading}>
            <div className={styles.queueTitleLine}>
              <h2>Central de atendimento</h2>
              <span className={styles.queueTotal}>{filterCounts.all || 0} conversas</span>
            </div>
            <p>Priorize quem precisa da sua atenção.</p>
          </div>
          <div className={styles.queueTopic}>
            <label htmlFor="crm-assunto">Assunto</label>
            <select
              id="crm-assunto"
              value={activeTopic}
              onChange={(event) => chooseFilter(activePriority, event.target.value)}
            >
              <option value="all">Todos os assuntos</option>
              {SMART_FILTERS.filter((filter) => !PRIORITY_FILTERS.has(filter.id)).map((filter) => (
                <option key={filter.id} value={filter.id}>{filter.label} ({filterCounts[filter.id] || 0})</option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.queueTabs} role="group" aria-label="Prioridade de atendimento">
          {SMART_FILTERS.filter((filter) => PRIORITY_FILTERS.has(filter.id)).map((filter) => (
            <button
              type="button"
              key={filter.id}
              className={styles.queueTab + ' ' + (activePriority === filter.id ? styles.queueTabActive : '')}
              aria-pressed={activePriority === filter.id}
              onClick={() => chooseFilter(filter.id, activeTopic)}
            >
              <span>{filter.label}</span>
              <span className={styles.queueTabCount}>{filterCounts[filter.id] || 0}</span>
            </button>
          ))}
        </div>
        <div style={{padding:'12px 18px',borderTop:'1px solid var(--border,#e9e5e8)'}}>
          <p style={{fontSize:12,fontWeight:700,margin:'0 0 8px'}}>Assunto da conversa</p>
          <TopicFilter workspace="gui-nonato" counts={subjectCounts} value={conversationSubject} onChange={next=>{setConversationSubject(next);setSelectedId(null);}}/>
          {subjectStore.error && <p role="alert" style={{color:'#9b352c',fontSize:12}}>{subjectStore.error}</p>}
        </div>
      </section>

      <section className={styles.workspace}>
        <aside className={styles.contactsPane}>
          <div className={styles.paneHeading}>
            <div><span className={styles.eyebrow}>CONVERSAS</span><h2>{activePriority !== 'all' ? SMART_FILTERS.find((item) => item.id === activePriority)?.label : activeTopic !== 'all' ? SMART_FILTERS.find((item) => item.id === activeTopic)?.label : 'Todas as conversas'}</h2></div>
            <span className={styles.count}>{filteredContacts.length}</span>
          </div>
          <input
            className={styles.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar dentro desta fila..."
          />
          <div className={styles.contactList}>
            {!filteredContacts.length && <div className={styles.empty}>{notice ? "Não foi possível confirmar os leads. Verifique o erro acima." : "Nenhum lead nesta fila agora."}</div>}
            {filteredContacts.map((contact) => {
              const topic = contact.smart_categories?.[0];
              const labelTopic=resolvedTopic('gui-nonato',contact,subjectStore.assignments);
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
                    <TopicBadge workspace="gui-nonato" topic={labelTopic}/>
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
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                <TopicPicker workspace="gui-nonato" value={resolvedTopic('gui-nonato',selected,subjectStore.assignments)} disabled={subjectStore.saving} onChange={async next=>{if(await subjectStore.save(selected.id,next))setNotice('Assunto atualizado.');}}/>
                <select value={selected.stage} onChange={(event) => updateContact({ stage: event.target.value })} disabled={saving}>
                  {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
                </select>
                </div>
              </div>

              <div className={styles.messages}>
                {!messages.length && <div className={styles.empty}>Ainda não há mensagens salvas para este lead.</div>}
                {messages.map((message) => (
                  <div key={message.id} className={styles.bubble + ' ' + (message.direction === 'outbound' ? styles.outbound : styles.inbound)}>
                    <p>{message.body || '[' + message.message_type + ']'}</p>
                    <span>{formatTime(message.sent_at)}{message.direction === 'outbound' && message.status ? ' · ' + message.status : ''}</span>
                    {message.status === 'failed' && <small style={{ display: 'block', color: '#b42318' }}>{whatsappFailureDescription(message)}</small>}
                  </div>
                ))}
              </div>

              {aiSuggestion && (
                <div className={styles.aiSuggestion}>
                  <div className={styles.aiSuggestionTop}>
                    <div>
                      <span>✨ COPILOTO IA</span>
                      <strong>
                        {aiSuggestion.should_escalate
                          ? 'A IA recomenda que você assuma agora'
                          : 'Resposta sugerida'}
                      </strong>
                    </div>
                    {aiSuggestion.confidence !== null && aiSuggestion.confidence !== undefined && (
                      <small>{Math.round(Number(aiSuggestion.confidence) * 100)}% de confiança</small>
                    )}
                  </div>
                  {aiSuggestion.should_escalate ? (
                    <p>{aiSuggestion.escalation_reason || 'Esse lead chegou a uma etapa que precisa da Juliany.'}</p>
                  ) : (
                    <>
                      <p>{aiSuggestion.reply_text}</p>
                      <button
                        type="button"
                        onClick={() => setDraft(aiSuggestion.reply_text || '')}
                      >
                        Usar esta resposta
                      </button>
                    </>
                  )}
                </div>
              )}

              <ServiceWindowControls contact={selected} messages={messages} connected={connectionReady} setNotice={setNotice} onSent={() => Promise.all([loadContacts(), loadMessages(selected.id)])} />

              <form className={styles.composer} onSubmit={sendMessage}>
                <textarea
                  rows="2"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={!connectionReady ? 'Conecte o número para responder pelo Hub' : canSendFreeForm ? 'Digite sua mensagem...' : 'Aguarde o lead responder ou envie um modelo aprovado'}
                  disabled={!connectionReady || !canSendFreeForm || sending}
                />
                <button disabled={!connectionReady || !canSendFreeForm || sending || !draft.trim()}>{sending ? 'Enviando...' : 'Enviar'}</button>
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
