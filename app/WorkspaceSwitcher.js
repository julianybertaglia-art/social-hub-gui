'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from './CloudGate';
import styles from './workspace-switcher.module.css';

export const WORKSPACES = [
  { id: 'gui-nonato', name: 'Gui Nonato', handle: '@gui_nonato', platform: 'Instagram', initials: 'GN', connected: true },
  { id: 'vital-decor', name: 'Vital Decor', handle: '@vitaldecor_', platform: 'Instagram', initials: 'VD', connected: false },
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

export function useVitalConnectionStatus() {
  const [result, setResult] = useState({ loading: true, instagram: null, whatsapp: null, error: '' });
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        if (!supabase) throw new Error('Supabase indisponível');
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session?.access_token) throw new Error('Entre no TidePlace');
        const response = await fetch('/api/vital-connections', {
          cache: 'no-store',
          headers: { Authorization: 'Bearer ' + data.session.access_token },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Não foi possível verificar a conexão');
        const connections = payload.connections || [];
        if (active) setResult({
          loading: false,
          instagram: connections.some((item) => item.platform === 'instagram' && item.connected),
          whatsapp: connections.some((item) => item.platform === 'whatsapp' && item.connected),
          error: '',
        });
      } catch (error) {
        if (active) setResult({ loading: false, instagram: null, whatsapp: null, error: error.message });
      }
    }
    void check();
    return () => { active = false; };
  }, []);
  return result;
}

export default function WorkspaceSwitcher() {
  const [workspace, setWorkspace] = useWorkspace();
  const [open, setOpen] = useState(false);
  const vital = useVitalConnectionStatus();
  const currentConnected = workspace.id === 'gui-nonato' ? true : vital.instagram === true && vital.whatsapp === true;
  const [guiProfile, setGuiProfile] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/instagram/profile', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || !data?.profilePictureUrl) return;
        setGuiProfile(data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

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
        <span className={styles.avatar}>
          {workspace.id === 'gui-nonato' && guiProfile?.profilePictureUrl ? (
            <img src={guiProfile.profilePictureUrl} alt="" />
          ) : (
            workspace.initials
          )}
        </span>
        <span className={styles.triggerCopy}>
          <strong>{workspace.name}</strong>
          <span>{workspace.handle} · {workspace.platform}</span>
        </span>
        <span className={`${styles.connectionDot} ${currentConnected ? styles.connected : styles.pending}`} />
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
              const connected = item.id === 'gui-nonato' ? true : vital.instagram === true && vital.whatsapp === true;
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
                  <span className={styles.optionAvatar}>
                    {item.id === 'gui-nonato' && guiProfile?.profilePictureUrl ? (
                      <img src={guiProfile.profilePictureUrl} alt="" />
                    ) : (
                      item.initials
                    )}
                  </span>
                  <span className={styles.optionCopy}>
                    <strong>{item.name}</strong>
                    <span>{item.handle}</span>
                  </span>
                  <span className={connected ? styles.statusOk : styles.statusPending}>
                    {connected ? 'Conectada' : item.id === 'vital-decor' && vital.loading ? 'Verificando' : item.id === 'vital-decor' && vital.instagram === true ? 'Parcial' : 'Verificar'}
                  </span>
                  {selected && <span className={styles.check}>✓</span>}
                </button>
              );
            })}
          </div>

          <div className={styles.menuFooter}>
            Cada conta mantém calendário, tarefas, ideias e métricas separadas.
            <Link href="/conexoes/vital-decor" onClick={() => setOpen(false)} style={{ display: 'block', marginTop: 10, textDecoration: 'underline' }}>Gerenciar conexões da Vital Decor →</Link>
          </div>
        </div>
      )}
    </div>
  );
}