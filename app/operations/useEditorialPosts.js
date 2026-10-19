'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './useOperations';
import { validateLegacyPosts } from '../lib/editorial-calendar.mjs';

export default function useEditorialPosts(workspace) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [synced, setSynced] = useState(false);
  const alive = useRef(false), busy = useRef(false), requestVersion = useRef(0), initialLoad = useRef(true);

  const refresh = useCallback(async (initialize = false) => {
    if (busy.current) return;
    const version = ++requestVersion.current;
    if (initialize) { initialLoad.current = true; setLoading(true); }
    try {
      let result, warning = '';
      if (initialize) {
        const key = workspace === 'gui-nonato' ? 'guihub-posts' : `guihub-posts:${workspace}`;
        let legacyPosts;
        try {
          const raw = window.localStorage.getItem(key);
          if (raw !== null) legacyPosts = validateLegacyPosts(JSON.parse(raw));
        } catch {
          warning = 'A cópia antiga deste navegador precisa de revisão e foi preservada. O calendário da sua conta está disponível abaixo.';
        }
        result = await api('/api/editorial', { method: 'POST', body: JSON.stringify({ action: 'initialize', workspace, legacyPosts }) });
      } else result = await api('/api/editorial?workspace=' + encodeURIComponent(workspace));
      if (alive.current && version === requestVersion.current) {
        setPosts(result.posts); setError(warning); setSynced(true);
      }
    } catch (e) {
      if (alive.current && version === requestVersion.current) { setError(e.message); setSynced(false); }
    } finally {
      if (alive.current && version === requestVersion.current) { initialLoad.current = false; setLoading(false); }
    }
  }, [workspace]);

  useEffect(() => {
    alive.current = true;
    void refresh(true);
    const onFocus = () => { if (!initialLoad.current && document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    const timer = window.setInterval(onFocus, 30000);
    return () => {
      alive.current = false;
      ++requestVersion.current;
      window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const mutate = useCallback(async (method, body) => {
    if (busy.current || loading || !synced) return false;
    busy.current = true; ++requestVersion.current; setSaving(true); setError('');
    try {
      const result = await api('/api/editorial', { method, body: JSON.stringify({ workspace, ...body }) });
      if (alive.current) {
        setPosts(current => method === 'DELETE' ? current.filter(p => String(p.id) !== String(body.id))
          : method === 'POST' ? [...current, result.post]
            : current.map(p => String(p.id) === String(result.post.id) ? result.post : p));
      }
      return true;
    } catch (e) {
      if (alive.current) setError(e.message);
      return false;
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }, [workspace, loading, synced]);

  return {
    posts, loading, saving, error, synced,
    refresh: () => refresh(true),
    createPost: post => mutate('POST', { action: 'create', post }),
    updatePost: (post, patch) => mutate('PATCH', { id: post.id, revision: post._revision, patch }),
    removePost: post => mutate('DELETE', { id: post.id, revision: post._revision }),
  };
}
