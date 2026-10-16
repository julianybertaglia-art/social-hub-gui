'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './instagram-account-evidence.module.css';
import Link from 'next/link';
import { hasVerifiedGuiConnection } from './lib/gui-instagram-connection.mjs';

function formatNumber(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR', { notation: Number(value) >= 10000 ? 'compact' : 'standard' }).format(Number(value));
}

export default function InstagramAccountEvidence() {
  const pathname = usePathname();
  const [profile, setProfile] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [metrics, setMetrics] = useState({});

  useEffect(() => {
    if (pathname !== '/') return undefined;
    let active = true;

    async function refresh() {
      const [profileResult, metricsResult] = await Promise.allSettled([
        fetch('/api/instagram/profile', { cache: 'no-store' }).then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error('Meta não confirmou o perfil');
          return payload;
        }),
        fetch('/api/instagram', { cache: 'no-store' }).then((response) => response.json()),
      ]);
      if (!active) return;

      const profileData = profileResult.status === 'fulfilled' ? profileResult.value : null;
      const confirmed = hasVerifiedGuiConnection(profileData);
      setProfile(confirmed ? profileData : null);
      setConnectionStatus(confirmed ? 'connected' : 'unverified');
      const metricsData = metricsResult.status === 'fulfilled' ? metricsResult.value : null;
      setMetrics(metricsData?.metrics || {});
    }

    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 3 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pathname]);

  if (pathname !== '/') return null;

  const username = profile?.username || 'gui_nonato';

  return (
    <aside className={styles.card} aria-label="Status do Instagram profissional do Gui">
      <div className={styles.topRow}>
        <div className={styles.identity}>
          {profile?.profilePictureUrl ? (
            <img className={styles.avatar} src={profile.profilePictureUrl} alt={`Foto de @${username}`} />
          ) : (
            <div className={styles.avatarFallback}>GN</div>
          )}
          <div>
            <span className={styles.kicker}>INSTAGRAM BUSINESS</span>
            <strong className={styles.name}>{profile?.name || 'Gui Nonato'}</strong>
            <span className={styles.username}>@{username}</span>
          </div>
        </div>
        <span className={connectionStatus === 'connected' ? styles.badge : styles.badge + ' ' + styles.badgePending}><i />{connectionStatus === 'connected' ? 'Conectado à Meta' : connectionStatus === 'checking' ? 'Verificando...' : 'Não verificada'}</span>
      </div>

      <div className={styles.status}>
        {connectionStatus === 'connected'
          ? 'Conta profissional verificada pela API oficial da Meta.'
          : connectionStatus === 'checking'
            ? 'Verificando autenticação do Instagram na Meta...'
            : 'Não foi possível confirmar a autenticação agora. Isso não significa necessariamente desconexão.'}
        {connectionStatus === 'unverified' && (
          <Link className={styles.detailsLink} href="/admin/conexoes">Abrir diagnóstico →</Link>
        )}
      </div>

      <div className={styles.metrics}>
        <div><span>Seguidores</span><strong>{formatNumber(profile?.followersCount ?? metrics.seguidores)}</strong></div>
        <div><span>Alcance 30d</span><strong>{formatNumber(metrics.alcance)}</strong></div>
        <div><span>Visualizações 30d</span><strong>{formatNumber(metrics.visualizacoes)}</strong></div>
        <div><span>Visitas ao perfil</span><strong>{formatNumber(metrics.visitasPerfil)}</strong></div>
      </div>
    </aside>
  );
}
