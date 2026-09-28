'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './workspace-switcher.module.css';

export const WORKSPACES = [
  { id: 'gui-nonato', name: 'Gui Nonato', handle: '@gui_nonato', platform: 'Instagram', initials: 'GN', connected: true },
  { id: 'vital-decor', name: 'Vital Decor', handle: '@vitaldecor', platform: 'Instagram', initials: 'VD', connected: false },
];

export function getWorkspaceStorageKey(baseKey, workspaceId) {
  return workspaceId === 'gui-nonato' ? baseKey : `${baseKey}:${workspaceId}`;
}

function getWorkspaceById(id) {
  return WORKSPACES.find((item) => item.id === id) || WORKSPACES[0];
}

export function useWorkspace() {
  const [workspace, setWorkspaceState] = useState(WORKSPACES[0]);

  useEffect(() => {
    function readWorkspace(event) {
      if (event?.key && event.key !== 'tideplace-workspace') return;
      const explicitId = event?.detail?.id;
      const storedId = explicitId || window.localStorage.getItem('tideplace-workspace') || 'gui-nonato';
      setWorkspaceState(getWorkspaceById(storedId));
    }

    readWorkspace();
    window.addEventListener('tideplace:workspace-change', readWorkspace);
    window.addEventListener('storage', readWorkspace);

    return () => {
      window.removeEventListener('tideplace:workspace-change', readWorkspace);
      window.removeEventListener('storage', readWorkspace);
    };
  }, []);

  function setWorkspace(id) {
    const next = getWorkspaceById(id);
    window.localStorage.setItem('tideplace-workspace', next.id);
    setWorkspaceState(next);
    window.dispatchEvent(new CustomEvent('tideplace:workspace-change', { detail: { id: next.id } }));
  }

  return [workspace, setWorkspace];
}

export default function WorkspaceSwitcher() {
  const [workspace, setWorkspace] = useWorkspace();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.avatar}>{workspace.initials}</span>
        <span className={styles.triggerCopy}>
          <strong>{workspace.name}</strong>
          <span>{workspace.handle} · {workspace.platform}</span>
        </span>
        <span className={`${styles.connectionDot} ${workspace.connected ? styles.connected : styles.pending}`} />
        <span className={styles.chevron}>{open ? '⌃' : '⌄'}</span>
      </button>

      {open && (
        <div className={styles.menu} role="listbox" aria-label="Trocar conta">
          <div className={styles.menuHeading}>
            <span>CONTAS</span>
            <strong>Trocar workspace</strong>
          </div>

          <div className={styles.options}>
            {WORKSPACES.map((item) => {
              const selected = item.id === workspace.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.option} ${selected ? styles.selected : ''}`}
                  onClick={() => {
                    setWorkspace(item.id);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={selected}
                >
                  <span className={styles.optionAvatar}>{item.initials}</span>
                  <span className={styles.optionCopy}>
                    <strong>{item.name}</strong>
                    <span>{item.handle}</span>
                  </span>
                  <span className={item.connected ? styles.statusOk : styles.statusPending}>
                    {item.connected ? 'Conectada' : 'Configurar'}
                  </span>
                  {selected && <span className={styles.check}>✓</span>}
                </button>
              );
            })}
          </div>

          <div className={styles.menuFooter}>
            Cada conta mantém calendário, tarefas, ideias e métricas separadas.
          </div>
        </div>
      )}
    </div>
  );
}