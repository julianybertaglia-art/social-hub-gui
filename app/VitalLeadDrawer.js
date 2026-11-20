'use client';

import {orderUpdateDraft,orderTimeline} from './lib/vital-lead-intelligence.mjs';
import Icon from './ui/Icon';
import css from './vital-lead-drawer.module.css';

const currency=value=>value===null||value===undefined?'Valor indisponível':
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
const date=value=>value?new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Data não informada';
const payment={paid:'Pago',pending:'Aguardando pagamento',authorized:'Autorizado',refunded:'Reembolsado',voided:'Cancelado',partially_paid:'Parcialmente pago'};
const shipping={shipped:'Enviado',fulfilled:'Enviado',delivered:'Entregue',packed:'Preparado',
  partially_packed:'Preparação parcial',partially_fulfilled:'Envio parcial',
  unpacked:'Aguardando preparação',unshipped:'Aguardando expedição'};
function statusLabel(value,map){return map[value]||'Não confirmado';}
export default function VitalLeadDrawer({profile,loading,error,onClose,onPrepare,canPrepare,ai,aiLoading,aiError,onAnalyze,shippingDetails={},onInspectShipping}){
 const p=profile||{},o=p.orders||[],c=p.checkouts||[];
 return <div className={css.backdrop} onClick={onClose}>
  <aside role="dialog" aria-modal="true" aria-label="Carteira do cliente" className={css.drawer}
    onClick={event=>event.stopPropagation()}>
   <header className={css.heading}>
    <div><span className={css.kicker}>CRM · VITAL DECOR</span><h2>Carteira do cliente</h2>
      <p>Atendimento, compras e próximos passos</p></div>
    <button type="button" aria-label="Fechar carteira" onClick={onClose}><Icon name="close" size={20}/></button>
   </header>
   {loading&&<p className={css.empty}>Consultando dados autorizados da Nuvemshop…</p>}
   {error&&<p role="alert" className={css.alert}>{error}</p>}
   {!loading&&!error&&<div className={css.content}>
     <section className={css.card}>
       <span className={css.kicker}>ESTÁGIO DO CONTATO</span>
       <h3>{p.lead?.label||'Contato em avaliação'}</h3>
       <p>{p.lead?.confidence==='confirmado'?'Identificado por registro da loja.':
         'Classificação baseada em informações disponíveis; não comprova visita ao site.'}</p>
     </section>
     <section className={css.card}>
       <span className={css.kicker}>PRÓXIMA AÇÃO SUGERIDA</span>
       <h3>{p.recommendation?.title||'Entender a necessidade'}</h3>
       <p>{p.recommendation?.description||'Acompanhe o histórico antes de propor contato.'}</p>
       {p.timing&&<p><strong>Quando agir:</strong> {p.timing}</p>}
       <span className={css.hint}>Sugestão por regras. Nenhuma mensagem será enviada automaticamente.</span>
       {p.state==='ready'&&p.lead?.id==='link'&&canPrepare&&
        <button className={css.prepare} type="button"
         onClick={()=>onPrepare('Oi! Tudo bem? 💜 Se precisar de ajuda para escolher um produto da Vital Decor ou calcular a quantidade ideal para o seu espaço, é só me chamar por aqui. 😊')}>
         <Icon name="chat" size={15}/> Preparar mensagem de ajuda
        </button>}
     </section>
     <section className={css.card}>
      <span className={css.kicker}>COPILOTO DE ATENDIMENTO</span>
      <h3>Orientação por IA, com revisão humana</h3>
      <p>Analisa as últimas mensagens recebidas e os estados da loja. Telefones, e-mails, documentos e links são ocultados antes de enviar à integração Gemini.</p>
      <button type="button" className={css.prepare} onClick={onAnalyze}
        disabled={Boolean(loading||aiLoading||error)}>
        <Icon name="sparkle" size={16}/> {aiLoading?'Analisando conversa…':'Analisar com IA'}
      </button>
      <small className={css.hint}>A análise é manual e pode consumir créditos da API Gemini já conectada. Nenhuma mensagem é enviada ao cliente.</small>
      {aiError&&<p className={css.alert} role="alert">{aiError}</p>}
      {ai&&<div className={css.aiResult}>
        <div className={css.aiTags}><span>Intenção: {ai.intent}</span><span>Prioridade: {ai.priority}</span></div>
        <h3>{ai.stage}</h3>
        <p>{ai.summary}</p>
        {ai.evidence&&<p><strong>Base da análise:</strong> {ai.evidence}</p>}
        <p><strong>Próxima ação:</strong> {ai.nextAction}</p>
        <p><strong>Momento:</strong> {ai.when==='agora_se_janela_aberta'?'Quando houver janela aberta':ai.when==='apos_resposta_do_cliente'?'Após a próxima resposta':ai.when==='apos_atualizacao_do_pedido'?'Após atualizar o pedido':'Revisar manualmente'}</p>
        <small className={css.hint}>{ai.caution}</small>
        {ai.draft&&<button type="button" className={css.prepare} disabled={!canPrepare} onClick={()=>onPrepare(ai.draft)}>
          <Icon name="chat" size={15}/> Usar sugestão como rascunho
        </button>}
      </div>}
     </section>
     {p.state==='not_configured'&&<p className={css.alert}>
        A consulta de pedidos ainda não está configurada para este ambiente.
      </p>}
     {p.state==='partial'&&<p className={css.alert}>
        Uma das fontes não respondeu ou a amostra atingiu o limite de consulta. Dados incompletos.
      </p>}
     {(p.state==='ready'||p.state==='partial')&&<>
       <section className={css.card}>
        <div className={css.sectionHead}><h3>Pedidos da loja</h3><span>{o.length} encontrado(s)</span></div>
        <small className={css.hint}>Busca por telefone exato · últimos 365 dias {p.source?.orders?.state!=='ready'?'· resultado parcial':''}</small>
        {!o.length&&<p className={css.empty}>Nenhum pedido localizado no período pesquisado. Isso não comprova ausência de compras anteriores.</p>}
        {o.map(order=><div key={order.id} className={css.order}>
         <div className={css.orderTitle}><strong>Pedido #{order.number}</strong><span>{currency(order.total)}</span></div>
         <small>{date(order.at)} · {statusLabel(order.paymentStatus,payment)} · {statusLabel(order.shippingStatus,shipping)}</small>
         <div className={css.orderSteps} aria-label="Etapas confirmadas do pedido">
          {orderTimeline(order).map(step=><span key={step.id} className={step.done?css.stepDone:css.stepPending}>
            {step.done?'✓':'○'} {step.label}
          </span>)}
         </div>
         {order.products.length>0&&<p>{order.products.map(x=>x.quantity+'× '+x.name).join(', ')}</p>}
         {order.trackingCode&&<small>Rastreio: {order.trackingCode}</small>}
         {order.trackingUrl&&<a href={order.trackingUrl} rel="noopener noreferrer" target="_blank">Acompanhar rastreio</a>}
         <button type="button" className={css.shippingButton} onClick={()=>onInspectShipping?.(order.id)}
            disabled={shippingDetails[order.id]?.state==='loading'}>
           <Icon name="package" size={16}/>
           {shippingDetails[order.id]?.state==='loading'?'Consultando expedição…':'Consultar remessas e avisos'}
         </button>
         {shippingDetails[order.id]?.state==='error'&&
           <p role="alert" className={css.alert}>{shippingDetails[order.id].message}</p>}
         {shippingDetails[order.id]?.state==='ready'&&(()=>{
           const info=shippingDetails[order.id].data?.shipping;
           return <div className={css.shippingPreview}>
             <strong>Expedição conferida na Nuvemshop</strong>
             {info?.availability!=='ready'?
               <p>Os volumes ainda não foram disponibilizados de forma completa. Não podemos confirmar o envio.</p>:
               <>
                 <p>{info.shipments.length} remessa(s) · {info.completed} enviada(s)</p>
                 {info.shipments.map((shipment,index)=><div key={shipment.id||index} className={css.shippingParcel}>
                   <strong>Remessa {shipment.number} · {shipment.type==='pickup'?'Retirada':shipment.type==='ship'?'Entrega':'Modalidade não informada'}</strong>
                   <span>{({UNPACKED:'Pendente',PENDING:'Pendente',IN_PREPARATION:'Em preparação',
                     PACKED:'Embalado',DISPATCHED:'Despachado',DELIVERED:'Concluído',READY_FOR_PICKUP:'Pronto para retirada'})[shipment.status]||'Status não confirmado'}</span>
                   {shipment.carrier&&<small>{shipment.carrier}</small>}
                   {shipment.trackingCode&&<small>Código: {shipment.trackingCode}</small>}
                   {shipment.trackingUrl&&<a href={shipment.trackingUrl} rel="noopener noreferrer" target="_blank">Acompanhar remessa</a>}
                 </div>)}
                 {info.notice&&<div className={css.shippingNotice}>
                   <strong>{info.notice.title}</strong>
                   <p>{info.notice.draft}</p>
                   <button type="button" className={css.prepare} disabled={!canPrepare}
                      onClick={()=>onPrepare(info.notice.draft)}>
                      <Icon name="chat" size={15}/> Preparar aviso no WhatsApp
                   </button>
                 </div>}
               </>}
             <small className={css.hint}>Informações consultadas neste momento. Nenhum aviso foi enviado.</small>
           </div>;
         })()}

         {orderUpdateDraft(order)&&<button type="button" className={css.prepare} disabled={!canPrepare}
           onClick={()=>onPrepare(orderUpdateDraft(order))}>
           <Icon name="chat" size={15}/> Preparar atualização do pedido
         </button>}
        </div>)}
        {o.some(order=>orderUpdateDraft(order))&&!canPrepare&&
         <small className={css.hint}>Envio indisponível nesta conversa: fora da janela de 24 horas, sem permissão ou atribuída a outro sistema. Um modelo aprovado pela Meta pode ser necessário.</small>}
       </section>
       <section className={css.card}>
        <div className={css.sectionHead}><h3>Checkouts abandonados</h3><span>{c.length} encontrado(s)</span></div>
        <small className={css.hint}>Disponíveis na Nuvemshop por até 30 dias. Confira se o checkout foi convertido em pedido antes de enviar lembretes.</small>
        {!c.length&&<p className={css.empty}>Nenhum checkout identificado no período disponível.</p>}
        {c.map(item=><div key={item.id} className={css.order}>
         <div className={css.orderTitle}><strong>Checkout {date(item.at)}</strong><span>{currency(item.total)}</span></div>
         {item.products.length>0&&<p>{item.products.map(x=>x.quantity+'× '+x.name).join(', ')}</p>}
         {item.url&&<a href={item.url} rel="noopener noreferrer" target="_blank">Ver checkout</a>}
        </div>)}
       </section>
     </>}
     <p className={css.foot}>O histórico de mensagens continua no chat. Pedidos e checkouts são consultados em tempo real e relacionados somente pelo telefone confirmado. Antes de qualquer campanha, valide consentimento e preferências de contato.</p>
   </div>}
  </aside>
 </div>;
}
