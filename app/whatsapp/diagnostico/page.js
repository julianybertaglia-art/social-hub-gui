'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import styles from '../whatsapp.module.css';

function yesNo(value) {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  return '—';
}

export default function WhatsAppDiagnosticPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/whatsapp/diagnostics', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível consultar a conexão.');
      setData(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const phone = data?.phone;
  const coexistence = data?.coexistence;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/whatsapp" className={styles.back}>← Voltar para o WhatsApp</Link>
          <span className={styles.eyebrow}>DIAGNÓSTICO SEGURO</span>
          <h1>Conexão WhatsApp</h1>
          <p>Consulta o estado real da Meta sem mostrar tokens ou segredos.</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{ border: 0, borderRadius: 12, padding: '12px 16px', fontWeight: 800, cursor: 'pointer' }}
        >
          {loading ? 'Consultando...' : 'Atualizar'}
        </button>
      </header>

      {error && <div className={styles.notice}>{error}</div>}

      <section className={styles.setupCard}>
        <div>
          <span className={styles.eyebrow}>COEXISTÊNCIA</span>
          <h2>{coexistence?.ready ? 'Pronto para usar no Hub' : 'Ainda há uma etapa pendente na Meta'}</h2>
          <p>{coexistence?.reason || 'Consultando o estado do número...'}</p>
        </div>
        <div className={styles.setupGrid}>
          <div><span>WhatsApp Business App</span><code>{yesNo(phone?.isOnBizApp)}</code></div>
          <div><span>Plataforma</span><code>{phone?.platformType || '—'}</code></div>
          <div><span>Status</span><code>{phone?.status || '—'}</code></div>
          <div><span>Verificação do código</span><code>{phone?.codeVerificationStatus || '—'}</code></div>
        </div>
      </section>

      <section className={styles.workspace} style={{ minHeight: 0, display: 'block', padding: 24 }}>
        <span className={styles.eyebrow}>NÚMERO</span>
        <h2 style={{ marginTop: 8 }}>{phone?.verifiedName || 'WhatsApp ainda não consultado'}</h2>
        <p>{phone?.displayPhoneNumber || '—'}</p>

        <div className={styles.setupGrid} style={{ marginTop: 20 }}>
          <div><span>Token no servidor</span><code>{yesNo(data?.checks?.accessToken)}</code></div>
          <div><span>Phone Number ID</span><code>{yesNo(data?.checks?.phoneNumberId)}</code></div>
          <div><span>Webhook Verify Token</span><code>{yesNo(data?.checks?.verifyToken)}</code></div>
          <div><span>App Secret</span><code>{yesNo(data?.checks?.appSecret)}</code></div>
          <div><span>WABA ID no servidor</span><code>{yesNo(data?.checks?.wabaId)}</code></div>
          <div><span>Apps inscritos na WABA</span><code>{Array.isArray(data?.subscriptions) ? data.subscriptions.length : '—'}</code></div>
        </div>

        {Array.isArray(data?.errors) && data.errors.length > 0 && (
          <div className={styles.notice} style={{ marginTop: 20 }}>
            {data.errors.map((item) => `${item.scope}: ${item.message}`).join(' · ')}
          </div>
        )}
      </section>
    </main>
  );
}
