'use client';

import { useEffect, useMemo, useState } from 'react';

const navItems = [
  { id: 'dashboard', label: 'Visão geral', icon: '◫' },
  { id: 'calendar', label: 'Calendário', icon: '▦' },
  { id: 'ideas', label: 'Banco de ideias', icon: '✦' },
  { id: 'tasks', label: 'Próximos passos', icon: '✓' },
  { id: 'metrics', label: 'Métricas', icon: '↗' },
  { id: 'goals', label: 'Metas', icon: '◎' },
];

const defaultMetrics = {
  seguidores: 0,
  alcance: 0,
  visualizacoes: 0,
  visitasPerfil: 0,
  interacoes: 0,
  leads: 0,
};

const defaultPosts = [
  {
    id: 1,
    date: 'Hoje',
    time: '18:30',
    format: 'Stories',
    title: 'Temas e formato da nova imersão',
    objective: 'Conversão',
    status: 'Pronto para publicar',
  },
  {
    id: 2,
    date: 'Quinta',
    time: '12:00',
    format: 'Carrossel',
    title: '3 sinais de que sua operação cresceu sem estrutura',
    objective: 'Autoridade',
    status: 'Em criação',
  },
  {
    id: 3,
    date: 'Sexta',
    time: '19:00',
    format: 'Reel',
    title: 'O que fiz para sair de 500 mil para 3 milhões por mês',
    objective: 'Autoridade',
    status: 'Roteiro',
  },
];

const defaultIdeas = [
  {
    id: 1,
    title: 'Por que faturamento alto não significa uma operação saudável',
    audience: 'Vendedores que querem escalar',
    format: 'Reel',
    priority: 'Alta',
  },
  {
    id: 2,
    title: 'Quando contratar antes que o gargalo vire prejuízo?',
    audience: 'Operações em crescimento',
    format: 'Carrossel',
    priority: 'Média',
  },
  {
    id: 3,
    title: 'A diferença entre vender no marketplace e construir uma empresa',
    audience: 'Intermediário',
    format: 'Reel',
    priority: 'Alta',
  },
];

const defaultTasks = [
  { id: 1, text: 'Finalizar o roteiro do Reel de autoridade', done: false, priority: 'Alta' },
  { id: 2, text: 'Criar a arte do carrossel sobre estrutura', done: false, priority: 'Alta' },
  { id: 3, text: 'Revisar o CTA da Imersão Ecommerce', done: true, priority: 'Média' },
  { id: 4, text: 'Atualizar as métricas da semana', done: false, priority: 'Média' },
  { id: 5, text: 'Separar três provas sociais para os Stories', done: false, priority: 'Baixa' },
];

