'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function normalizeLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  const parts = text.split(/[|;,\t]/).map((item) => item.trim()).filter(Boolean);
  const phoneCandidate = [...parts].reverse().find((item) => /\d/.test(item)) || text;
  const digits = phoneCandidate.replace(/\D/g, '');
  if (!digits) return null;
  return digits;
}

export default function WhatsAppGroupsPage() {
  const [status, setStatus] = useState(null);
  const [subject, setSubject] = useState('Imersão Ecommerce | 26/09');
  const [participantsText, setParticipantsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(null);

  const participants = useMemo(() => {
    return [...new Set(
      participantsText
        .split(/\r?\n/)
        .map(normalizeLine)
        .filter(Boolean)
    )];
  }, [participantsText]);

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/whatsapp/bridge', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    setStatus(data);
    return data;
  }, []);

  useEffect(() => {
    loadStatus().catch((error) => setNotice(error.message));
    const timer = setInterval(() => loadStatus().catch(() => {}), 3500);
    return () => clearInterval(timer);
  }, [loadStatus]);

  async function bridgeAction(action) {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/whatsapp/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Não foi possível controlar a conexão.');
      setStatus(data);
      await loadStatus();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createGroup(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setResult(null);
    try {
      if (!status?.connected) throw new Error('Conecte o WhatsApp para grupos antes de criar o grupo.');
      if (!subject.trim()) throw new Error('Informe o nome do grupo.');
      if (!participants.length) throw new Error('Cole pelo menos um telefone.');

      const response = await fetch('/api/whatsapp/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), participants }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Não foi possível criar o grupo.');
      setResult(data.group || data);
      setNotice('Grupo criado.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  const page = {minHeight:'calc(100vh - 72px)',background:'#f4f3ef',padding:'24px',color:'#171714'};
  const wrap = {maxWidth:980,margin:'0 auto',display:'grid',gap:16};
  const card = {background:'#fff',border:'1px solid #dedbd2',borderRadius:16,padding:20,boxShadow:'0 10px 28px rgba(30,27,21,.05)'};
  const label = {display:'grid',gap:6,fontSize:12,fontWeight:800,color:'#625f57'};
  const field = {width:'100%',border:'1px solid #d8d4c8',borderRadius:10,padding:'11px 12px',font:'inherit',background:'#fff'};
  const button = {border:0,borderRadius:10,background:'#171714',color:'#fff',padding:'11px 15px',fontWeight:900,cursor:'pointer'};
  const secondary = {...button,background:'#ece8dd',color:'#171714'};
  const badge = {display:'inline-flex',alignItems:'center',gap:7,borderRadius:999,padding:'8px 11px',fontSize:12,fontWeight:900,background:status?.connected?'#e2f3e7':'#f4eee0',color:status?.connected?'#246b3f':'#775f23'};

  return (
    <main style={page}>
      <div style={wrap}>
        <header>
          <h1 style={{margin:'0 0 6px',fontSize:34,fontFamily:"Georgia, 'Times New Roman', serif",fontWeight:500}}>Grupos do WhatsApp</h1>
          <p style={{margin:0,color:'#77746d',fontSize:13}}>A conexão oficial da Meta continua cuidando das conversas. Esta conexão auxiliar é usada somente para criar e administrar grupos.</p>
        </header>

        {notice && <div style={{...card,padding:'12px 14px',background:'#fff7df',borderColor:'#eadfb7',fontSize:12,fontWeight:800}}>{notice}</div>}

        <section style={card}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
            <div>
              <div style={badge}>{status?.connected ? '● Conectado para grupos' : '○ Grupos desconectados'}</div>
              <p style={{margin:'10px 0 0',fontSize:12,color:'#77746d'}}>Se a sessão antiga ainda estiver válida, ela reconecta sozinha. Se aparecer QR Code, escaneie uma única vez como aparelho conectado.</p>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {!status?.connected && <button style={button} disabled={busy} onClick={() => bridgeAction('connect')}>{busy?'Aguarde...':'Conectar'}</button>}
              <button style={secondary} disabled={busy} onClick={() => bridgeAction('relink')}>Gerar novo QR</button>
            </div>
          </div>

          {status?.qrDataUrl && (
            <div style={{display:'flex',gap:18,alignItems:'center',marginTop:18,flexWrap:'wrap'}}>
              <img src={status.qrDataUrl} alt="QR Code do WhatsApp para grupos" style={{width:220,height:220,borderRadius:12,border:'1px solid #ddd'}} />
              <div style={{maxWidth:420,fontSize:13,lineHeight:1.5,color:'#625f57'}}>
                <strong style={{display:'block',color:'#171714',marginBottom:6}}>No WhatsApp do celular:</strong>
                Configurações → Aparelhos conectados → Conectar um aparelho. A conexão fica separada da API oficial da Meta e serve somente para recursos de grupo.
              </div>
            </div>
          )}
        </section>

        <form style={card} onSubmit={createGroup}>
          <h2 style={{margin:'0 0 16px',fontSize:22}}>Criar novo grupo</h2>
          <div style={{display:'grid',gap:14}}>
            <label style={label}>
              Nome do grupo
              <input style={field} value={subject} onChange={(e)=>setSubject(e.target.value)} maxLength={100} />
            </label>

            <label style={label}>
              Participantes
              <textarea
                style={{...field,minHeight:250,resize:'vertical',lineHeight:1.5}}
                value={participantsText}
                onChange={(e)=>setParticipantsText(e.target.value)}
                placeholder={'Cole um por linha. Pode ser só o telefone ou: Nome | telefone\nEx.: Gustavo | 11999999999'}
              />
              <span style={{fontWeight:500,color:'#8a867d'}}>{participants.length} telefone(s) reconhecido(s). Números brasileiros sem +55 são completados automaticamente.</span>
            </label>

            <button style={button} disabled={busy || !status?.connected || !participants.length}>
              {busy ? 'Criando...' : 'Criar grupo no WhatsApp'}
            </button>
          </div>
        </form>

        {result && (
          <section style={{...card,borderColor:'#bedcc6',background:'#f5fbf6'}}>
            <h2 style={{margin:'0 0 8px',fontSize:20}}>Grupo criado</h2>
            <p style={{margin:'0 0 8px',fontSize:13}}><strong>{result.name || subject}</strong></p>
            <p style={{margin:'0 0 12px',fontSize:12,color:'#625f57'}}>Telefones válidos enviados: {result.validParticipants ?? participants.length}</p>
            {result.inviteUrl && <a href={result.inviteUrl} target="_blank" rel="noreferrer" style={{fontWeight:900,color:'#245f38'}}>Abrir link de convite do grupo</a>}
          </section>
        )}

        <section style={{...card,background:'#171714',color:'#fff'}}>
          <strong style={{display:'block',marginBottom:6}}>Importante</strong>
          <p style={{margin:0,color:'#cbc7bd',fontSize:12,lineHeight:1.55}}>A API oficial da Meta continua sendo a conexão principal do Hub. O módulo de grupos usa uma sessão auxiliar de aparelho conectado porque o grupo da Imersão tem mais participantes do que o recurso oficial de grupos da Meta suporta atualmente.</p>
        </section>
      </div>
    </main>
  );
}
