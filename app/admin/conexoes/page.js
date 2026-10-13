'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../CloudGate';
import styles from './admin-conexoes.module.css';
import ConnectionTree from './ConnectionTree';

const LABELS = { online: 'Confirmado', warning: 'Atenção', offline: 'Desconectado', unknown: 'Não verificado', paused: 'Pausado' };
const ICONS = { 'gui-instagram': '◎', 'gui-direct': '✉', 'gui-whatsapp': '◉', 'gui-wa-webhook': '⌁',
  'gui-wa-automation': '⚡', 'gui-ig-automation': '⚡', 'gui-ig-ingress': '⇢', 'gui-ai': '✧',
  'vital-instagram': '◎', 'vital-whatsapp': '◉', 'vital-argo': '⇄',
  'supabase': '▤', 'vercel': '◇', 'github': '⌘', 'legacy-bridge': '⌁' };
const FRESHNESS_MS = 3 * 60 * 1000;

function getStatus(node) { return node?.status || 'unknown'; }
function dateTime(value) {
  if (!value) return 'Não registrado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não registrado' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminConnectionsPage() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('gui-whatsapp');
  const [view, setView] = useState('tree');
  const [changes, setChanges] = useState([]);
  const inFlight = useRef(false);
  const lastCheck = useRef(0);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError('');
    try {
      if (!supabase) throw new Error('Conexão com o banco não configurada.');
      const { data, error: authError } = await supabase.auth.getSession();
      if (authError || !data?.session?.access_token) throw new Error('Entre no TidePlace para ver esta área.');
      const response = await fetch('/api/admin/health', {
        cache: 'no-store', headers: { Authorization: 'Bearer ' + data.session.access_token },
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !Array.isArray(result.nodes)) {
        throw new Error(result.error || 'Não foi possível verificar as conexões.');
      }
      const storageKey = 'tideplace-health:' + data.session.user.id;
      const previous = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
      const newStates = Object.fromEntries(result.nodes.map((node) => [node.id, node.status]));
      const newlyChanged = result.nodes.filter((node) =>
        previous[node.id] && previous[node.id] !== node.status && ['offline', 'warning'].includes(node.status));
      setChanges(newlyChanged.map((node) => node.id));
      window.localStorage.setItem(storageKey, JSON.stringify(newStates));
      setPayload(result);
      lastCheck.current = Date.now();
    } catch (cause) {
      setError(cause?.message || 'A verificação falhou.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, FRESHNESS_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > 90000) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const nodes = payload?.nodes || [];
  const filteredNodes = nodes.filter((node) => node.workspace !== 'system');
  const infrastructure = nodes.filter((node) => node.workspace === 'system' && node.id !== 'tideplace');
  const alerts = filteredNodes.filter((node) => node.status === 'offline' || node.status === 'warning');
  const countOnline = nodes.filter((node) => node.status === 'online').length;
  const countUnknown = nodes.filter((node) => node.status === 'unknown' || node.status === 'paused').length;
  const selectedNode = nodes.find((node) => node.id === selected) || filteredNodes[0];
  const groups = useMemo(() => ({
    gui: filteredNodes.filter((node) => node.workspace === 'gui'),
    vital: filteredNodes.filter((node) => node.workspace === 'vital'),
  }), [payload]);

  const renderNode = (node) => (
    <button type="button" key={node.id}
      className={styles.mapNode + ' ' + (selectedNode?.id === node.id ? styles.selected : '')}
      onClick={() => setSelected(node.id)} aria-pressed={selectedNode?.id === node.id}>
      <span className={styles.nodeIcon} aria-hidden="true">{ICONS[node.id] || '⚙'}</span>
      <span className={styles.nodeCopy}><strong>{node.name}</strong><small>{LABELS[getStatus(node)] || 'Verificar'}</small></span>
      <span className={styles.dot + ' ' + styles[getStatus(node)]} aria-label={LABELS[getStatus(node)]} />
    </button>
  );

  return <main className={styles.page}>
    <div className={styles.heading}>
      <div>
        <span className={styles.eyebrow}>ADMINISTRAÇÃO / OBSERVABILIDADE</span>
        <h1>Central de Controle</h1>
        <p>Seu mapa de conexões do TidePlace. Status consultados diretamente no servidor e na Meta, sem modificar as integrações.</p>
      </div>
      <button className={styles.refresh} type="button" onClick={() => void refresh()} disabled={loading}>
        {loading ? '⟳ Verificando...' : '↻ Atualizar agora'}
      </button>
    </div>
    {error && <div className={styles.errorBox} role="alert">{error} {payload ? 'Exibindo a última verificação bem-sucedida.' : ''}</div>}
    <div className={styles.summary}>
      <div className={styles.stat}><span>Verificações</span><strong>{nodes.length || '—'}</strong><small>Serviços e componentes</small></div>
      <div className={styles.stat}><span>Confirmadas</span><strong>{payload ? countOnline : '—'}</strong><small>Respondendo à checagem</small></div>
      <div className={styles.stat}><span>Precisam de atenção</span><strong>{payload ? alerts.length : '—'}</strong><small>Problemas ou pendências</small></div>
      <div className={styles.stat}><span>Não confirmadas</span><strong>{payload ? countUnknown : '—'}</strong><small>Pausadas ou sem teste completo</small></div>
    </div>

    <div className={styles.treeToolbar}>
      <div><span className={styles.eyebrow}>VISÃO GERAL</span><h2>Árvore de conexões</h2>
        <p>Entenda de onde sai cada integração e o que depende de cada canal. Clique em qualquer componente para ver o diagnóstico.</p>
      </div>
      <div className={styles.treeTabs} role="group" aria-label="Modo de visualização">
        <button type="button" className={view === 'tree' ? styles.treeTabActive : ''}
          aria-pressed={view === 'tree'} onClick={() => setView('tree')}>♧ Árvore geral</button>
        <button type="button" className={view === 'map' ? styles.treeTabActive : ''}
          aria-pressed={view === 'map'} onClick={() => setView('map')}>◈ Mapa de conexões</button>
      </div>
    </div>
    {view === 'tree' ? <ConnectionTree nodes={nodes} selectedId={selectedNode?.id} onSelect={setSelected} /> : <>
    <section className={styles.map} aria-label="Mapa visual de integrações">
      <div className={styles.network}>
        <div className={styles.lane}><span className={styles.laneHeader}>GUI NONATO</span>{groups.gui.map(renderNode)}</div>
        <div className={styles.central}><div className={styles.centralMark}>T</div><strong>TIDEPLACE</strong><small>Hub de integrações</small>
          <span style={{ marginTop: 14, fontSize: 11, opacity: .8 }}>{payload ? 'Servidor respondendo' : 'Checando servidor...'}</span>
        </div>
        <div className={styles.lane}><span className={styles.laneHeader}>VITAL DECOR</span>{groups.vital.map(renderNode)}</div>
      </div>
      <div className={styles.legend}>
        {['online','warning','offline','unknown','paused'].map((status) => (
          <span key={status}><i className={styles.dot + ' ' + styles[status]} />{LABELS[status]}</span>
        ))}
      </div>
    </section>
    {infrastructure.length > 0 && <><div className={styles.sectionHead}><h2>Infraestrutura e serviços antigos</h2><span>Componentes que sustentam o Hub</span></div>
      <div className={styles.infrastructure}>{infrastructure.map(renderNode)}</div></>}
    </>}
    <div className={styles.treeGuide}>As linhas mostram a organização das integrações. Os indicadores representam o resultado da última verificação, não o funcionamento garantido de todos os envios.</div>
    {selectedNode && <section className={styles.detail} aria-live="polite">
      <div><span className={styles.eyebrow}>{selectedNode.workspace === 'gui' ? 'GUI NONATO' : selectedNode.workspace === 'vital' ? 'VITAL DECOR' : 'INFRAESTRUTURA'} · {selectedNode.group}</span>
        <h3>{selectedNode.name} · {LABELS[selectedNode.status]}</h3>
        <p>{selectedNode.detail}</p><small>{selectedNode.action}{selectedNode.lastEventAt ? ' · Último registro: ' + dateTime(selectedNode.lastEventAt) : ''}</small>
      </div>
      <Link className={styles.detailLink} href={selectedNode.href}>Abrir configuração ↗</Link>
    </section>}

    <div className={styles.sectionHead}><h2>Alertas e ações</h2><span>{payload ? 'Última verificação: ' + dateTime(payload.checkedAt) : 'Aguardando checagem'}</span></div>
    <div className={styles.alertList} aria-live="polite">
      {!payload && !error ? <div className={styles.alertEmpty}>Consultando integrações...</div> :
        payload && !alerts.length ? <div className={styles.alertEmpty}>Nenhuma desconexão ou pendência confirmada nesta checagem. Os testes de mensagens ainda são necessários para validar os fluxos.</div> :
        alerts.map((alert) => (
          <div key={alert.id} className={styles.alert + ' ' + (alert.status === 'offline' ? styles.alertOffline : '')}>
            <span className={styles.dot + ' ' + styles[alert.status]} />
            <div><strong>{changes.includes(alert.id) ? 'NOVO · ' : ''}{alert.name}</strong>
              <p>{alert.detail} {alert.action}</p></div>
            <Link href={alert.href}>Resolver →</Link>
          </div>
        ))}
    </div>

    <p className={styles.finePrint}>
      Atualização automática a cada 3 minutos enquanto esta aba estiver aberta. O verde confirma somente a verificação descrita no componente;
      não substitui testes reais de envio, recebimento e resposta. Avisos aparecem nesta página ao detectar pendências;
      não há notificações por WhatsApp ou e-mail em segundo plano nesta versão.
    </p>
  </main>;
}
