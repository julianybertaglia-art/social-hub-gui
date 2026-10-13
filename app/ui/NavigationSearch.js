'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { searchNavigation } from './navigation';
import styles from './navigation-search.module.css';

export default function NavigationSearch({ workspaceId, pathname, onSectionChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const results = searchNavigation(query, workspaceId);

  useEffect(() => {
    function onShortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery('');
      setSelected(0);
    }
  }, [open]);

  function pick(item, event) {
    if (pathname === '/' && item.section && onSectionChange) {
      event.preventDefault();
      onSectionChange(item.section);
    }
    setOpen(false);
  }

  function onInputKey(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((value) => (value + 1) % Math.max(1, results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((value) => (value - 1 + results.length) % Math.max(1, results.length));
    } else if (event.key === 'Enter' && results.length > 0) {
      event.preventDefault();
      const item = results[Math.min(selected, results.length - 1)];
      const synthetic = { preventDefault() {} };
      if (pathname === '/' && item.section) {
        pick(item, synthetic);
      } else {
        window.location.assign(item.href);
      }
    }
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label="Buscar ferramentas e páginas">
        <Icon name="search" size={16} />
        <span>Buscar ferramentas</span>
        <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Buscar no TidePlace">
            <div className={styles.searchRow}>
              <Icon name="search" size={20} />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
                onKeyDown={onInputKey}
                placeholder="Para onde você quer ir?"
                aria-label="Buscar uma página ou ferramenta"
              />
              <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Fechar busca"><Icon name="close" size={16} /></button>
            </div>
            <div className={styles.results}>
              {!results.length ? <p className={styles.empty}>Nenhuma ferramenta encontrada.</p> : results.map((item, index) => (
                <Link
                  href={item.href}
                  key={item.href}
                  className={styles.result + (selected === index ? ' ' + styles.selected : '')}
                  onMouseEnter={() => setSelected(index)}
                  onClick={(event) => pick(item, event)}
                >
                  <span className={styles.resultIcon}><Icon name={item.icon} size={17} /></span>
                  <span className={styles.resultCopy}><strong>{item.label}</strong><small>{item.description}</small></span>
                  <Icon name="arrowRight" size={16} />
                </Link>
              ))}
            </div>
            <footer className={styles.footer}>Buscando em {workspaceId === 'vital-decor' ? 'Vital Decor' : 'Gui Nonato'} · Use ↑ ↓ e Enter para navegar</footer>
          </div>
        </div>
      )}
    </>
  );
}
