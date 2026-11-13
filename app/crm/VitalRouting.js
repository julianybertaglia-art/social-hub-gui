'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api, useResource } from '../operations/useOperations';
import Icon from '../ui/Icon';
import styles from './vital-routing.module.css';

import { VITAL_SECTOR_NAMES as SECTOR_NAMES, VITAL_ASSIGNEE_NAMES as WHO, routingDestination, sameVitalAssignment } from '../lib/vital-routing.mjs';

function RuleList({ rules }) {
  return <div className={styles.ruleList}>
    {rules.map(rule => {
      const state = routingDestination(rule);
      return <div className={styles.ruleRow} key={rule.sector}>
        <span>{SECTOR_NAMES[rule.sector] || rule.sector}</span>
        <small className={state.active ? styles.ready : styles.pending}>
          <i aria-hidden="true" />{state.title}
        </small>
      </div>;
    })}
  </div>;
}

export function VitalRoutingOverview() {
  const { data, loading, error } = useResource('/api/vital-whatsapp/argo-routing');
  return <section className={styles.overview} aria-label="Encaminhamento Vital Decor">
    <div className={styles.title}><Icon name="flow" size={18}/><h2>Encaminhamento por setor</h2></div>
    <p>As conversas da Vital podem ser direcionadas ao responsável configurado no TidePlace ou no Argo.</p>
    {loading ? <p className={styles.note}>Consultando responsáveis…</p> : error
      ? <p className={styles.note}>Os responsáveis não estão disponíveis nesta prévia. A configuração atual foi preservada.</p>
      : <RuleList rules={data?.defaults || []}/>}
    <div className={styles.links}>
      <Link href="/whatsapp/integracao-argo"><Icon name="settings" size={15}/> Configurar responsáveis</Link>
      <Link href="/whatsapp"><Icon name="inbox" size={15}/> Abrir caixa geral</Link>
    </div>
  </section>;
}

export function VitalContactRouting({ contactId, demo = false, onAssigned }) {
  if (demo) return <section className={styles.card}>
    <div className={styles.title}><Icon name="flow" size={18}/><h3>Encaminhar atendimento</h3></div>
    <p className={styles.note}>Na ficha real da Vital, você poderá escolher o setor, conferir o responsável e encaminhar a conversa ao Argo quando a integração estiver habilitada.</p>
    <p className={styles.demo}>Demonstração · nenhuma transferência será feita.</p>
  </section>;
  return <LiveVitalContactRouting contactId={contactId} onAssigned={onAssigned}/>;
}

function LiveVitalContactRouting({ contactId, onAssigned }) {
  const [revision, setRevision] = useState(0);
  const [sector, setSector] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const { data, loading, error } = useResource('/api/vital-whatsapp/argo-routing', revision);
  const rules = data?.defaults || [];
  const assigned = data?.assignments?.find(item => item.contact_wa_id === String(contactId));
  const currentSector = assigned?.sector || '';
  const chosenRule = rules.find(item => item.sector === sector);
  const destination = useMemo(() => routingDestination(chosenRule), [chosenRule]);
  const sameAssignment = sameVitalAssignment(assigned, sector, destination);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!sector || !destination.active || busy || loading || sameAssignment) return;
    if (!/^\d{8,15}$/.test(String(contactId))) {
      setErrorMessage('Este contato não possui um telefone válido para encaminhamento.');
      return;
    }
    const label = SECTOR_NAMES[sector] || sector;
    const target = destination.title;
    const prompt = destination.assignee === 'tide'
      ? 'Atribuir esta conversa ao setor ' + label + ' dentro do TidePlace?'
      : 'Encaminhar esta conversa para ' + label + ' no Argo (' + target + ')? A equipe responsável passará a atender por lá.';
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setFeedback('');
    setErrorMessage('');
    try {
      await api('/api/vital-whatsapp/argo-routing', {
        method: 'POST',
        body: JSON.stringify({ action: 'assign', phone: String(contactId), sector, assignee: destination.assignee }),
      });
      setFeedback('Conversa encaminhada para ' + label + ' · ' + target + '.');
      setSector('');
      setRevision(current => current + 1);
      onAssigned?.();
    } catch (failure) {
      setErrorMessage(failure.message || 'Não foi possível encaminhar a conversa.');
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.card} aria-label="Encaminhar para setor responsável">
    <div className={styles.title}><Icon name="flow" size={18}/><h3>Encaminhar atendimento</h3></div>
    <p className={styles.note}>Escolha o setor. O TidePlace usará o responsável configurado para encaminhar ao Argo, quando estiver ativo.</p>
    {loading ? <p className={styles.note}>Consultando setores e responsáveis…</p> : error
      ? <p className={styles.error} role="alert">Não foi possível consultar o encaminhamento nesta versão. Nenhuma transferência foi realizada.</p>
      : <>
        <div className={styles.current}>
          <span>Responsável atual</span>
          <strong>{assigned && assigned.status !== 'closed'
            ? (SECTOR_NAMES[currentSector] || currentSector) + ' · ' + (WHO[assigned.assigned_to] || assigned.assigned_to)
            : 'Ainda não atribuído'}</strong>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="vital-crm-routing-sector">Setor de destino</label>
          <select id="vital-crm-routing-sector" value={sector} onChange={e => {setSector(e.target.value);setFeedback('');setErrorMessage('');}} disabled={busy}>
            <option value="">Selecione um setor</option>
            {rules.map(rule => <option key={rule.sector} value={rule.sector}>
              {SECTOR_NAMES[rule.sector] || rule.sector}
            </option>)}
          </select>
          {sector && <p className={destination.active ? styles.readyText : styles.warningText}>
            {destination.active ? 'Destino: ' + destination.title
              : 'Este setor ainda não está habilitado no Argo. Configure a integração antes de transferir.'}
          </p>}
          <button type="submit" disabled={busy || !sector || !destination.active || sameAssignment}>
            {busy ? 'Encaminhando…' : sameAssignment ? 'Já atribuído a este setor' : 'Confirmar encaminhamento'}
          </button>
        </form>
        <Link className={styles.settingsLink} href="/whatsapp/integracao-argo">Configurar setores e acesso ao Argo</Link>
        {feedback && <p role="status" className={styles.success}>{feedback}</p>}
        {errorMessage && <p role="alert" className={styles.error}>{errorMessage}</p>}
      </>}
  </section>;
}
