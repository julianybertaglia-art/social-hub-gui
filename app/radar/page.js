'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspace } from '../WorkspaceSwitcher';
import styles from './radar.module.css';

function RadarContents() {
  const [workspace] = useWorkspace();
  const search = useSearchParams();
  const selected = search.get('aba');
  const tab = selected === 'ideas' || selected === 'em-alta' ? selected : 'feed';
  const url = '/previa-radar.html?embed=1&marca=' + encodeURIComponent(workspace.id) + '&aba=' + encodeURIComponent(tab);
  const tabs = [
    { id: 'feed', label: 'Explorar referências' },
    { id: 'em-alta', label: 'Em alta' },
    { id: 'ideas', label: 'Ideias salvas' },
  ];
  return (
    <main className={styles.surface}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>CRIAÇÃO DE CONTEÚDO · {workspace.name}</span>
          <h1>Radar de conteúdo</h1>
          <p>Inspirações e pesquisas do nicho em um só lugar, sem sair do TidePlace.</p>
        </div>
        <Link href="/criar-post" className={styles.primary}>+ Criar post</Link>
      </div>
      <nav className={styles.tabs} aria-label="Explorar radar de conteúdo">
        {tabs.map(item => <Link key={item.id} href={'/radar?aba=' + item.id} aria-current={tab === item.id ? 'page' : undefined} className={tab === item.id ? styles.selected : ''}>{item.label}</Link>)}
      </nav>
      <iframe key={url} title={'Radar de conteúdo de ' + workspace.name} src={url} className={styles.frame} />
      <p className={styles.help}>As referências têm a data da última pesquisa identificada. Não são tendências em tempo real.</p>
    </main>
  );
}
export default function RadarPage() {
  return <Suspense fallback={<p>Carregando o Radar de conteúdo…</p>}><RadarContents /></Suspense>;
}
