'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../CloudGate';
import styles from './automacoes.module.css';

function uid(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2));
  return prefix + '-' + value;
}

function emptyNode() {
  return { id: uid('node'), text: '', audioPath: '', audioName: '', buttons: [] };
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

function updateNodeTree(node, nodeId, updater) {
  if (node.id === nodeId) return updater(node);
  return {
    ...node,
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
  const [flows, setFlows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploadingNodeId, setUploadingNodeId] = useState('');

  useEffect(() => {
    let cancelled = false;
    ownerRequest('/api/instagram/flow-automations')
      .then((payload) => {
        if (cancelled) return;
        const next = Array.isArray(payload.flows) ? payload.flows : [];
        setFlows(next);
        setSelectedId(next[0]?.id || null);
      })
      .catch((error) => !cancelled && setNotice(error.message))
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
        buttons: [
          ...(node.buttons || []),
          { id: uid('button'), label: '', next: emptyNode() },
        ],
      };
    });
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
      setFlows(payload.flows || []);
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
            <span>A pessoa toca e segue para o próximo passo.</span>
          </div>
          <button type="button" onClick={() => addButton(flow.id, node.id)} disabled={(node.buttons || []).length >= 13}>
            + Adicionar botão
          </button>
        </div>

        {(node.buttons || []).length === 0 ? (
          <div className={styles.noButtons}>Sem botões: a automação termina depois desta resposta.</div>
        ) : (
          <div className={styles.buttonsList}>
            {(node.buttons || []).map((button, index) => (
              <div className={styles.branch} key={button.id}>
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
                {renderNode(flow, button.next, depth + 1, 'SE A PESSOA ESCOLHER “' + (button.label || 'ESTE BOTÃO') + '”')}
              </div>
            ))}
          </div>
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
