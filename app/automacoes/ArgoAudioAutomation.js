'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../CloudGate';
import { ARGO_KEYWORD, ARGO_MENU_BUTTONS, ARGO_MENU_MESSAGE } from '../lib/argo-flow';
import styles from './automacoes.module.css';

async function requestOwnerJson(path, body) {
  const { data } = supabase ? await supabase.auth.getSession() : { data: null };
  if (!data?.session?.access_token) throw new Error('Entre novamente no Hub para acessar a automação.');

  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a automação.');
  return payload;
}

async function requestAutomation(body) {
  return (await requestOwnerJson('/api/instagram/audio-automation', body)).automation;
}

function downloadContacts(contacts) {
  const cell = (value) => {
    const text = String(value ?? '');
    const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = [['Nome', 'WhatsApp', 'Autorizou novidades em'], ...contacts.map((contact) => [
    contact.name, `+${contact.whatsapp}`, contact.consented_at,
  ])];
  const blob = new Blob(['\ufeff' + rows.map((row) => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cadastros-argo.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ArgoAudioAutomation() {
  const [automation, setAutomation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setAutomation(await requestAutomation());
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function toggle() {
    if (!automation) return;
    setBusy(true);
    setError('');
    try {
      setAutomation(await requestAutomation({ action: automation.active ? 'pause' : 'activate' }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadContacts() {
    setContactsLoading(true);
    setContactsError('');
    try {
      setContacts(await requestOwnerJson('/api/instagram/argo-updates'));
    } catch (requestError) {
      setContactsError(requestError.message);
    } finally {
      setContactsLoading(false);
    }
  }

  const status = loading ? 'Carregando' : automation?.active ? 'Ativa' : 'Pausada';
  const menuMessage = automation?.menuMessage || ARGO_MENU_MESSAGE;
  const menuButtons = automation?.menuButtons || ARGO_MENU_BUTTONS;

  return (
    <section className={`${styles.panel} ${styles.argoPanel}`} aria-labelledby="argo-audio-title">
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}>DIRECT · ARGO</span>
          <h2 id="argo-audio-title">Áudio automático do Gui</h2>
        </div>
        <span className={`${styles.argoBadge} ${automation?.active ? styles.argoBadgeActive : ''}`} role="status">
          {status}
        </span>
      </div>

      <p className={styles.audioIntro}>
        Envie <strong>{automation?.directKeyword || ARGO_KEYWORD}</strong> no Direct do @gui_nonato para receber o áudio de 1:01 e escolher o próximo passo.
      </p>

      <div className={styles.argoFlow} aria-label="Fluxo da automação">
        <span><b>1</b> Manda <strong>{automation?.directKeyword || ARGO_KEYWORD}</strong> no Direct</span>
        <span><b>2</b> Recebe o áudio do Gui</span>
        <span><b>3</b> Escolhe uma das três opções</span>
      </div>

      <div className={styles.argoCopy}>
        <strong>Mensagem depois do áudio</strong>
        <p className={styles.argoMenuMessage}>{menuMessage}</p>
        <div className={styles.argoMenuButtons} aria-label="Destinos dos botões">
          {menuButtons.map((button) => (
            <a key={button.title} href={button.url} target="_blank" rel="noopener noreferrer">{button.title} <span aria-hidden="true">↗</span></a>
          ))}
        </div>
      </div>

      {error && <p className={styles.audioError} role="alert">{error}</p>}
      {!loading && !automation && (
        <p className={styles.audioError}>O áudio oficial ainda não foi preparado. Atualize esta página.</p>
      )}

      <div className={styles.argoActions}>
        <button className={automation?.active ? styles.argoPauseButton : styles.saveButton} type="button" onClick={toggle} disabled={loading || busy || !automation}>
          {busy ? 'Salvando…' : automation?.active ? 'Pausar automação' : 'Ativar automação'}
        </button>
        <span>Uma pessoa recebe esse áudio apenas uma vez.</span>
      </div>

      <div className={styles.argoContacts}>
        <div className={styles.argoContactsHeading}>
          <div><strong>Cadastros para novidades do Argo</strong><p>Nome, WhatsApp e autorização de quem preencheu o formulário.</p></div>
          <button type="button" onClick={loadContacts} disabled={contactsLoading}>
            {contactsLoading ? 'Carregando…' : contacts ? 'Atualizar cadastros' : 'Ver cadastros'}
          </button>
        </div>
        {contactsError && <p className={styles.audioError} role="alert">{contactsError}</p>}
        {contacts && <>
          <p role="status">{contacts.total ? `${contacts.total} cadastro${contacts.total === 1 ? '' : 's'}. Exibindo os ${contacts.contacts.length} mais recentes.` : 'Nenhum cadastro recebido ainda.'}</p>
          {contacts.contacts.length > 0 && <>
            <div className={styles.argoContactsTable}><table>
              <thead><tr><th>Nome</th><th>WhatsApp</th><th>Cadastro</th></tr></thead>
              <tbody>{contacts.contacts.map((contact) => <tr key={contact.id}>
                <td>{contact.name}</td>
                <td><a href={`https://wa.me/${contact.whatsapp}`} target="_blank" rel="noopener noreferrer">+{contact.whatsapp}</a></td>
                <td>{new Date(contact.consented_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
              </tr>)}</tbody>
            </table></div>
            <button type="button" onClick={() => downloadContacts(contacts.contacts)}>Baixar os cadastros exibidos</button>
          </>}
        </>}
      </div>
    </section>
  );
}