const defaultGoals = [
  { id: 1, name: 'Conteúdos publicados', current: 8, target: 16, unit: 'posts' },
  { id: 2, name: 'Leads qualificados', current: 12, target: 30, unit: 'leads' },
  { id: 3, name: 'Conteúdos de autoridade', current: 5, target: 8, unit: 'conteúdos' },
  { id: 4, name: 'Conversas comerciais', current: 7, target: 15, unit: 'conversas' },
];

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) setValue(JSON.parse(saved));
    } catch (error) {
      console.warn(`Não foi possível carregar ${key}`, error);
    } finally {
      setReady(true);
    }
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Não foi possível salvar ${key}`, error);
    }
  }, [key, ready, value]);

  return [value, setValue];
}

function formatNumber(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', { notation: number >= 10000 ? 'compact' : 'standard' }).format(number);
}

function Progress({ current, target }) {
  const percent = Math.min(100, Math.round((Number(current) / Math.max(1, Number(target))) * 100));
  return (
    <div className="progress-wrap" aria-label={`${percent}% concluído`}>
      <div className="progress-bar" style={{ width: `${percent}%` }} />
    </div>
  );
}

function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

export default function Home() {
  const [active, setActive] = useState('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [metrics, setMetrics] = useStoredState('guihub-metrics', defaultMetrics);
  const [posts, setPosts] = useStoredState('guihub-posts', defaultPosts);
  const [ideas, setIdeas] = useStoredState('guihub-ideas', defaultIdeas);
  const [tasks, setTasks] = useStoredState('guihub-tasks', defaultTasks);
  const [goals, setGoals] = useStoredState('guihub-goals', defaultGoals);
  const [ideaDraft, setIdeaDraft] = useState({ title: '', audience: '', format: 'Reel', priority: 'Média' });
  const [postDraft, setPostDraft] = useState({ date: '', time: '', format: 'Reel', title: '', objective: 'Autoridade', status: 'Ideia' });

  const completedTasks = tasks.filter((task) => task.done).length;
  const totalContent = posts.length;
  const authorityContent = posts.filter((post) => post.objective === 'Autoridade').length;
  const conversionContent = posts.filter((post) => post.objective === 'Conversão').length;

  const metricCards = useMemo(
    () => [
      { key: 'seguidores', label: 'Seguidores', helper: 'Total atual' },
      { key: 'alcance', label: 'Alcance', helper: 'Últimos 30 dias' },
      { key: 'visualizacoes', label: 'Visualizações', helper: 'Últimos 30 dias' },
      { key: 'leads', label: 'Leads', helper: 'Gerados pelo Instagram' },
    ],
    []
  );

  function goTo(section) {
    setActive(section);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function addIdea() {
    if (!ideaDraft.title.trim()) return;
    setIdeas((current) => [
      { id: Date.now(), ...ideaDraft, audience: ideaDraft.audience || 'A definir' },
      ...current,
    ]);
    setIdeaDraft({ title: '', audience: '', format: 'Reel', priority: 'Média' });
  }

  function addPost() {
    if (!postDraft.title.trim() || !postDraft.date.trim()) return;
    setPosts((current) => [{ id: Date.now(), ...postDraft }, ...current]);
    setPostDraft({ date: '', time: '', format: 'Reel', title: '', objective: 'Autoridade', status: 'Ideia' });
  }

  function toggleTask(id) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  }

  function removeItem(setter, id) {
    setter((current) => current.filter((item) => item.id !== id));
  }

  function renderDashboard() {
    return (
      <>
        <section className="hero-row">
          <div>
            <span className="eyebrow">INSTAGRAM · @GUI_NONATO</span>
            <h1>Boa tarde, Juliany.</h1>
            <p className="subtitle">Aqui está o que precisa da sua atenção hoje.</p>
          </div>
          <button className="primary-button" onClick={() => goTo('calendar')}>+ Adicionar conteúdo</button>
        </section>

        <section className="metrics-grid">
          {metricCards.map((card) => (
            <article className="metric-card" key={card.key}>
              <div className="metric-top">
                <span>{card.label}</span>
                <span className="metric-icon">↗</span>
              </div>
              <strong>{formatNumber(metrics[card.key])}</strong>
              <small>{card.helper}</small>
            </article>
          ))}
        </section>

        <section className="dashboard-grid">
          <article className="panel focus-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FOCO DE HOJE</span>
                <h2>Prioridades</h2>
              </div>
              <span className="count-badge">{completedTasks}/{tasks.length}</span>
            </div>
            <div className="task-list compact">
              {tasks.slice(0, 4).map((task) => (
                <label className={`task-row ${task.done ? 'done' : ''}`} key={task.id}>
                  <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} />
                  <span className="custom-check">✓</span>
                  <span className="task-copy">{task.text}</span>
                  <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                </label>
              ))}
            </div>
            <button className="text-button" onClick={() => goTo('tasks')}>Ver todos os próximos passos →</button>
          </article>

          <article className="panel insight-panel">
            <span className="eyebrow">LEITURA ESTRATÉGICA</span>
            <h2>O perfil precisa provar mais experiência operacional.</h2>
            <p>Os próximos conteúdos devem falar com vendedores que já faturam, mas estão travados em estrutura, margem, estoque, time e escala.</p>
            <div className="insight-action">
              <span>Próxima ação recomendada</span>
              <strong>Criar um Reel sobre gargalos de crescimento.</strong>
            </div>
          </article>
        </section>

        <section className="dashboard-grid lower-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">AGENDA</span>
                <h2>Próximos conteúdos</h2>
              </div>
              <button className="text-button" onClick={() => goTo('calendar')}>Ver calendário</button>
            </div>
            <div className="post-list">
              {posts.slice(0, 3).map((post) => (
                <div className="post-row" key={post.id}>
                  <div className="date-box"><strong>{post.date}</strong><span>{post.time || '—'}</span></div>
                  <div className="post-copy"><span>{post.format} · {post.objective}</span><strong>{post.title}</strong></div>
                  <span className="status-badge">{post.status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DISTRIBUIÇÃO</span>
                <h2>Mix de conteúdo</h2>
              </div>
              <span className="count-badge">{totalContent}</span>
            </div>
            <div className="mix-list">
              <div><span>Autoridade</span><strong>{authorityContent}</strong><Progress current={authorityContent} target={Math.max(totalContent, 1)} /></div>
              <div><span>Conversão</span><strong>{conversionContent}</strong><Progress current={conversionContent} target={Math.max(totalContent, 1)} /></div>
              <div><span>Relacionamento</span><strong>{Math.max(totalContent - authorityContent - conversionContent, 0)}</strong><Progress current={Math.max(totalContent - authorityContent - conversionContent, 0)} target={Math.max(totalContent, 1)} /></div>
            </div>
          </article>
        </section>
      </>
    );
  }

  function renderCalendar() {
    return (
      <>
        <section className="page-heading"><div><span className="eyebrow">PLANEJAMENTO</span><h1>Calendário de conteúdo</h1><p className="subtitle">Organize o que será publicado, quando e com qual objetivo.</p></div></section>
        <section className="two-column-form">
          <article className="panel form-panel">
            <h2>Novo conteúdo</h2>
            <div className="form-grid">
              <label>Data<input value={postDraft.date} onChange={(e) => setPostDraft({ ...postDraft, date: e.target.value })} placeholder="Ex.: Sexta" /></label>
              <label>Horário<input type="time" value={postDraft.time} onChange={(e) => setPostDraft({ ...postDraft, time: e.target.value })} /></label>
              <label className="full-field">Tema<input value={postDraft.title} onChange={(e) => setPostDraft({ ...postDraft, title: e.target.value })} placeholder="Qual será o assunto?" /></label>
              <label>Formato<select value={postDraft.format} onChange={(e) => setPostDraft({ ...postDraft, format: e.target.value })}><option>Reel</option><option>Carrossel</option><option>Stories</option><option>Foto</option><option>Live</option></select></label>
              <label>Objetivo<select value={postDraft.objective} onChange={(e) => setPostDraft({ ...postDraft, objective: e.target.value })}><option>Autoridade</option><option>Conversão</option><option>Relacionamento</option><option>Alcance</option></select></label>
              <label className="full-field">Status<select value={postDraft.status} onChange={(e) => setPostDraft({ ...postDraft, status: e.target.value })}><option>Ideia</option><option>Roteiro</option><option>Em criação</option><option>Aguardando aprovação</option><option>Pronto para publicar</option><option>Publicado</option></select></label>
            </div>
            <button className="primary-button full-button" onClick={addPost}>Adicionar ao calendário</button>
          </article>
          <article className="panel mini-guide"><span className="eyebrow">REGRA DA SEMANA</span><h2>Conteúdo com função clara.</h2><p>Antes de publicar, escolha uma única intenção principal: atrair, provar autoridade, criar relacionamento ou converter.</p><ul><li>2 conteúdos de autoridade</li><li>1 conteúdo de alcance</li><li>1 sequência de conversão</li><li>Stories de relacionamento todos os dias</li></ul></article>
        </section>
        <section className="panel list-panel"><div className="panel-heading"><div><span className="eyebrow">PROGRAMAÇÃO</span><h2>Conteúdos cadastrados</h2></div><span className="count-badge">{posts.length}</span></div>{posts.length === 0 ? <EmptyState>Nenhum conteúdo cadastrado.</EmptyState> : <div className="content-table">{posts.map((post) => <div className="content-card" key={post.id}><div className="content-date"><strong>{post.date}</strong><span>{post.time || 'Sem horário'}</span></div><div className="content-main"><div className="tag-row"><span>{post.format}</span><span>{post.objective}</span></div><h3>{post.title}</h3><small>{post.status}</small></div><button className="icon-button danger" onClick={() => removeItem(setPosts, post.id)} aria-label="Excluir conteúdo">×</button></div>)}</div>}</section>
      </>
    );
  }

  function renderIdeas() {
    return (
      <>
        <section className="page-heading"><div><span className="eyebrow">CRIATIVIDADE ORGANIZADA</span><h1>Banco de ideias</h1><p className="subtitle">Guarde ideias sem precisar transformar tudo em post na mesma hora.</p></div></section>
        <section className="two-column-form">
          <article className="panel form-panel"><h2>Adicionar ideia</h2><div className="form-grid"><label className="full-field">Ideia<textarea rows="4" value={ideaDraft.title} onChange={(e) => setIdeaDraft({ ...ideaDraft, title: e.target.value })} placeholder="Ex.: Por que vender mais pode piorar seu caixa?" /></label><label className="full-field">Público<input value={ideaDraft.audience} onChange={(e) => setIdeaDraft({ ...ideaDraft, audience: e.target.value })} placeholder="Para quem é esse conteúdo?" /></label><label>Formato<select value={ideaDraft.format} onChange={(e) => setIdeaDraft({ ...ideaDraft, format: e.target.value })}><option>Reel</option><option>Carrossel</option><option>Stories</option><option>Live</option></select></label><label>Prioridade<select value={ideaDraft.priority} onChange={(e) => setIdeaDraft({ ...ideaDraft, priority: e.target.value })}><option>Alta</option><option>Média</option><option>Baixa</option></select></label></div><button className="primary-button full-button" onClick={addIdea}>Salvar ideia</button></article>
          <article className="panel mini-guide"><span className="eyebrow">FILTRO ESTRATÉGICO</span><h2>Uma boa pauta responde a uma dor real.</h2><p>Priorize ideias que mostrem experiência, tragam uma opinião clara ou resolvam um problema de quem já vende.</p></article>
        </section>
        <section className="ideas-grid">{ideas.map((idea) => <article className="idea-card" key={idea.id}><div className="idea-top"><span className={`priority priority-${idea.priority.toLowerCase()}`}>{idea.priority}</span><button className="icon-button danger" onClick={() => removeItem(setIdeas, idea.id)}>×</button></div><h3>{idea.title}</h3><p>{idea.audience}</p><span className="format-chip">{idea.format}</span></article>)}</section>
      </>
    );
  }

  function renderTasks() {
    return (
      <><section className="page-heading"><div><span className="eyebrow">EXECUÇÃO</span><h1>Próximos passos</h1><p className="subtitle">Uma lista simples para saber exatamente o que fazer agora.</p></div></section><section className="panel task-page"><div className="panel-heading"><div><h2>Tarefas da semana</h2><p>{completedTasks} de {tasks.length} concluídas</p></div><span className="count-badge">{Math.round((completedTasks / Math.max(tasks.length, 1)) * 100)}%</span></div><Progress current={completedTasks} target={Math.max(tasks.length, 1)} /><div className="task-list page-list">{tasks.map((task) => <label className={`task-row ${task.done ? 'done' : ''}`} key={task.id}><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} /><span className="custom-check">✓</span><span className="task-copy">{task.text}</span><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span></label>)}</div></section></>
    );
  }

  function renderMetrics() {
    const fields = [
      ['seguidores', 'Seguidores'], ['alcance', 'Alcance'], ['visualizacoes', 'Visualizações'],
      ['visitasPerfil', 'Visitas ao perfil'], ['interacoes', 'Interações'], ['leads', 'Leads gerados'],
    ];
    return (
      <><section className="page-heading"><div><span className="eyebrow">DESEMPENHO</span><h1>Métricas do Instagram</h1><p className="subtitle">Por enquanto, copie os números do Instagram Insights uma vez por semana.</p></div></section><section className="metrics-edit-grid">{fields.map(([key, label]) => <label className="metric-input-card" key={key}><span>{label}</span><input type="number" min="0" value={metrics[key]} onChange={(e) => setMetrics({ ...metrics, [key]: Number(e.target.value) })} /><small>Salvo automaticamente</small></label>)}</section><section className="panel instruction-panel"><span className="eyebrow">COMO ATUALIZAR</span><h2>Abra o Instagram profissional do Gui</h2><ol><li>Entre em Painel profissional.</li><li>Abra Insights.</li><li>Selecione os últimos 30 dias.</li><li>Copie os números para os campos acima.</li></ol><p className="note">Em uma próxima etapa, essa atualização será automática pela integração oficial da Meta.</p></section></>
    );
  }

  function renderGoals() {
    return (
      <><section className="page-heading"><div><span className="eyebrow">DIREÇÃO</span><h1>Metas mensais</h1><p className="subtitle">Acompanhe metas ligadas a conteúdo, leads e vendas — não apenas curtidas.</p></div></section><section className="goals-grid">{goals.map((goal) => { const percent = Math.min(100, Math.round((goal.current / Math.max(goal.target, 1)) * 100)); return <article className="goal-card" key={goal.id}><div className="goal-top"><div><span>{goal.name}</span><strong>{percent}%</strong></div><span>{goal.current} / {goal.target} {goal.unit}</span></div><Progress current={goal.current} target={goal.target} /><div className="goal-inputs"><label>Atual<input type="number" min="0" value={goal.current} onChange={(e) => setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, current: Number(e.target.value) } : item))} /></label><label>Meta<input type="number" min="1" value={goal.target} onChange={(e) => setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, target: Number(e.target.value) } : item))} /></label></div></article>; })}</section><section className="panel insight-panel small-insight"><span className="eyebrow">IMPORTANTE</span><h2>Visualização é diagnóstico. Venda é resultado.</h2><p>O painel foi pensado para conectar conteúdo com leads, conversas comerciais e produtos do Gui.</p></section></>
    );
  }

  const content = {
    dashboard: renderDashboard,
    calendar: renderCalendar,
    ideas: renderIdeas,
    tasks: renderTasks,
    metrics: renderMetrics,
    goals: renderGoals,
  }[active];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark">GN</div><div><strong>GUI SOCIAL HUB</strong><span>Central estratégica</span></div></div>
        <nav>{navItems.map((item) => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => goTo(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav>
        <div className="sidebar-bottom"><div className="profile-dot">J</div><div><strong>Juliany</strong><span>Social media</span></div></div>
      </aside>
      {mobileMenu && <button className="menu-overlay" onClick={() => setMobileMenu(false)} aria-label="Fechar menu" />}
      <main className="main-content">
        <header className="topbar"><button className="menu-button" onClick={() => setMobileMenu(true)}>☰</button><div className="account-pill"><span className="instagram-dot">◎</span><div><strong>@gui_nonato</strong><span>Instagram</span></div></div><span className="demo-badge">MVP · DADOS MANUAIS</span></header>
        <div className="page-content">{content()}</div>
      </main>
    </div>
  );
}
