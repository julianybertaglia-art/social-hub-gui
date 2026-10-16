'use client';
import { useResource } from './useOperations';
import { Panel } from './Charts';
import DonutChart from './DonutChart';
import styles from './operations.module.css';

function countBy(items, key) {
  const totals = new Map();
  items.forEach(item => {
    const label = String(item[key] || 'Sem classificação').trim() || 'Sem classificação';
    totals.set(label,(totals.get(label) || 0) + 1);
  });
  return [...totals].map(([label,count]) => ({ label, count })).sort((a,b) => b.count-a.count);
}
export default function DashboardDistributions({workspace, posts=[]}) {
  const operations = useResource('/api/operations?workspace=' + workspace.id + '&days=30', 0);
  const result = operations.data;
  const contacts = result?.contacts || [];
  const stages = workspace.id === 'gui-nonato'
    ? (result?.crm?.stages || []).map(item => ({label:item.stage,count:item.count}))
    : countBy(contacts.map(c => ({sector:c.sector || 'Sem setor'})), 'sector');
  const entries = countBy(posts,'status');
  return <section className={styles.dashboardDistributions} aria-label="Distribuição de leads e de conteúdos">
    <Panel title={workspace.id === 'gui-nonato' ? 'Leads por etapa' : 'Atendimentos por setor'} description="Situação atual dos contatos do CRM desta marca.">
      {operations.loading ? <div className={styles.empty}>Carregando os contatos reais…</div>
      : operations.error ? <div className={styles.empty}>Não foi possível consultar o CRM. <a href="/crm">Abrir CRM</a></div>
      : <DonutChart title="Distribuição dos contatos" items={stages} empty="Nenhum contato com etapa disponível no momento." note={result?.truncated ? 'Distribuição da amostra consultada; há mais registros na base.' : 'Dados do CRM, não do Instagram.'}/>}
    </Panel>
    <Panel title="Conteúdos por status" description="Seu planejamento editorial salvo nesta marca.">
      <DonutChart title="Distribuição dos conteúdos planejados" items={entries} empty="Nenhum conteúdo foi cadastrado ainda." note="São os conteúdos cadastrados no TidePlace, não os posts publicados automaticamente na Meta."/>
    </Panel>
  </section>;
}
