'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useResource } from './useOperations';
import { delta, inPeriod, csvCell } from '../lib/operations.mjs';
import { DailyChart, KPI, Panel, fmt } from './Charts';
import DonutChart from './DonutChart';
import s from './operations.module.css';

const formatType = type => {
  const name = String(type || '').toUpperCase();
  if (name === 'VIDEO' || name === 'REELS' || name === 'IGTV') return 'Reels e vídeos';
  if (name === 'CAROUSEL_ALBUM') return 'Carrosséis';
  if (name === 'IMAGE') return 'Imagens';
  return 'Outros formatos';
};
const countBy = (rows, key) => {
  const totals = new Map();
  rows.forEach(row => {
    const label = String(row[key] || 'Sem classificação');
    totals.set(label, (totals.get(label) || 0) + 1);
  });
  return [...totals].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);
};

export default function ExecutiveDashboard({workspace,mode='metrics'}) {
  const [days,setDays] = useState(30);
  const [revision,setRevision] = useState(0);
  const [search,setSearch] = useState('');
  const [type,setType] = useState('all');
  const [sort,setSort] = useState('timestamp');
  const ig = useResource('/api/analytics/instagram?workspace=' + workspace.id + '&days=' + days,revision);
  const op = useResource('/api/operations?workspace=' + workspace.id + '&days=' + days,revision);
  const data = ig.data, operations = op.data, current = data?.current, previous = data?.previous, crm = operations?.crm, msg = operations?.messaging;
  const period = data?.range || operations?.range;
  const sampled = (data?.items || []).filter(item => period && inPeriod(item.timestamp,period.start,period.end));
  const formats = countBy(sampled.map(item => ({type:formatType(item.type)})),'type');
  const rows = sampled.filter(row => (type === 'all' || row.type === type) && String(row.caption || '').toLowerCase().includes(search.toLowerCase())).sort((a,b) => sort === 'timestamp' ? String(b.timestamp).localeCompare(String(a.timestamp)) : (b[sort] ?? -1) - (a[sort] ?? -1));
  const contacts = operations?.contacts || [];
  const byStage = workspace.id === 'gui-nonato' ? (crm?.stages || []).map(item => ({label:item.stage,count:item.count})) : countBy(contacts.map(c => ({sector:c.sector || 'Sem setor'})),'sector');
  const crmTitle = workspace.id === 'gui-nonato' ? 'Leads por etapa' : 'Atendimentos por setor';

  function download() {
    if (!rows.length) return;
    const columns = ['Data','Conteúdo','Formato','Curtidas','Comentários','Alcance','Visualizações','Interações','Link'];
    const csv = '\uFEFF' + [columns,...rows.map(r=>[r.timestamp,r.caption,r.type,r.likes,r.comments,r.reach,r.views,r.interactions,r.url])].map(r=>r.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tide-metricas-' + workspace.id + '-' + days + 'dias.csv';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <main className={s.surface}>
    <header className={s.metricsHeading}>
      <div>
        <span className={s.eyebrow}>INSTAGRAM / {workspace.name.toUpperCase()}</span>
        <h1>Métricas e resultados</h1>
        <p className={s.muted}>O desempenho do conteúdo e do atendimento, organizado por assunto.</p>
      </div>
      <div className={s.toolbar}>
        <select aria-label="Período das métricas" value={days} onChange={e=>setDays(Number(e.target.value))}>
          <option value={7}>Últimos 7 dias</option><option value={14}>Últimos 14 dias</option><option value={30}>Últimos 30 dias</option>
        </select>
        <button className={s.button} onClick={()=>setRevision(n=>n+1)}>Atualizar dados</button>
      </div>
    </header>
    <p className={s.periodHint}>{period ? period.startDate.split('-').reverse().join('/') + ' a ' + period.endDate.split('-').reverse().join('/') + ' · Brasília' : 'Carregando período…'} · Fonte: Meta e CRM</p>
    {data?.notice && <div className={s.notice} role="status">{data.notice} <Link href="/admin/conexoes">Ver permissões</Link>.</div>}
    {ig.error && <div className={s.notice} role="status"><strong>Dados do Instagram indisponíveis.</strong> {ig.error} <Link href="/admin/conexoes">Verificar conexão</Link>. O CRM continua separado.</div>}
    {op.error && <div className={s.notice} role="status"><strong>CRM indisponível.</strong> {op.error} <Link href="/crm">Abrir CRM</Link>.</div>}
    {operations?.truncated && <div className={s.notice}>A consulta do CRM atingiu o limite de registros. A distribuição mostra apenas o conjunto consultado.</div>}

    <section aria-label="Resumo do Instagram">
      <div className={s.sectionHeading}><h2>Instagram</h2><span>Resumo do período selecionado</span></div>
      <div className={s.kpis}>
        <KPI label="Alcance" value={current?.reach ?? null} comparison={delta(current?.reach ?? null,previous?.reach ?? null)} note={ig.loading?'Consultando a Meta…':'Dado não disponível na Meta'}/>
        <KPI label="Interações" value={current?.total_interactions ?? null} comparison={delta(current?.total_interactions ?? null,previous?.total_interactions ?? null)}/>
        <KPI label="Visualizações" value={current?.views ?? null} comparison={delta(current?.views ?? null,previous?.views ?? null)}/>
        <KPI label="Seguidores atuais" value={data?.profile?.followers ?? null} note={data?.profile ? '@' + data.profile.username : 'Perfil não confirmado'}/>
      </div>
      <div className={s.pieGrid}>
        <Panel title="Evolução do alcance" description="Alcance por dia, conforme a série disponibilizada pela Meta.">
          <DailyChart rows={data?.daily || []} />
        </Panel>
        <Panel title="Formatos publicados" description="Distribuição somente das publicações que a Meta retornou neste período.">
          {ig.loading ? <div className={s.empty}>Carregando publicações…</div> : <DonutChart title="Formatos de publicações" items={formats} empty="Não há publicações disponíveis nesta amostra." note={sampled.length ? 'Amostra de ' + fmt(sampled.length) + ' publicações recentes; não representa todo o histórico.' : 'Quando a Meta disponibilizar publicações, elas serão classificadas aqui.'}/>}
        </Panel>
      </div>
    </section>

    <section aria-label="Atendimento e CRM">
      <div className={s.sectionHeading}><h2>Atendimento e CRM</h2><span>Dados das conversas da marca selecionada</span></div>
      <div className={s.metricsSummary}>
        <KPI label="Mensagens recebidas" value={msg?.inbound ?? null} comparison={delta(msg?.inbound ?? null,msg?.previousInbound ?? null)} note={op.loading?'Consultando conversas…':'Mensagens registradas no período'}/>
        <KPI label="Mensagens enviadas" value={msg?.outbound ?? null} comparison={delta(msg?.outbound ?? null,msg?.previousOutbound ?? null)}/>
        <KPI label={crm ? 'Novos leads' : 'Contatos do WhatsApp'} value={crm ? crm.newLeads : (operations ? contacts.length : null)} comparison={crm ? delta(crm.newLeads,crm.previousNewLeads) : null} note="Dados do CRM, não da Meta"/>
      </div>
      <div className={s.pieGrid}>
        <Panel title={crmTitle} description="Distribuição atual dos contatos cadastrados, independentemente do período selecionado.">
          {op.loading ? <div className={s.empty}>Carregando contatos reais…</div> : <DonutChart title={crmTitle} items={byStage} empty="Nenhum contato classificado foi retornado." note={operations?.truncated?'Amostra limitada pela consulta.':'Origem: CRM desta marca.'}/>}
        </Panel>
        <Panel title="Mensagens ao longo dos dias" description="Quantidade diária de mensagens recebidas e enviadas.">
          <DailyChart rows={msg?.daily || []} series={[{key:'inbound',name:'Recebidas',color:'#8f2945'},{key:'outbound',name:'Enviadas',color:'#b68f9c'}]} />
        </Panel>
      </div>
    </section>

    <section className={s.metricsDetails} aria-label="Publicações e dados detalhados">
      <details>
        <summary>Ver publicações e dados detalhados da Meta <span>{sampled.length} na amostra</span></summary>
        <div className={s.metricsDetailsBody}>
          <div className={s.toolbar}>
            <input type="search" placeholder="Buscar publicação…" aria-label="Buscar publicação" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select aria-label="Filtrar formato" value={type} onChange={e=>setType(e.target.value)}>
              <option value="all">Todos os formatos</option>
              {[...new Set(sampled.map(r=>r.type))].map(t=><option key={t} value={t}>{formatType(t)}</option>)}
            </select>
            <select aria-label="Ordenar publicações" value={sort} onChange={e=>setSort(e.target.value)}>
              <option value="timestamp">Mais recentes</option><option value="reach">Maior alcance</option><option value="interactions">Mais interações</option><option value="views">Mais visualizações</option>
            </select>
            <button className={s.button} onClick={download} disabled={!rows.length}>Exportar CSV</button>
          </div>
          {rows.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Publicação</th><th>Formato</th><th>Alcance</th><th>Visualizações</th><th>Interações</th><th>Curtidas</th><th>Comentários</th></tr></thead><tbody>
            {rows.map(r=><tr key={r.id}><td><a href={r.url} target="_blank" rel="noreferrer">{String(r.caption || '').slice(0,100) || 'Abrir publicação'} ↗</a><small className={s.muted} style={{display:'block'}}>{new Date(r.timestamp).toLocaleDateString('pt-BR')}</small></td><td>{formatType(r.type)}</td><td>{fmt(r.reach)}</td><td>{fmt(r.views)}</td><td>{fmt(r.interactions)}</td><td>{fmt(r.likes)}</td><td>{fmt(r.comments)}</td></tr>)}
          </tbody></table></div> : <div className={s.empty}>Nenhuma publicação encontrada com estes filtros. A Meta pode não ter fornecido dados suficientes.</div>}
          <p className={s.muted}>O traço (—) significa dado indisponível, não zero. {data?.updatedAt && 'Última consulta da Meta: ' + new Date(data.updatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>
        </div>
      </details>
    </section>
    <p className={s.metricsFooter}>Precisa gerenciar permissões? <Link href="/admin/conexoes">Abrir Central de Controle</Link> · <Link href="/radar">Explorar o Radar</Link></p>
  </main>;
}
