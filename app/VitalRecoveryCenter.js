'use client';

import { useEffect, useState } from 'react';
import { api } from './operations/useOperations';
import css from './vital-crm-real.module.css';

const FILTERS = [
  ['all', 'Todos'],
  ['payment_pending', 'Pagamento pendente'],
  ['checkout_abandoned', 'Checkout abandonado'],
  ['cart_abandoned', 'Carrinho abandonado'],
  ['payment_expired', 'Pagamento expirado'],
  ['payment_confirmed', 'Pagamento confirmado'],
  ['sale_recovered', 'Venda recuperada'],
];

const LABELS = {
  payment_pending: 'Pagamento pendente',
  checkout_abandoned: 'Checkout abandonado',
  cart_abandoned: 'Carrinho abandonado',
  payment_expired: 'Pagamento expirado',
  payment_confirmed: 'Pagamento confirmado',
  sale_recovered: 'Venda recuperada',
};

function date(value) {
  const stamp = Date.parse(value || '');
  return Number.isFinite(stamp)
    ? new Date(stamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : 'Data não disponível';
}

function money(value, currency) {
  if (String(value || '').trim() === '') return '';
  const amount = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount)) return '';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(amount);
  } catch {
    return '';
  }
}

function historyText(entry) {
  const stage = String(entry.stage || '').replaceAll('_', ' ');
  const state = {
    sent: 'enviada',
    sending: 'em processamento',
    skipped: 'interrompida',
    uncertain: 'aguardando reconciliação',
  }[entry.state] || entry.state;
  return stage + ' · ' + state + ' · ' + date(entry.updatedAt || entry.createdAt);
}

export default function VitalRecoveryCenter() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api('/api/crm/vital/payment-recovery', { signal: controller.signal })
      .then(data => { if (active) setResult(data); })
      .catch(problem => { if (active) setError(problem.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [revision]);

  const items = (result?.items || []).filter(item => filter === 'all' || item.kind === filter);
  const counts = result?.counts || {};
  const refresh = () => setRevision(value => value + 1);
  const checks = result?.checks || [];

  return (
    <section className={css.recovery}>
      <div className={css.recoveryIntro}>
        <div>
          <h2>Recuperação de vendas</h2>
          <p>Pedidos e checkouts acompanhados pela API da Nuvemshop, com status de pagamento consultado antes de qualquer envio.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar dados'}</button>
      </div>

      <div className={css.recoveryChecks}>
        {checks.map(check => (
          <div className={check.ready ? css.recoveryCheckReady : css.recoveryCheck} key={check.id}>
            <span>{check.ready ? '✓' : '•'}</span>
            <div><strong>{check.label}</strong><small>{check.detail}</small></div>
          </div>
        ))}
      </div>

      <div className={css.recoveryStats}>
        {FILTERS.filter(([key]) => key !== 'all').map(([key, label]) => (
          <div className={css.recoveryStat} key={key}>
            <span>{label}</span><strong>{counts[key] || 0}</strong>
          </div>
        ))}
      </div>

      <nav className={css.recoveryFilters} aria-label="Filtrar recuperação de vendas">
        {FILTERS.map(([key, label]) => (
          <button type="button" key={key} className={filter === key ? css.recoveryFilterActive : ''}
            aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}<span>{key === 'all' ? (result?.items || []).length : counts[key] || 0}</span>
          </button>
        ))}
      </nav>

      {error && <div className={css.alert} role="alert">{error}</div>}
      {result?.incomplete && <p className={css.smallNotice}>A consulta atingiu o limite de páginas para evitar demora. Alguns registros podem não aparecer.</p>}
      {result?.checkoutsUnavailable && <p className={css.smallNotice}>A conexão da loja não liberou a leitura de checkouts abandonados. A consulta de pedidos continua disponível.</p>}
      {loading && !result && <div className={css.loading}>Consultando pedidos e checkouts…</div>}

      {!loading && !error && items.length === 0 && (
        <div className={css.recoveryEmpty}>
          {filter === 'cart_abandoned'
            ? 'A API da Nuvemshop disponibiliza checkouts a partir da segunda etapa. Carrinhos abandonados antes desse ponto não estão expostos por esta integração.'
            : filter === 'sale_recovered'
              ? 'Nenhuma venda recuperada pôde ser ligada a um checkout por identificador confirmado.'
              : 'Nenhum registro nesta etapa no período consultado.'}
        </div>
      )}

      <div className={css.recoveryList}>
        {items.map(item => (
          <article className={css.recoveryItem} key={item.entityType + ':' + item.entityId}>
            <header>
              <div><span className={css.recoveryBadge}>{LABELS[item.kind] || item.kind}</span>
                <h3>{item.customerName}</h3>
                <p>{item.entityType === 'order' ? 'Pedido #' + (item.orderNumber || item.entityId) : 'Checkout Nuvemshop #' + item.entityId}</p>
              </div>
              <strong>{money(item.total, item.currency)}</strong>
            </header>
            <div className={css.recoveryDetails}>
              <span>Contato: {item.contactHint}</span>
              <span>Registrado: {date(item.createdAt)}</span>
              <span>Status do pedido: {item.orderStatus || 'sem pedido gerado'}</span>
              <span>Pagamento: {item.paymentStatus}</span>
              <span>Modalidade: {item.paymentMethod}</span>
            </div>
            {item.recoveryUrl && (
              <a href={item.recoveryUrl} target="_blank" rel="noreferrer">
                {item.entityType === 'checkout' ? 'Abrir checkout oficial' : 'Abrir página da loja'}
              </a>
            )}
            {item.history?.length > 0 && (
              <div className={css.recoveryHistory}>
                <strong>Histórico</strong>
                {item.history.map((entry, index) => <span key={entry.stage + ':' + index}>{historyText(entry)}</span>)}
              </div>
            )}
          </article>
        ))}
      </div>
      <p className={css.recoveryFootnote}>Carrinho simples, checkout abandonado, pedido pendente e recuperação são estados separados. Uma venda só aparece como recuperada quando o token do checkout coincide com o do pedido pago.</p>
    </section>
  );
}
