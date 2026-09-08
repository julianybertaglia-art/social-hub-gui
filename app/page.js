'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import DetailDialog from './DetailDialog';

const SECTION_IDS = ['dashboard', 'calendar', 'tasks', 'ideas', 'metrics', 'goals'];

const navGroups = [
  {
    label: 'PRINCIPAL',
    items: [{ id: 'dashboard', label: 'Visão geral', icon: '⌂', type: 'section' }],
  },
  {
    label: 'PLANEJAMENTO',
    items: [
      { id: 'calendar', label: 'Calendário', icon: '▦', type: 'section' },
      { id: 'tasks', label: 'Tarefas', icon: '✓', type: 'section' },
      { id: 'ideas', label: 'Ideias', icon: '✦', type: 'section' },
    ],
  },
  {
    label: 'AUDIÊNCIA',
    items: [
      { href: '/whatsapp', label: 'CRM', icon: '◉', type: 'link' },
      { href: '/automacoes', label: 'Automações', icon: '⚡', type: 'link' },
    ],
  },
  {
    label: 'ANALYTICS',
    items: [
      { id: 'metrics', label: 'Métricas', icon: '↗', type: 'section' },
      { id: 'goals', label: 'Metas', icon: '◎', type: 'section' },
    ],
  },
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
  return new Intl.NumberFormat('pt-BR', {
    notation: number >= 10000 ? 'compact' : 'standard',
  }).format(number);
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

function TaskRow({ task, onToggle, onOpen }) {
  return (
    <div className={`task-row ${task.done ? 'done' : ''}`}>
      <label className="task-check-control">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => onToggle(task.id)}
          aria-label={`${task.done ? 'Reabrir' : 'Concluir'} tarefa: ${task.text}`}
        />
        <span className="custom-check" aria-hidden="true">✓</span>
      </label>
      <button
        type="button"
        className="task-details-button"
        onClick={() => onOpen(task.id)}
        aria-haspopup="dialog"
      >
        <span className="task-copy">{task.text}</span>
        <span className="task-open-hint">Ver detalhes →</span>
      </button>
      <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
    </div>
  );
}

