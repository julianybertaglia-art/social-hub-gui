'use client';

import { useEffect, useState } from 'react';
import styles from './contas.module.css';

function number(value) {
  return new Intl.NumberFormat('pt-BR', { notation: Number(value || 0) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value || 0));
}

export default function ContasPage() {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    fetch('/api/instagram/profile', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setProfile(data))
      .catch(() => {});

    fetch('/api/instagram/content-performance', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setPosts(Array.isArray(data?.items) ? data.items.slice(0, 6) : []))
      .catch(() => {});
  }, []);

  const username = profile?.username || 'gui_nonato';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>INSTAGRAM</span>
        <h1>Seu perfil na Lynna</h1>
        <p>Uma prévia rápida da conta ativa e dos conteúdos mais recentes.</p>
      </header>

      <section className={styles.profileCard}>
        <div className={styles.profileMain}>
          <div className={styles.profileHeader}>
            {profile?.profilePictureUrl ? <img className={styles.avatar} src={profile.profilePictureUrl} alt="Foto do perfil" /> : <div className={styles.avatarFallback}>GN</div>}
            <div className={styles.identity}>
              <strong>{profile?.name || 'Gui Nonato'}</strong>
              <span>@{username}</span>
              <span className={styles.connectedBadge}>Conectado à Meta</span>
            </div>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}><strong>{profile ? number(profile.followersCount) : '—'}</strong><span>seguidores</span></div>
            <div className={styles.stat}><strong>{profile ? number(profile.mediaCount) : '—'}</strong><span>publicações</span></div>
            <div className={styles.stat}><strong>{posts.length || '—'}</strong><span>na prévia</span></div>
          </div>

          <div className={styles.profileMeta}>
            <p>Dados da conta profissional conectada à Lynna.</p>
            <a className={styles.profileLink} href={`https://www.instagram.com/${username}/`} target="_blank" rel="noreferrer">Abrir no Instagram ↗</a>
          </div>
        </div>

        <aside className={styles.previewSide}>
          <div className={styles.previewHeading}>
            <div><strong>Prévia do perfil</strong><span>Últimos conteúdos</span></div>
            <small>@{username}</small>
          </div>
          <div className={styles.feed}>
            {Array.from({ length: 6 }).map((_, index) => {
              const post = posts[index];
              const imageUrl = post?.thumbnailUrl || post?.mediaUrl;
              return post && imageUrl ? (
                <a className={styles.post} href={post.permalink || '#'} target="_blank" rel="noreferrer" key={post.id}>
                  <img src={imageUrl} alt={post.caption ? post.caption.slice(0, 70) : 'Conteúdo do Instagram'} />
                </a>
              ) : <div className={styles.postPlaceholder} key={post?.id || index}>Post</div>;
            })}
          </div>
        </aside>
      </section>
    </main>
  );
}
