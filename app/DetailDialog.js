'use client';

import { useEffect, useRef, useState } from 'react';

const sections = [
  { id: 'summary', label: 'Resumo' },
  { id: 'script', label: 'Roteiro' },
  { id: 'production', label: 'Gravação e edição' },
  { id: 'publication', label: 'Publicação' },
];

function List({ title, items, ordered = false }) {
  if (!items?.length) return null;
  const Tag = ordered ? 'ol' : 'ul';
  return <section className="brief-section"><h3>{title}</h3><Tag className={ordered ? 'brief-steps' : 'brief-list'}>{items.map((text, index) => <li key={index}>{text}</li>)}</Tag></section>;
}

function CopyBlock({ title, text }) {
  const [feedback, setFeedback] = useState('');
  useEffect(() => { setFeedback(''); }, [text]);
  if (!text) return null;

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setFeedback('Copiado!');
    } catch {
      setFeedback('Selecione o texto abaixo para copiar.');
    }
  }

  return <section className="brief-section"><div className="brief-section-heading"><h3>{title}</h3><button type="button" className="text-button" onClick={copy} aria-label={`Copiar ${title.toLowerCase()}`}>Copiar</button></div><p className="brief-copy">{text}</p><span className="brief-copy-feedback" role="status">{feedback}</span></section>;
}

