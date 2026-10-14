let opened;
export function database() {
  if (!opened) opened = new Promise((resolve, reject) => {
    const req = indexedDB.open('tideplace-creator-v1', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('assets', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(e => { opened = null; throw e; });
  return opened;
}
async function request(store, mode, method, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), req = tx.objectStore(store)[method](value);
    let result;
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || req.error || new Error('Falha no armazenamento.'));
  });
}
export const saveProject = project => request('projects', 'readwrite', 'put', structuredClone(project));
export const getProject = id => request('projects', 'readonly', 'get', id);
export const deleteProject = id => request('projects', 'readwrite', 'delete', id);
export async function listProjects(workspace) {
  return (await request('projects', 'readonly', 'getAll')).filter(p => p.workspace === workspace)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveAsset(workspace, file) {
  const asset = { id: crypto.randomUUID(), workspace, file, name: file.name || 'foto', createdAt: Date.now() };
  await request('assets', 'readwrite', 'put', asset); return asset;
}
export async function getAsset(id, workspace) {
  if (!id) return null;
  const asset = await request('assets', 'readonly', 'get', id);
  return asset?.workspace === workspace ? asset : null;
}
export async function listAssets(workspace) {
  return (await request('assets', 'readonly', 'getAll')).filter(a => a.workspace === workspace)
    .sort((a, b) => b.createdAt - a.createdAt);
}