export default function Home() {
  const [active, setActive] = useState('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [greeting, setGreeting] = useState('Olá');
  const [crmSummary, setCrmSummary] = useState({ total: null, newLeads: null });
  const [automationCount, setAutomationCount] = useState(1);
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [metrics, setMetrics] = useStoredState('guihub-metrics', defaultMetrics);
  const [posts, setPosts] = useStoredState('guihub-posts', defaultPosts);
  const [ideas, setIdeas] = useStoredState('guihub-ideas', defaultIdeas);
  const [tasks, setTasks] = useStoredState('guihub-tasks', defaultTasks);
  const [goals, setGoals] = useStoredState('guihub-goals', defaultGoals);
  const [ideaDraft, setIdeaDraft] = useState({ title: '', audience: '', format: 'Reel', priority: 'Média' });
  const [postDraft, setPostDraft] = useState({ date: '', time: '', format: 'Reel', title: '', objective: 'Autoridade', status: 'Ideia' });
  const [detailPath, setDetailPath] = useState([]);

  const selectedDetail = detailPath[detailPath.length - 1];
  const detailItem = selectedDetail && (selectedDetail.kind === 'task' ? tasks : posts)
    .find((item) => item.id === selectedDetail.id);
  const relatedPosts = (detailItem?.brief?.relatedPostIds || [])
    .map((id) => posts.find((post) => post.id === id))
    .filter(Boolean);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSection = params.get('section');
    if (SECTION_IDS.includes(requestedSection)) setActive(requestedSection);

    const hour = Number(new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()));
    setGreeting(hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite');

    try {
      const stored = JSON.parse(window.localStorage.getItem('guihub-automations') || '[]');
      const activeRules = Array.isArray(stored)
        ? stored.filter((rule) => rule?.active && String(rule?.keyword || '').trim() && String(rule?.privateMessage || '').trim()).length
        : 0;
      setAutomationCount(activeRules + 1);
    } catch {
      setAutomationCount(1);
    }

    fetch('/api/whatsapp/conversations', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        const contacts = Array.isArray(data?.contacts) ? data.contacts : [];
        setCrmSummary({
          total: contacts.length,
          newLeads: contacts.filter((contact) => contact.stage === 'Novo lead').length,
        });
      })
      .catch(() => {});

    Promise.all([
      fetch('/api/instagram/profile', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/instagram', { cache: 'no-store' }).then((response) => response.json()),
    ])
      .then(([profileData, metricsData]) => {
        const apiMetrics = metricsData?.metrics || {};
        setLiveMetrics({
          ...apiMetrics,
          seguidores: profileData?.followersCount || apiMetrics.seguidores || 0,
        });
      })
      .catch(() => {});
  }, []);

  function openTask(id) {
    setDetailPath([{ kind: 'task', id }]);
  }

  function openPost(id) {
    setDetailPath([{ kind: 'post', id }]);
  }

  function goTo(section) {
    setActive(section);
    setMobileMenu(false);
    const nextUrl = section === 'dashboard' ? '/' : `/?section=${section}`;
    window.history.replaceState(null, '', nextUrl);
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
    setTasks((current) => current.map((task) => (
      task.id === id ? { ...task, done: !task.done } : task
    )));
  }

  function removeItem(setter, id) {
    setter((current) => current.filter((item) => item.id !== id));
  }

  const completedTasks = tasks.filter((task) => task.done).length;
  const pendingTasks = tasks.filter((task) => !task.done);
  const sortedPendingTasks = [...pendingTasks].sort((a, b) => {
    const rank = { Alta: 0, Média: 1, Baixa: 2 };
    return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
  });
  const highPriorityCount = pendingTasks.filter((task) => task.priority === 'Alta').length;
  const scheduledPosts = posts.filter((post) => post.status !== 'Publicado');
  const contentInProduction = posts.filter((post) => ['Ideia', 'Roteiro', 'Em criação', 'Aguardando aprovação'].includes(post.status)).length;
  const totalContent = posts.length;
  const authorityContent = posts.filter((post) => post.objective === 'Autoridade').length;
  const conversionContent = posts.filter((post) => post.objective === 'Conversão').length;
  const currentMetrics = liveMetrics || metrics;
  const leadCount = crmSummary.total ?? metrics.leads;

  function renderDashboard() {
    const attentionItems = [
      {
        title: highPriorityCount ? `${highPriorityCount} ${highPriorityCount === 1 ? 'tarefa de alta prioridade' : 'tarefas de alta prioridade'}` : 'Prioridades sob controle',
        text: highPriorityCount ? 'Vale resolver essas tarefas antes de abrir novas frentes.' : 'Nenhuma tarefa urgente pendente agora.',
        tone: highPriorityCount ? 'warning' : 'ok',
        action: () => goTo('tasks'),
      },
      {
        title: crmSummary.newLeads ? `${crmSummary.newLeads} ${crmSummary.newLeads === 1 ? 'lead novo no CRM' : 'leads novos no CRM'}` : 'CRM sem novos leads pendentes',
        text: crmSummary.newLeads ? 'Abra as conversas e priorize quem ainda está em “Novo lead”.' : 'Nenhuma conversa nova exigindo atenção neste momento.',
        tone: crmSummary.newLeads ? 'warning' : 'ok',
        href: '/whatsapp',
      },
      {
        title: contentInProduction ? `${contentInProduction} ${contentInProduction === 1 ? 'conteúdo em produção' : 'conteúdos em produção'}` : 'Produção em dia',
        text: contentInProduction ? 'Confira roteiro, criação e aprovação para não acumular a agenda.' : 'Não há conteúdo travado nas etapas de produção.',
        tone: contentInProduction ? 'neutral' : 'ok',
        action: () => goTo('calendar'),
      },
    ];

    return (
      <>
        <section className="hero-row dashboard-hero">
          <div>
            <span className="eyebrow">PAINEL DO DIA · GUI NONATO</span>
            <h1>{greeting}, Juliany.</h1>
            <p className="subtitle">O que precisa da sua atenção, sem misturar tudo na mesma tela.</p>
          </div>
          <button className="primary-button" onClick={() => goTo('calendar')}>+ Adicionar conteúdo</button>
        </section>

        <section className="quick-stats" aria-label="Resumo do dia">
          <button type="button" className="quick-stat" onClick={() => goTo('tasks')}>
            <span>Tarefas pendentes</span>
            <strong>{pendingTasks.length}</strong>
            <small>{highPriorityCount ? `${highPriorityCount} de alta prioridade` : 'Nenhuma urgente'}</small>
          </button>
          <button type="button" className="quick-stat" onClick={() => goTo('calendar')}>
            <span>Conteúdos programados</span>
            <strong>{scheduledPosts.length}</strong>
            <small>{contentInProduction ? `${contentInProduction} em produção` : 'Tudo encaminhado'}</small>
          </button>
          <Link className="quick-stat" href="/whatsapp">
            <span>Leads no CRM</span>
            <strong>{formatNumber(leadCount)}</strong>
            <small>{crmSummary.newLeads === null ? 'Carregando CRM…' : `${crmSummary.newLeads} novos`}</small>
          </Link>
          <Link className="quick-stat" href="/automacoes">
            <span>Automações ativas</span>
            <strong>{automationCount}</strong>
            <small>Direct e comentários</small>
          </Link>
        </section>

        <section className="home-layout">
          <div className="home-primary">
            <article className="panel focus-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">FOCO DE HOJE</span>
                  <h2>Prioridades</h2>
                </div>
                <span className="count-badge">{pendingTasks.length}</span>
              </div>
              {sortedPendingTasks.length ? (
                <div className="task-list compact">
                  {sortedPendingTasks.slice(0, 3).map((task) => (
                    <TaskRow key={task.id} task={task} onToggle={toggleTask} onOpen={openTask} />
                  ))}
                </div>
              ) : (
                <EmptyState>Você não tem tarefas pendentes.</EmptyState>
              )}
              <button className="text-button" onClick={() => goTo('tasks')}>Ver todas as tarefas →</button>
            </article>

            <article className="panel agenda-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">AGENDA</span>
                  <h2>Próximos conteúdos</h2>
                </div>
                <button className="text-button" onClick={() => goTo('calendar')}>Ver calendário</button>
              </div>
              {posts.length ? (
                <div className="post-list">
                  {posts.slice(0, 3).map((post) => (
                    <button
                      type="button"
                      className="post-row post-details-button"
                      key={post.id}
                      onClick={() => openPost(post.id)}
                      aria-haspopup="dialog"
                    >
                      <span className="date-box"><strong>{post.date}</strong><span>{post.time || '—'}</span></span>
                      <span className="post-copy">
                        <span>{post.format} · {post.objective}</span>
                        <strong>{post.title}</strong>
                        <span className="post-open-hint">Ver roteiro →</span>
                      </span>
                      <span className="status-badge">{post.status}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState>Nenhum conteúdo programado.</EmptyState>
              )}
            </article>
          </div>

          <aside className="home-secondary">
            <article className="panel attention-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">ATENÇÃO</span>
                  <h2>O que merece olhar</h2>
                </div>
              </div>
              <div className="attention-list">
                {attentionItems.map((item) => {
                  const copy = (
                    <>
                      <span className={`attention-dot ${item.tone}`} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.text}</small>
                      </span>
                      <span className="attention-arrow">→</span>
                    </>
                  );
                  return item.href ? (
                    <Link key={item.title} className="attention-item" href={item.href}>{copy}</Link>
                  ) : (
                    <button key={item.title} type="button" className="attention-item" onClick={item.action}>{copy}</button>
                  );
                })}
              </div>
            </article>

            <article className="panel performance-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">PERFORMANCE</span>
                  <h2>Instagram</h2>
                </div>
                <button className="text-button" onClick={() => goTo('metrics')}>Ver métricas</button>
              </div>
              <div className="performance-mini-grid">
                <div><span>Seguidores</span><strong>{formatNumber(currentMetrics.seguidores)}</strong></div>
                <div><span>Alcance 30d</span><strong>{formatNumber(currentMetrics.alcance)}</strong></div>
                <div><span>Interações</span><strong>{formatNumber(currentMetrics.interacoes)}</strong></div>
                <div><span>Visitas ao perfil</span><strong>{formatNumber(currentMetrics.visitasPerfil)}</strong></div>
              </div>
            </article>
          </aside>
        </section>
      </>
    );
  }

  function renderCalendar() {
    return (
      <>
        <section className="page-heading">
          <div>
            <span className="eyebrow">PLANEJAMENTO</span>
            <h1>Calendário de conteúdo</h1>
            <p className="subtitle">Organize o que vai ao ar e clique em cada conteúdo para abrir roteiro e produção.</p>
          </div>
        </section>

        <section className="two-column-form">
          <article className="panel form-panel">
            <h2>Novo conteúdo</h2>
            <div className="form-grid">
              <label>Data<input value={postDraft.date} onChange={(event) => setPostDraft({ ...postDraft, date: event.target.value })} placeholder="Ex.: Sexta" /></label>
              <label>Horário<input type="time" value={postDraft.time} onChange={(event) => setPostDraft({ ...postDraft, time: event.target.value })} /></label>
              <label className="full-field">Tema<input value={postDraft.title} onChange={(event) => setPostDraft({ ...postDraft, title: event.target.value })} placeholder="Qual será o assunto?" /></label>
              <label>Formato<select value={postDraft.format} onChange={(event) => setPostDraft({ ...postDraft, format: event.target.value })}><option>Reel</option><option>Carrossel</option><option>Stories</option><option>Foto</option><option>Live</option></select></label>
              <label>Objetivo<select value={postDraft.objective} onChange={(event) => setPostDraft({ ...postDraft, objective: event.target.value })}><option>Autoridade</option><option>Conversão</option><option>Relacionamento</option><option>Alcance</option></select></label>
              <label className="full-field">Status<select value={postDraft.status} onChange={(event) => setPostDraft({ ...postDraft, status: event.target.value })}><option>Ideia</option><option>Roteiro</option><option>Em criação</option><option>Aguardando aprovação</option><option>Pronto para publicar</option><option>Publicado</option></select></label>
            </div>
            <button className="primary-button full-button" onClick={addPost}>Adicionar ao calendário</button>
          </article>

          <article className="panel mini-guide">
            <span className="eyebrow">REGRA DA SEMANA</span>
            <h2>Conteúdo com função clara.</h2>
            <p>Antes de publicar, escolha uma intenção principal: atrair, provar autoridade, criar relacionamento ou converter.</p>
            <ul><li>2 conteúdos de autoridade</li><li>1 conteúdo de alcance</li><li>1 sequência de conversão</li><li>Stories de relacionamento todos os dias</li></ul>
          </article>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">PROGRAMAÇÃO</span><h2>Conteúdos cadastrados</h2></div>
            <span className="count-badge">{posts.length}</span>
          </div>
          {posts.length === 0 ? (
            <EmptyState>Nenhum conteúdo cadastrado.</EmptyState>
          ) : (
            <div className="content-table">
              {posts.map((post) => (
                <article className="content-card content-with-details" key={post.id}>
                  <button type="button" className="content-details-button" onClick={() => openPost(post.id)} aria-haspopup="dialog">
                    <span className="content-date"><strong>{post.date}</strong><span>{post.time || 'Sem horário'}</span></span>
                    <span className="content-main">
                      <span className="tag-row"><span>{post.format}</span><span>{post.objective}</span></span>
                      <strong className="content-title">{post.title}</strong>
                      <small>{post.status} <span className="post-open-hint">· Ver roteiro →</span></small>
                    </span>
                  </button>
                  <button type="button" className="icon-button danger" onClick={() => removeItem(setPosts, post.id)} aria-label={`Excluir conteúdo: ${post.title}`}>×</button>
                </article>
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  function renderIdeas() {
    return (
      <>
        <section className="page-heading">
          <div><span className="eyebrow">PLANEJAMENTO</span><h1>Ideias</h1><p className="subtitle">Guarde pautas sem transformar tudo em post na mesma hora.</p></div>
        </section>
        <section className="two-column-form">
          <article className="panel form-panel">
            <h2>Adicionar ideia</h2>
            <div className="form-grid">
              <label className="full-field">Ideia<textarea rows="4" value={ideaDraft.title} onChange={(event) => setIdeaDraft({ ...ideaDraft, title: event.target.value })} placeholder="Ex.: Por que vender mais pode piorar seu caixa?" /></label>
              <label className="full-field">Público<input value={ideaDraft.audience} onChange={(event) => setIdeaDraft({ ...ideaDraft, audience: event.target.value })} placeholder="Para quem é esse conteúdo?" /></label>
              <label>Formato<select value={ideaDraft.format} onChange={(event) => setIdeaDraft({ ...ideaDraft, format: event.target.value })}><option>Reel</option><option>Carrossel</option><option>Stories</option><option>Live</option></select></label>
              <label>Prioridade<select value={ideaDraft.priority} onChange={(event) => setIdeaDraft({ ...ideaDraft, priority: event.target.value })}><option>Alta</option><option>Média</option><option>Baixa</option></select></label>
            </div>
            <button className="primary-button full-button" onClick={addIdea}>Salvar ideia</button>
          </article>
          <article className="panel mini-guide"><span className="eyebrow">FILTRO ESTRATÉGICO</span><h2>Uma boa pauta responde a uma dor real.</h2><p>Priorize ideias que mostrem experiência, tragam uma opinião clara ou resolvam um problema de quem já vende.</p></article>
        </section>
        <section className="ideas-grid">
          {ideas.map((idea) => (
            <article className="idea-card" key={idea.id}>
              <div className="idea-top"><span className={`priority priority-${idea.priority.toLowerCase()}`}>{idea.priority}</span><button className="icon-button danger" onClick={() => removeItem(setIdeas, idea.id)}>×</button></div>
              <h3>{idea.title}</h3><p>{idea.audience}</p><span className="format-chip">{idea.format}</span>
            </article>
          ))}
        </section>
      </>
    );
  }

  function renderTasks() {
    return (
      <>
        <section className="page-heading"><div><span className="eyebrow">PLANEJAMENTO</span><h1>Tarefas</h1><p className="subtitle">Tudo o que precisa acontecer para o conteúdo e a operação andarem.</p></div></section>
        <section className="panel task-page">
          <div className="panel-heading"><div><h2>Tarefas da semana</h2><p>{completedTasks} de {tasks.length} concluídas</p></div><span className="count-badge">{Math.round((completedTasks / Math.max(tasks.length, 1)) * 100)}%</span></div>
          <Progress current={completedTasks} target={Math.max(tasks.length, 1)} />
          <div className="task-list page-list">{tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onOpen={openTask} />)}</div>
        </section>
      </>
    );
  }

  function renderMetrics() {
    const fields = [
      ['seguidores', 'Seguidores'], ['alcance', 'Alcance'], ['visualizacoes', 'Visualizações'],
      ['visitasPerfil', 'Visitas ao perfil'], ['interacoes', 'Interações'], ['leads', 'Leads gerados'],
    ];
    return (
      <>
        <section className="page-heading"><div><span className="eyebrow">ANALYTICS</span><h1>Métricas do Instagram</h1><p className="subtitle">O dashboard usa os dados sincronizados pela Meta quando disponíveis. Estes campos continuam como apoio manual.</p></div></section>
        <section className="metrics-edit-grid">
          {fields.map(([key, label]) => (
            <label className="metric-input-card" key={key}>
              <span>{label}</span>
              <input type="number" min="0" value={metrics[key]} onChange={(event) => setMetrics({ ...metrics, [key]: Number(event.target.value) })} />
              <small>Fallback manual</small>
            </label>
          ))}
        </section>
        <section className="panel instruction-panel"><span className="eyebrow">CONEXÃO</span><h2>Meta conectada ao Hub</h2><p className="note">Quando a API retorna os dados do perfil, a Visão geral prioriza automaticamente os números oficiais.</p></section>
      </>
    );
  }

  function renderGoals() {
    return (
      <>
        <section className="page-heading"><div><span className="eyebrow">ANALYTICS</span><h1>Metas mensais</h1><p className="subtitle">Acompanhe metas ligadas a conteúdo, leads e vendas — não apenas curtidas.</p></div></section>
        <section className="goals-grid">
          {goals.map((goal) => {
            const percent = Math.min(100, Math.round((goal.current / Math.max(goal.target, 1)) * 100));
            return (
              <article className="goal-card" key={goal.id}>
                <div className="goal-top"><div><span>{goal.name}</span><strong>{percent}%</strong></div><span>{goal.current} / {goal.target} {goal.unit}</span></div>
                <Progress current={goal.current} target={goal.target} />
                <div className="goal-inputs">
                  <label>Atual<input type="number" min="0" value={goal.current} onChange={(event) => setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, current: Number(event.target.value) } : item))} /></label>
                  <label>Meta<input type="number" min="1" value={goal.target} onChange={(event) => setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, target: Number(event.target.value) } : item))} /></label>
                </div>
              </article>
            );
          })}
        </section>
        <section className="panel insight-panel small-insight"><span className="eyebrow">IMPORTANTE</span><h2>Visualização é diagnóstico. Venda é resultado.</h2><p>O painel conecta conteúdo com leads, conversas comerciais e produtos do Gui.</p></section>
      </>
    );
  }

  const content = {
    dashboard: renderDashboard,
    calendar: renderCalendar,
    tasks: renderTasks,
    ideas: renderIdeas,
    metrics: renderMetrics,
    goals: renderGoals,
  }[active];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">GN</div>
          <div><strong>GUI SOCIAL HUB</strong><span>Central estratégica</span></div>
        </div>

        <nav className="sidebar-nav" aria-label="Áreas do Hub">
          {navGroups.map((group) => (
            <div className="sidebar-group" key={group.label}>
              <span className="sidebar-group-label">{group.label}</span>
              {group.items.map((item) => item.type === 'link' ? (
                <Link key={item.href} href={item.href} className="sidebar-nav-link" onClick={() => setMobileMenu(false)}>
                  <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
                </Link>
              ) : (
                <button key={item.id} type="button" className={active === item.id ? 'active' : ''} onClick={() => goTo(item.id)}>
                  <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-dot">J</div>
          <div><strong>Juliany</strong><span>Social media</span></div>
        </div>
      </aside>

      {mobileMenu && <button className="menu-overlay" onClick={() => setMobileMenu(false)} aria-label="Fechar menu" />}

      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menu">☰</button>
          <div className="account-pill workspace-current">
            <span className="instagram-dot">GN</span>
            <div><strong>Gui Nonato</strong><span>@gui_nonato · Instagram</span></div>
          </div>
          <span className="workspace-status"><i /> Meta conectada</span>
        </header>
        <div className="page-content">{content()}</div>
      </main>

      {detailItem && (
        <DetailDialog
          item={detailItem}
          kind={selectedDetail.kind}
          relatedPosts={relatedPosts}
          onOpenPost={(id) => setDetailPath((path) => [...path, { kind: 'post', id }])}
          onClose={() => setDetailPath([])}
          onBack={detailPath.length > 1 ? () => setDetailPath((path) => path.slice(0, -1)) : null}
          onToggleTask={toggleTask}
        />
      )}
    </div>
  );
}
