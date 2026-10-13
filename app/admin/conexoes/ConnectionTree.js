'use client';

import styles from './admin-conexoes.module.css';

const FAMILIES = [
  {
    id: 'gui', name: 'Gui Nonato', description: 'Conteúdo, leads e atendimento', emblem: 'GN',
    channels: [
      { id: 'instagram', name: 'Instagram', icon: '◎', members: ['gui-instagram', 'gui-direct', 'gui-ig-ingress', 'gui-ig-automation'] },
      { id: 'whatsapp', name: 'WhatsApp', icon: '◉', members: ['gui-whatsapp', 'gui-wa-webhook', 'gui-wa-automation', 'gui-ai'] },
    ],
  },
  {
    id: 'vital', name: 'Vital Decor', description: 'Canais e operação comercial', emblem: 'VD',
    channels: [
      { id: 'instagram', name: 'Instagram', icon: '◎', members: ['vital-instagram'] },
      { id: 'whatsapp', name: 'WhatsApp e Argo', icon: '◉', members: ['vital-whatsapp', 'vital-argo'] },
    ],
  },
  {
    id: 'system', name: 'Infraestrutura', description: 'O que sustenta o TidePlace', emblem: 'TI',
    channels: [
      { id: 'hosting', name: 'Aplicação e dados', icon: '▤', members: ['vercel', 'supabase', 'github'] },
      { id: 'legacy', name: 'Serviços antigos', icon: '⌁', members: ['legacy-bridge'] },
    ],
  },
];

const STATUS_LABELS = {
  online: 'Confirmado',
  warning: 'Atenção',
  offline: 'Desconectado',
  unknown: 'Não verificado',
  paused: 'Pausado',
};

const worstStatus = (nodes) => {
  if (nodes.some((node) => node.status === 'offline')) return 'offline';
  if (nodes.some((node) => node.status === 'warning')) return 'warning';
  if (nodes.some((node) => node.status === 'unknown')) return 'unknown';
  if (nodes.some((node) => node.status === 'paused')) return 'paused';
  return nodes.length && nodes.every((node) => node.status === 'online') ? 'online' : 'unknown';
};

function BranchLeaf({ item, selected, onSelect }) {
  return <button
    type="button"
    className={styles.treeLeaf + (selected ? ' ' + styles.treeLeafSelected : '')}
    onClick={() => onSelect(item.id)}
    aria-pressed={selected}
    aria-label={item.name + ': ' + (STATUS_LABELS[item.status] || 'Não verificado') + '. Abrir diagnóstico.'}
  >
    <span className={styles.treeLeafLabel}>{item.name}</span>
    <span className={styles.treeLeafState}>
      <i className={styles.dot + ' ' + styles[item.status || 'unknown']} />
      <span>{STATUS_LABELS[item.status] || 'Verificar'}</span>
    </span>
  </button>;
}

export default function ConnectionTree({ nodes, selectedId, onSelect }) {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const listedIds = new Set(FAMILIES.flatMap((family) => family.channels.flatMap((channel) => channel.members)));

  return <div className={styles.treeViewport} role="region" aria-label="Árvore genealógica das conexões" tabIndex={0}>
    <div className={styles.treeCanvas}>
      <div className={styles.treeRoot}>
        <span className={styles.treeRootMark}><img src="/brand/tideplace-mark-white.svg" alt="" /></span>
        <span className={styles.treeRootCopy}><strong>TIDEPLACE</strong><small>Central de todas as integrações</small></span>
        <span className={styles.treeRootStatus}>HUB PRINCIPAL</span>
      </div>
      <div className={styles.treeTrunk} aria-hidden="true" />
      <div className={styles.treeFamilies}>
        {FAMILIES.map((family) => {
          const channels = family.channels.map((channel) => ({
            ...channel,
            nodes: channel.members.map((id) => byId.get(id)).filter(Boolean),
          }));
          const extras = nodes.filter((item) => item.workspace === family.id && !listedIds.has(item.id) && item.id !== 'tideplace');
          if (extras.length) channels.push({ id: 'extra', name: 'Outras verificações', icon: '◇', nodes: extras });
          const all = channels.flatMap((channel) => channel.nodes);
          const issues = all.filter((item) => item.status === 'offline' || item.status === 'warning').length;
          const pending = all.filter((item) => item.status === 'unknown' || item.status === 'paused').length;
          const state = worstStatus(all);
          return <section className={styles.treeFamily} key={family.id} aria-label={'Ramificação ' + family.name}>
            <div className={styles.treeFamilyHeader}>
              <span className={styles.treeFamilyAvatar}>{family.emblem}</span>
              <div className={styles.treeFamilyIdentity}>
                <strong>{family.name}</strong><small>{family.description}</small>
              </div>
              <span className={styles.dot + ' ' + styles[state]} aria-label={STATUS_LABELS[state]} />
            </div>
            <div className={styles.treeFamilySummary}>
              <b>{all.length} componentes</b>
              <span>{issues ? issues + (issues === 1 ? ' alerta' : ' alertas') : pending ? pending + ' a verificar' : 'Sem alertas confirmados'}</span>
            </div>
            <div className={styles.treeChannels}>
              {channels.map((channel) => <section className={styles.treeChannel} key={channel.id}>
                <div className={styles.treeChannelHeader}>
                  <span className={styles.treeChannelIcon}>{channel.icon}</span>
                  <strong>{channel.name}</strong>
                  <span className={styles.treeChannelCount}>{channel.nodes.length}</span>
                </div>
                <div className={styles.treeLeaves}>
                  {channel.nodes.map((item) => <BranchLeaf key={item.id}
                    item={item} selected={selectedId === item.id} onSelect={onSelect} />)}
                  {!channel.nodes.length && <span className={styles.treeWaiting}>Aguardando verificação</span>}
                </div>
              </section>)}
            </div>
          </section>;
        })}
      </div>
    </div>
  </div>;
}
