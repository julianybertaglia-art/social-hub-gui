'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './instagram-account-evidence.module.css';

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', { notation: Number(value || 0) >= 10000 ? 'compact' : 'standard' }).format(Number(value || 0));
}

export default function InstagramAccountEvidence() {
  const pathname = usePathname();
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState({});

  useEffect(() => {
    if (pathname !== '/') return;

    Promise.all([
      fetch('/api/instagram/profile', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/instagram', { cache: 'no-store' }).then((response) => response.json()),
    ]).then(([profileData, metricsData]) => {
      if (!profileData?.error) setProfile(profileData);
      if (metricsData?.metrics) setMetrics(metricsData.metrics);
    }).catch(() => {});
  }, [pathname]);

  if (pathname !== '/') return null;

  const username = profile?.username || 'gui_nonato';

  return (
    <aside className={styles.card} aria-label="Instagram profissional conectado">
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
        <span className={styles.badge}><i /> Conectado à Meta</span>
      </div>

      <div className={styles.status}>Conta profissional conectada · dados sincronizados pela API oficial da Meta</div>

      <div className={styles.metrics}>
        <div><span>Seguidores</span><strong>{formatNumber(profile?.followersCount || metrics.seguidores)}</strong></div>
        <div><span>Alcance 30d</span><strong>{formatNumber(metrics.alcance)}</strong></div>
        <div><span>Visualizações 30d</span><strong>{formatNumber(metrics.visualizacoes)}</strong></div>
        <div><span>Visitas ao perfil</span><strong>{formatNumber(metrics.visitasPerfil)}</strong></div>
      </div>
    </aside>
  );
}
