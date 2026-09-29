'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../CloudGate';
import styles from './automacoes.module.css';

function uid(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2));
  return prefix + '-' + value;
}

function emptyNode() {
  return {
    id: uid('node'),
    text: '',
    audioPath: '',
    audioName: '',
    responseMode: 'same',
    sharedNext: null,
    buttons: [],
  };
}

function emptyFlow() {
  return {
    id: uid('flow'),
    name: '',
    keyword: '',
    publicReplies: ['', ''],
    start: emptyNode(),
    active: false,
  };
}

const IMPORTACAO_FLOW = {
  id: 'flow-importacao-20260929',
  name: 'Importação',
  keyword: 'IMPORTAÇÃO',
  publicReplies: ['Te mandei as informações no Direct 👊', 'Chamei você no Direct ✨'],
  active: true,
  start: {
    id: 'node-operacao',
    text: 'Oi! 👋 Que bom ter você por aqui.\n\nAntes de te explicar melhor sobre importação, quero entender um pouco do seu momento atual 👇\n\nHoje você já tem uma operação de vendas?',
    audioPath: '',
    audioName: '',
    responseMode: 'same',
    buttons: [
      { id: 'btn-op-sim', label: '✅ Sim, já vendo', next: { id: 'unused-op-1', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
      { id: 'btn-op-comecando', label: '🚀 Começando agora', next: { id: 'unused-op-2', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
      { id: 'btn-op-nao', label: '❌ Ainda não vendo', next: { id: 'unused-op-3', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
    ],
    sharedNext: {
      id: 'node-experiencia',
      text: 'E você já fez alguma importação anteriormente?',
      audioPath: '',
      audioName: '',
      responseMode: 'same',
      buttons: [
        { id: 'btn-exp-sim', label: '✅ Sim, já importei', next: { id: 'unused-exp-1', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
        { id: 'btn-exp-pesquisei', label: '👀 Só pesquisei', next: { id: 'unused-exp-2', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
        { id: 'btn-exp-nunca', label: '❌ Nunca importei', next: { id: 'unused-exp-3', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
      ],
      sharedNext: {
        id: 'node-produto',
        text: 'Hoje você já tem algum produto validado, que vende e que gostaria de importar?',
        audioPath: '',
        audioName: '',
        responseMode: 'same',
        buttons: [
          { id: 'btn-prod-validado', label: '✅ Produto validado', next: { id: 'unused-prod-1', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
          { id: 'btn-prod-mente', label: '🤔 Alguns em mente', next: { id: 'unused-prod-2', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
          { id: 'btn-prod-buscando', label: '🔎 Buscando produto', next: { id: 'unused-prod-3', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
        ],
        sharedNext: {
          id: 'node-investimento',
          text: 'Para eu entender melhor qual caminho faz sentido para você:\n\nQuanto você pretende investir inicialmente em uma importação?',
          audioPath: '',
          audioName: '',
          responseMode: 'same',
          buttons: [
            { id: 'btn-inv-5', label: '💰 Até R$ 5 mil', next: { id: 'unused-inv-1', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
            { id: 'btn-inv-50', label: '💰 Até R$ 50 mil', next: { id: 'unused-inv-2', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
            { id: 'btn-inv-500', label: '💰 Até R$ 500 mil', next: { id: 'unused-inv-3', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
            { id: 'btn-inv-1m', label: '💰 R$ 1 milhão +', next: { id: 'unused-inv-4', text: '', audioPath: '', audioName: '', responseMode: 'same', sharedNext: null, buttons: [] } },
          ],
          sharedNext: {
            id: 'node-whatsapp',
            text: 'Obrigado pelas respostas! 🙌\n\nDeixe seu contato do WhatsApp com DDD por aqui. Em breve nossa equipe entrará em contato com você.',
            audioPath: '',
            audioName: '',
            responseMode: 'same',
            sharedNext: null,
            buttons: [],
          },
        },
      },
    },
  },
};

function updateNodeTree(node, nodeId, updater) {
  if (node.id === nodeId) return updater(node);
  return {
    ...node,
    sharedNext: node.sharedNext ? updateNodeTree(node.sharedNext, nodeId, updater) : null,
    buttons: (node.buttons || []).map((button) => ({
      ...button,
      next: updateNodeTree(button.next, nodeId, updater),
    })),
  };
}

function removeButtonTree(node, nodeId, buttonId) {
  if (node.id === nodeId) {
    return { ...node, buttons: (node.buttons || []).filter((button) => button.id !== buttonId) };
  }
  return {
    ...node,
    sharedNext: node.sharedNext ? removeButtonTree(node.sharedNext, nodeId, buttonId) : null,
    buttons: (node.buttons || []).map((button) => ({
      ...button,
      next: removeButtonTree(button.next, nodeId, buttonId),
    })),
  };
}

async function ownerRequest(path, body) {
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente na TidePlace.');

  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + data.session.access_token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Não foi possível concluir.');
  return payload;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o áudio.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

export default function AutomacoesPage() {
  const [flows, setFlows] = useState([IMPORTACAO_FLOW]);
  const [selectedId, setSelectedId] = useState(IMPORTACAO_FLOW.id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploadingNodeId, setUploadingNodeId] = useState('');

  useEffect(() => {
    let cancelled = false;
    ownerRequest('/api/instagram/flow-automations')
      .then((payload) => {
        if (cancelled) return;
        const serverFlows = Array.isArray(payload.flows) ? payload.flows : [];
        const next = serverFlows.length ? serverFlows : [IMPORTACAO_FLOW];
        setFlows(next);
        setSelectedId(next[0]?.id || IMPORTACAO_FLOW.id);
        try { window.localStorage.setItem('tideplace-instagram-flow-automations', JSON.stringify(next)); } catch {}
      })
      .catch((error) => {
        if (cancelled) return;
        setFlows([IMPORTACAO_FLOW]);
        setSelectedId(IMPORTACAO_FLOW.id);
        setNotice(error.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const selected = flows.find((flow) => flow.id === selectedId) || null;
  const activeCount = useMemo(() => flows.filter((flow) => flow.active).length, [flows]);

  function patchFlow(flowId, patch) {
    setFlows((current) => current.map((flow) => flow.id === flowId ? { ...flow, ...patch } : flow));
  }

  function patchNode(flowId, nodeId, updater) {
    setFlows((current) => current.map((flow) => flow.id === flowId
      ? { ...flow, start: updateNodeTree(flow.start, nodeId, updater) }
      : flow));
  }

  function addFlow() {
    const flow = emptyFlow();
    setFlows((current) => [...current, flow]);
    setSelectedId(flow.id);
    setNotice('');
  }

  function deleteFlow(flowId) {
    const current = flows.find((flow) => flow.id === flowId);
    if (!current) return;
    if (!window.confirm('Excluir "' + (current.name || 'esta automação') + '"?')) return;
    setFlows((items) => items.filter((flow) => flow.id !== flowId));
    if (selectedId === flowId) {
      const remaining = flows.filter((flow) => flow.id !== flowId);
      setSelectedId(remaining[0]?.id || null);
    }
  }

  function addButton(flowId, nodeId) {
    patchNode(flowId, nodeId, (node) => {
      if ((node.buttons || []).length >= 13) return node;
      return {
        ...node,
        responseMode: node.responseMode || 'same',
        sharedNext: node.sharedNext || emptyNode(),
        buttons: [
          ...(node.buttons || []),
          { id: uid('button'), label: '', next: emptyNode() },
        ],
      };
    });
  }

  function setResponseMode(flowId, nodeId, mode) {
    patchNode(flowId, nodeId, (node) => ({
      ...node,
      responseMode: mode,
      sharedNext: mode === 'same'
        ? (node.sharedNext || node.buttons?.[0]?.next || emptyNode())
        : node.sharedNext,
    }));
  }

  function patchButton(flowId, nodeId, buttonId, patch) {
    patchNode(flowId, nodeId, (node) => ({
      ...node,
      buttons: (node.buttons || []).map((button) => button.id === buttonId ? { ...button, ...patch } : button),
    }));
  }

  function removeButton(flowId, nodeId, buttonId) {
    setFlows((current) => current.map((flow) => flow.id === flowId
      ? { ...flow, start: removeButtonTree(flow.start, nodeId, buttonId) }
      : flow));
  }

  async function uploadAudio(flowId, nodeId, file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotice('O áudio precisa ter até 2 MB.');
      return;
    }
    setUploadingNodeId(nodeId);
    setNotice('');
    try {
      const audioBase64 = await readAsDataUrl(file);
      const result = await ownerRequest('/api/instagram/flow-automations', {
        action: 'upload_audio',
        audioBase64,
        fileName: file.name,
      });
      patchNode(flowId, nodeId, (node) => ({
        ...node,
        audioPath: result.audioPath,
        audioName: result.audioName || file.name,
      }));
      setNotice('Áudio adicionado.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setUploadingNodeId('');
    }
  }

  async function saveAll() {
    setSaving(true);
    setNotice('');
    try {
      const payload = await ownerRequest('/api/instagram/flow-automations', { flows });
      const savedFlows = payload.flows || [];
      setFlows(savedFlows);
      try { window.localStorage.setItem('tideplace-instagram-flow-automations', JSON.stringify(savedFlows)); } catch {}
      setNotice('Automações salvas na Meta/TidePlace.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  function renderNode(flow, node, depth = 0, label = 'Resposta') {
    return (
      <div className={styles.node} key={node.id} style={{ '--depth': depth }}>
        <div className={styles.nodeHeader}>
          <div>
            <span className={styles.nodeKicker}>{label}</span>
            <strong>{depth === 0 ? 'Primeiro Direct' : 'Resposta após o clique'}</strong>
          </div>
          {depth > 0 && <span className={styles.depthBadge}>Nível {depth + 1}</span>}
        </div>

        <label className={styles.field}>
          <span>Mensagem</span>
          <textarea
            rows={depth === 0 ? 5 : 4}
            value={node.text || ''}
            onChange={(event) => patchNode(flow.id, node.id, (current) => ({ ...current, text: event.target.value }))}
            placeholder={depth === 0
              ? 'Ex.: Vi seu comentário 👊 Escolha abaixo como você quer continuar.'
              : 'Escreva a resposta que será enviada quando a pessoa tocar neste botão.'}
          />
        </label>

        <div className={styles.audioRow}>
          <div>
            <strong>Áudio no Direct <span>opcional</span></strong>
            <small>{node.audioName || 'M4A/AAC · até 2 MB'}</small>
          </div>
          <label className={styles.uploadButton}>
            {uploadingNodeId === node.id ? 'Enviando…' : node.audioPath ? 'Trocar áudio' : '+ Adicionar áudio'}
            <input
              type="file"
              accept=".m4a,audio/mp4,audio/x-m4a"
              disabled={uploadingNodeId === node.id}
              onChange={(event) => uploadAudio(flow.id, node.id, event.target.files?.[0])}
            />
          </label>
          {node.audioPath && (
            <button type="button" className={styles.removeAudio} onClick={() => patchNode(flow.id, node.id, (current) => ({ ...current, audioPath: '', audioName: '' }))}>
              Remover
            </button>
          )}
        </div>

        <div className={styles.branchHeader}>
          <div>
            <strong>Botões de resposta</strong>
            <span>A escolha fica registrada para você consultar depois.</span>
          </div>
          <button type="button" onClick={() => addButton(flow.id, node.id)} disabled={(node.buttons || []).length >= 13}>
            + Adicionar botão
          </button>
        </div>

        {(node.buttons || []).length === 0 ? (
          <div className={styles.noButtons}>Sem botões: a automação termina depois desta resposta.</div>
        ) : (
          <>
            <div className={styles.modePicker}>
              <button
                type="button"
                className={(node.responseMode || 'same') === 'same' ? styles.modeActive : ''}
                onClick={() => setResponseMode(flow.id, node.id, 'same')}
              >
                <strong>Mesma resposta para todos</strong>
                <span>Eu só quero registrar qual opção a pessoa escolheu.</span>
              </button>
              <button
                type="button"
                className={node.responseMode === 'personalized' ? styles.modeActive : ''}
                onClick={() => setResponseMode(flow.id, node.id, 'personalized')}
              >
                <strong>Resposta diferente por opção</strong>
                <span>Cada botão abre um caminho próprio.</span>
              </button>
            </div>

            <div className={styles.buttonsList}>
              {(node.buttons || []).map((button, index) => (
                <div className={styles.branchCompact} key={button.id}>
                  <div className={styles.branchTitle}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <input
                      value={button.label || ''}
                      maxLength={20}
                      onChange={(event) => patchButton(flow.id, node.id, button.id, { label: event.target.value })}
                      placeholder="Texto do botão"
                    />
                    <button type="button" onClick={() => removeButton(flow.id, node.id, button.id)}>×</button>
                  </div>

                  {node.responseMode === 'personalized' && (
                    <div className={styles.personalizedBranch}>
                      {renderNode(flow, button.next, depth + 1, 'SE ESCOLHER “' + (button.label || 'ESTA OPÇÃO') + '”')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {(node.responseMode || 'same') === 'same' && node.sharedNext && (
              <div className={styles.sharedResponse}>
                <div className={styles.sharedResponseLabel}>
                  <span>RESPOSTA ÚNICA</span>
                  <strong>Depois de qualquer uma das opções acima</strong>
                  <small>A opção escolhida fica salva, mas a conversa segue igual para todos.</small>
                </div>
                {renderNode(flow, node.sharedNext, depth + 1, 'MESMA RESPOSTA PARA TODAS AS OPÇÕES')}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>INSTAGRAM</span>
          <h1>Automações</h1>
          <p>Crie fluxos de comentário → Direct → botões → novas respostas, sem código.</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={addFlow}>+ Nova automação</button>
      </header>

      <section className={styles.summary}>
        <article><span>Automações</span><strong>{flows.length}</strong><small>Criadas manualmente</small></article>
        <article><span>Ativas</span><strong>{activeCount}</strong><small>Respondendo comentários</small></article>
        <article><span>Conta</span><strong>@gui_nonato</strong><small>Instagram Business conectado</small></article>
      </section>

      {notice && <button type="button" className={styles.notice} onClick={() => setNotice('')}>{notice} ×</button>}

      {loading ? (
        <section className={styles.empty}><strong>Carregando automações…</strong></section>
      ) : flows.length === 0 ? (
        <section className={styles.empty}>
          <div className={styles.emptyIcon}>⚡</div>
          <span className={styles.eyebrow}>COMEÇAR DO ZERO</span>
          <h2>Nenhuma automação criada.</h2>
          <p>As automações antigas foram retiradas. Crie a primeira do jeito que você quiser.</p>
          <button className={styles.primaryButton} type="button" onClick={addFlow}>+ Adicionar nova automação</button>
        </section>
      ) : (
        <section className={styles.workspace}>
          <aside className={styles.flowList}>
            <div className={styles.listHeader}>
              <span className={styles.eyebrow}>SUAS AUTOMAÇÕES</span>
              <button type="button" onClick={addFlow}>+</button>
            </div>
            {flows.map((flow) => (
              <button
                type="button"
                key={flow.id}
                className={selectedId === flow.id ? styles.flowSelected : ''}
                onClick={() => setSelectedId(flow.id)}
              >
                <i className={flow.active ? styles.on : ''} />
                <span><strong>{flow.name || 'Nova automação'}</strong><small>{flow.keyword ? 'Comentário: ' + flow.keyword : 'Defina uma palavra-chave'}</small></span>
              </button>
            ))}
          </aside>

          <section className={styles.editor}>
            {selected && (
              <>
                <div className={styles.editorTop}>
                  <div>
                    <span className={styles.eyebrow}>EDITOR DE FLUXO</span>
                    <h2>{selected.name || 'Nova automação'}</h2>
                  </div>
                  <label className={styles.switch}>
                    <span>{selected.active ? 'Ativa' : 'Pausada'}</span>
                    <input type="checkbox" checked={selected.active} onChange={(event) => patchFlow(selected.id, { active: event.target.checked })} />
                    <i />
                  </label>
                </div>

                <section className={styles.block}>
                  <div className={styles.blockTitle}><b>1</b><div><strong>Gatilho</strong><span>Qual comentário inicia a automação?</span></div></div>
                  <div className={styles.twoColumns}>
                    <label className={styles.field}>
                      <span>Nome da automação</span>
                      <input value={selected.name || ''} onChange={(event) => patchFlow(selected.id, { name: event.target.value })} placeholder="Ex.: Mentoria" />
                    </label>
                    <label className={styles.field}>
                      <span>Palavra-chave no comentário</span>
                      <input value={selected.keyword || ''} onChange={(event) => patchFlow(selected.id, { keyword: event.target.value.toUpperCase() })} placeholder="Ex.: MENTORIA" />
                    </label>
                  </div>
                </section>

                <section className={styles.block}>
                  <div className={styles.blockTitle}><b>2</b><div><strong>Resposta no comentário</strong><span>Duas opções que alternam automaticamente.</span></div></div>
                  <div className={styles.twoColumns}>
                    <label className={styles.field}>
                      <span>Resposta A</span>
                      <input
                        value={selected.publicReplies?.[0] || ''}
                        onChange={(event) => patchFlow(selected.id, { publicReplies: [event.target.value, selected.publicReplies?.[1] || ''] })}
                        placeholder="Ex.: Te chamei no Direct 👊"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Resposta B</span>
                      <input
                        value={selected.publicReplies?.[1] || ''}
                        onChange={(event) => patchFlow(selected.id, { publicReplies: [selected.publicReplies?.[0] || '', event.target.value] })}
                        placeholder="Ex.: Mandei as informações no seu Direct ✨"
                      />
                    </label>
                  </div>
                  <p className={styles.helper}>A TidePlace alterna A → B → A → B conforme os comentários são processados.</p>
                </section>

                <section className={styles.block}>
                  <div className={styles.blockTitle}><b>3</b><div><strong>Direct e caminhos</strong><span>Monte a conversa com botões e respostas em sequência.</span></div></div>
                  {renderNode(selected, selected.start, 0)}
                </section>

                <div className={styles.editorActions}>
                  <button type="button" className={styles.deleteButton} onClick={() => deleteFlow(selected.id)}>Excluir automação</button>
                  <button type="button" className={styles.saveButton} onClick={saveAll} disabled={saving}>
                    {saving ? 'Salvando…' : 'Salvar automações'}
                  </button>
                </div>
              </>
            )}
          </section>
        </section>
      )}
    </main>
  );
}