function Scenes({ scenes }) {
  if (!scenes?.length) return null;
  return <section className="brief-section"><h3>Cena por cena</h3><ol className="brief-scenes">{scenes.map((scene, index) => <li key={index}><span className="brief-scene-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{scene.label || `Cena ${index + 1}`}</strong><p>{scene.text}</p></div></li>)}</ol></section>;
}

export default function DetailDialog({ item, kind, relatedPosts, onOpenPost, onClose, onBack, onToggleTask }) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const contentRef = useRef(null);
  const [activeSection, setActiveSection] = useState('summary');
  const isTask = kind === 'task';
  const brief = item.brief || {};
  const title = isTask ? item.text : item.title;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    setActiveSection('summary');
    if (contentRef.current) contentRef.current.scrollTop = 0;
    titleRef.current?.focus();
  }, [item.id, kind]);

  function closeOnBackdrop(event) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }

  const facts = isTask
    ? [['Prazo', item.dueDate ? item.dueDate.split('-').reverse().join('/') : 'Sem data definida'], ['Tempo estimado', brief.effort], ['Formato', brief.format], ['Prioridade', item.priority]]
    : [['Formato', brief.format || item.format], ['Duração / tamanho', brief.duration], ['Tela', brief.ratio], ['Publicação', [item.date, item.time].filter(Boolean).join(' · ')]];

  return (
    <dialog ref={dialogRef} className="detail-dialog" aria-labelledby="detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={closeOnBackdrop}>
      <div className="detail-shell">
        <header className="detail-header">
          <div className="detail-topline">{onBack ? <button type="button" className="text-button" onClick={onBack}>← Voltar à tarefa</button> : <span className="eyebrow">{isTask ? 'SUA PRÓXIMA AÇÃO' : 'GUIA DO CONTEÚDO'}</span>}<button type="button" className="detail-close" onClick={onClose} aria-label="Fechar detalhes">×</button></div>
          <h2 id="detail-title" ref={titleRef} tabIndex={-1}>{title}</h2>
          <div className="detail-badges"><span className="status-badge">{isTask ? (item.done ? 'Concluída' : 'A fazer') : item.status}</span>{!isTask && item.objective && <span className="format-chip">{item.objective}</span>}{brief.label && <span className="brief-label">{brief.label}</span>}</div>
        </header>

        {!isTask && <nav className="detail-tabs" aria-label="Partes do guia">{sections.map((section) => <button key={section.id} type="button" aria-pressed={activeSection === section.id} onClick={() => { setActiveSection(section.id); if (contentRef.current) contentRef.current.scrollTop = 0; }}>{section.label}</button>)}</nav>}

        <div className="detail-content" ref={contentRef}>
          {(isTask || activeSection === 'summary') && <>
            <p className="brief-lead">{brief.summary || (isTask ? 'Confira a tarefa, acompanhe a prioridade e marque como concluída quando terminar.' : 'Este conteúdo ainda não tem um roteiro detalhado. O formato e a data cadastrados estão abaixo.')}</p>
            <dl className="brief-facts">{facts.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            {brief.reuse && <p className="brief-reuse"><strong>Aproveite o que já existe</strong>{brief.reuse}</p>}
            <List title={isTask ? 'O que fazer' : 'Direção do conteúdo'} items={brief.steps} ordered />
            {brief.audience && <section className="brief-section"><h3>Para quem</h3><p>{brief.audience}</p></section>}
            {brief.note && <p className="brief-note">{brief.note}</p>}
            {isTask && <>
              {!!relatedPosts.length && <section className="brief-section"><h3>Abra o roteiro de cada post</h3><div className="brief-related">{relatedPosts.map((post) => <button type="button" key={post.id} onClick={() => onOpenPost(post.id)}><span><small>{post.format} · {post.date}</small><strong>{post.title}</strong></span><span aria-hidden="true">↗</span></button>)}</div></section>}
              <List title="Pode marcar como concluída quando…" items={brief.checklist} />
            </>}
          </>}

          {!isTask && activeSection === 'script' && <>
            {brief.scriptNote && <p className="brief-note">{brief.scriptNote}</p>}
            <CopyBlock title={brief.scriptTitle || 'Fala do Gui'} text={brief.script} />
            <Scenes scenes={brief.scenes} />
            <List title="Textos na tela" items={brief.onScreenText} />
            {!brief.script && !brief.scenes?.length && <p className="brief-muted">O roteiro deste conteúdo ainda não foi preenchido.</p>}
          </>}

          {!isTask && activeSection === 'production' && <>
            <List title="Como gravar ou montar" items={brief.recording} ordered />
            <List title="Edição simples" items={brief.editing} />
            {brief.reuse && <p className="brief-reuse"><strong>Aproveite o que já existe</strong>{brief.reuse}</p>}
            {!brief.recording?.length && !brief.editing?.length && <p className="brief-muted">As orientações de produção ainda não foram preenchidas.</p>}
          </>}

          {!isTask && activeSection === 'publication' && <>
            <CopyBlock title={brief.captionTitle || 'Legenda pronta'} text={brief.caption} />
            <CopyBlock title="Chamada para ação" text={brief.cta} />
            {brief.adCta && <CopyBlock title="CTA para anúncio" text={brief.adCta} />}
            {brief.destinationUrl && <a className="brief-link" href={brief.destinationUrl} target="_blank" rel="noreferrer">Abrir página da Imersão ↗</a>}
            <List title="Antes de publicar" items={brief.checklist} />
            {brief.publicationNote && <p className="brief-note">{brief.publicationNote}</p>}
            {!brief.caption && !brief.cta && !brief.checklist?.length && <p className="brief-muted">A legenda e o checklist ainda não foram preenchidos.</p>}
          </>}

          {!isTask && brief.alternative && <details className="brief-alternative"><summary>{brief.alternative.title}</summary><p>{brief.alternative.summary}</p><CopyBlock title="Roteiro opcional" text={brief.alternative.script} /><List title="Como aproveitar" items={brief.alternative.steps} /><CopyBlock title="Texto para acompanhar" text={brief.alternative.caption} /></details>}
        </div>

        <footer className="detail-footer"><span>{isTask ? 'O roteiro está nos posts relacionados.' : 'Tudo para produzir este conteúdo.'}</span>{isTask ? <button type="button" className="primary-button" onClick={() => onToggleTask(item.id)}>{item.done ? 'Reabrir tarefa' : 'Marcar como concluída'}</button> : <button type="button" className="secondary-button" onClick={onClose}>Fechar guia</button>}</footer>
      </div>
    </dialog>
  );
}
