import { createHash } from 'node:crypto';
import { authorize } from '../vital-connections/service';
import { readRows } from '../../lib/operations.mjs';
import { editorialError, patchEditorialPost, publicEditorialPost, requireWorkspace, validateLegacyPosts, validatePost } from '../../lib/editorial-calendar.mjs';
import { GUI_EDITORIAL_IMPORT_KEY, GUI_EDITORIAL_OCTOBER_POSTS } from '../../lib/gui-editorial-october-2026.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };

async function readPosts(db, ownerId, workspace) {
  const { data, error } = await readRows(() => db.from('editorial_posts')
    .select('payload,revision,updated_at').eq('owner_user_id', ownerId).eq('workspace_id', workspace)
    .is('deleted_at', null).order('date_key').order('created_at').order('post_id'), 10000);
  if (error || data.length >= 10000) throw editorialError('Não foi possível carregar todo o calendário. Tente novamente.', 503);
  return data.map(publicEditorialPost);
}

async function importPosts(db, ownerId, workspace, key, posts) {
  const { error } = await db.rpc('import_editorial_posts', {
    p_owner_id: ownerId, p_workspace: workspace, p_import_key: key, p_posts: posts,
  });
  if (error) throw editorialError('Não foi possível importar o planejamento. A cópia de origem foi preservada.', 503);
}

async function readBody(request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > 2 * 1024 * 1024) throw editorialError('O planejamento excede o limite de importação. A cópia original foi preservada.', 413);
  try { return JSON.parse(raw); } catch { throw editorialError('Solicitação inválida.'); }
}

function checkOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw editorialError('Origem inválida.', 403);
}

function errorResponse(error) {
  return Response.json({ error: error.status ? error.message : 'Não foi possível acessar o calendário. Tente novamente.' }, { status: error.status || 503, headers });
}

export async function GET(request) {
  try {
    const { db, ownerId } = await authorize(request);
    const workspace = requireWorkspace(new URL(request.url).searchParams.get('workspace'));
    return Response.json({ workspace, posts: await readPosts(db, ownerId, workspace) }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    checkOrigin(request);
    const { db, ownerId } = await authorize(request);
    const body = await readBody(request), workspace = requireWorkspace(body.workspace);

    if (body.action === 'initialize') {
      // Import the latest cloud snapshot once. Older snapshots are history, not current posts.
      const { data: legacy, error } = await db.from('content_items').select('description')
        .eq('user_id', ownerId).eq('title', '__SOCIAL_HUB_STATE__')
        .order('updated_at', { ascending: false }).order('id').limit(1).maybeSingle();
      if (error) throw editorialError('Não foi possível conferir a cópia do calendário antigo.', 503);
      const storageKey = workspace === 'gui-nonato' ? 'guihub-posts' : `guihub-posts:${workspace}`;
      if (legacy?.description) {
        let oldPosts;
        try {
          const stored = JSON.parse(legacy.description)?.data?.[storageKey];
          if (stored !== undefined) oldPosts = JSON.parse(stored);
        } catch { throw editorialError('A cópia antiga precisa de revisão. Nenhum dado foi substituído.', 409); }
        if (oldPosts !== undefined) await importPosts(db, ownerId, workspace, 'legacy-cloud-snapshot:v1', validateLegacyPosts(oldPosts));
      }
      // Browser backups are archived transactionally before any insert. Never update existing rows.
      if (body.legacyPosts !== undefined) {
        const posts = validateLegacyPosts(body.legacyPosts);
        const digest = createHash('sha256').update(JSON.stringify(posts)).digest('hex');
        await importPosts(db, ownerId, workspace, 'browser:' + digest, posts);
      }
      if (workspace === 'gui-nonato') await importPosts(db, ownerId, workspace, GUI_EDITORIAL_IMPORT_KEY, GUI_EDITORIAL_OCTOBER_POSTS);
      return Response.json({ workspace, posts: await readPosts(db, ownerId, workspace) }, { headers });
    }

    if (body.action !== 'create') throw editorialError('Ação inválida.');
    const post = validatePost(body.post);
    const { data, error } = await db.from('editorial_posts').insert({
      owner_user_id: ownerId, workspace_id: workspace, post_id: String(post.id), payload: post,
    }).select('payload,revision,updated_at').single();
    if (error?.code === '23505') throw editorialError('Este conteúdo já está no calendário. Atualize a lista para consultá-lo.', 409);
    if (error) throw editorialError('Não foi possível salvar o conteúdo. Seu formulário foi preservado.', 503);
    return Response.json({ post: publicEditorialPost(data) }, { status: 201, headers });
  } catch (error) { return errorResponse(error); }
}

async function editPost(request, remove = false) {
  try {
    checkOrigin(request);
    const { db, ownerId } = await authorize(request);
    const body = await readBody(request), workspace = requireWorkspace(body.workspace);
    if (!['string', 'number'].includes(typeof body.id) || !Number.isSafeInteger(body.revision) || body.revision < 1) throw editorialError('Atualize o calendário antes de editar este conteúdo.', 409);
    // The owner and workspace are enforced on BOTH the read and compare-and-swap update.
    const { data: current, error: readError } = await db.from('editorial_posts').select('payload,revision')
      .eq('owner_user_id', ownerId).eq('workspace_id', workspace).eq('post_id', String(body.id)).is('deleted_at', null).maybeSingle();
    if (readError) throw editorialError('Não foi possível consultar este conteúdo.', 503);
    if (!current || current.revision !== body.revision) throw editorialError('Este conteúdo mudou em outro dispositivo. Atualize o calendário antes de editar.', 409);
    const update = { revision: current.revision + 1, updated_at: new Date().toISOString() };
    if (remove) update.deleted_at = update.updated_at; // Recoverable deletion; legacy imports cannot resurrect it.
    else update.payload = patchEditorialPost(current.payload, body.patch);
    const { data, error } = await db.from('editorial_posts').update(update)
      .eq('owner_user_id', ownerId).eq('workspace_id', workspace).eq('post_id', String(body.id))
      .eq('revision', body.revision).is('deleted_at', null).select('payload,revision,updated_at').maybeSingle();
    if (error?.code === '23505') throw editorialError('Já existe um conteúdo com este tema e data.', 409);
    if (error) throw editorialError('Não foi possível salvar. Nenhuma alteração foi confirmada.', 503);
    if (!data) throw editorialError('Este conteúdo mudou em outro dispositivo. Atualize o calendário antes de editar.', 409);
    return Response.json(remove ? { removedId: body.id } : { post: publicEditorialPost(data) }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request) { return editPost(request); }
export async function DELETE(request) { return editPost(request, true); }
