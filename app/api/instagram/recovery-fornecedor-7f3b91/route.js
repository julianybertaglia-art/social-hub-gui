import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_VERSION = 'v26.0';
const ACCOUNT_ID = '17841401155694295';
const KNOWN_GUI_IDS = new Set([ACCOUNT_ID, '28514210391598249']);
const GUI_USERNAME = 'gui_nonato';
const MEDIA_ID = '18127520257835387';
const TARGET_SHORTCODE = 'DdPtMv7Djom';
const KEYWORD = 'FORNECEDOR';
const CUTOFF_ISO = '2026-09-14T12:46:49.534556Z';
const CUTOFF_MS = Date.parse(CUTOFF_ISO);
const JOB_KEY = 'instagram-fornecedor-DdPtMv7Djom-20260914';
const AUTH_KEY = `${JOB_KEY}:auth`;
const STATE_TITLE = '__SOCIAL_HUB_STATE__';
const AUTOMATIONS_STORAGE_KEY = 'guihub-automations';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function safeError(error) {
  return {
    message: String(error?.message || error || 'Erro desconhecido')
      .replace(/access_token=[^&\s]+/gi, 'access_token=[oculto]')
      .slice(0, 420),
    code: error?.metaCode ?? null,
    subcode: error?.metaSubcode ?? null,
    status: error?.status ?? null,
  };
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 16);
}

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase não configurado no servidor.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function metaFetch(url, options = {}) {
  const token = String(process.env.META_INSTAGRAM_ACCESS_TOKEN || '').trim();
  if (!token) throw new Error('META_INSTAGRAM_ACCESS_TOKEN não configurado.');

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || payload?.error) {
    const detail = payload?.error || {};
    const error = new Error(
      String(detail.message || `A Meta respondeu com HTTP ${response.status}.`)
    );
    error.metaCode = detail.code ?? null;
    error.metaSubcode = detail.error_subcode ?? null;
    error.status = response.status;
    throw error;
  }

  return payload;
}

function graphUrl(path, params = {}) {
  const url = new URL(
    `https://graph.instagram.com/${API_VERSION}/${String(path || '').replace(/^\/+/, '')}`
  );
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function metaGet(path, params = {}) {
  return metaFetch(graphUrl(path, params));
}

async function metaPost(path, body) {
  return metaFetch(graphUrl(path), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function paginate(path, params = {}, maxPages = 20) {
  const rows = [];
  let next = graphUrl(path, params).toString();

  for (let page = 0; next && page < maxPages; page += 1) {
    const parsed = new URL(next);
    if (parsed.protocol !== 'https:' || !['graph.instagram.com', 'graph.facebook.com'].includes(parsed.hostname)) {
      throw new Error('A Meta retornou paginação para um endereço inesperado.');
    }

    const payload = await metaFetch(parsed);
    if (Array.isArray(payload?.data)) rows.push(...payload.data);
    next = String(payload?.paging?.next || '');
  }

  if (next) throw new Error('A paginação da Meta excedeu o limite de segurança.');
  return rows;
}

async function listCommentEdge(path) {
  const fieldSets = [
    'id,text,timestamp,username,from',
    'id,text,timestamp,from',
    'id,text,timestamp,username',
  ];
  let lastError;

  for (const fields of fieldSets) {
    try {
      return await paginate(path, { fields, limit: 100 });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Não foi possível ler os comentários na Meta.');
}

function authorOf(item) {
  const source = item?.from || item?.user || {};
  const id = String(source?.id || item?.user_id || '').trim();
  const username = String(source?.username || item?.username || '')
    .trim()
    .replace(/^@/, '');
  const key = id
    ? `id:${id}`
    : username
      ? `username:${username.toLowerCase()}`
      : '';

  return { id, username, key };
}

function isGuiAuthor(item) {
  const author = authorOf(item);
  return KNOWN_GUI_IDS.has(author.id) || author.username.toLowerCase() === GUI_USERNAME;
}

function hasGuiReply(replies, expectedText) {
  const exactExpected = String(expectedText || '').trim();
  return (replies || []).some((reply) => (
    isGuiAuthor(reply)
    || (exactExpected && String(reply?.text || '').trim() === exactExpected)
  ));
}

function matchesHubRule(text) {
  return normalizeText(text).includes(normalizeText(KEYWORD));
}

async function loadFornecedorRule(db) {
  const { data, error } = await db
    .from('content_items')
    .select('description,updated_at')
    .eq('title', STATE_TITLE)
    .maybeSingle();

  if (error || !data?.description) {
    throw error || new Error('Estado do Hub não encontrado.');
  }

  const state = JSON.parse(data.description);
  const serialized = state?.data?.[AUTOMATIONS_STORAGE_KEY];
  const rules = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;

  if (!Array.isArray(rules)) throw new Error('Automações salvas em formato inválido.');

  const rule = rules.find((candidate) => (
    Boolean(candidate?.active)
    && normalizeText(candidate?.keyword) === normalizeText(KEYWORD)
  ));

  if (!rule) throw new Error('A automação FORNECEDOR não está ativa no estado atual do Hub.');

  const publicReply = String(rule.publicReply || '').trim();
  const privateMessage = String(rule.privateMessage || '').trim();
  if (!publicReply || !privateMessage) {
    throw new Error('A automação FORNECEDOR está sem resposta pública ou Direct.');
  }

  return {
    id: String(rule.id || ''),
    keyword: String(rule.keyword || '').trim(),
    publicReply,
    privateMessage,
    stateUpdatedAt: data.updated_at,
    publicReplyHash: hashText(publicReply),
    privateMessageHash: hashText(privateMessage),
  };
}

async function verifyMedia() {
  const media = await metaGet(MEDIA_ID, {
    fields: 'id,permalink,timestamp,caption,media_type',
  });
  const pathname = new URL(String(media?.permalink || '')).pathname;
  if (String(media?.id || '') !== MEDIA_ID || !pathname.includes(`/${TARGET_SHORTCODE}/`)) {
    throw new Error('O ID consultado não corresponde ao post autorizado.');
  }
  return {
    id: String(media.id),
    permalink: String(media.permalink),
    timestamp: String(media.timestamp || ''),
    mediaType: String(media.media_type || ''),
  };
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => worker())
  );
  return output;
}

async function buildInspection(rule) {
  const comments = await listCommentEdge(`${MEDIA_ID}/comments`);
  const matched = comments.filter((comment) => matchesHubRule(comment?.text));

  const inspected = await mapLimit(matched, 4, async (comment) => {
    const author = authorOf(comment);
    const timestamp = String(comment?.timestamp || '');
    const timestampMs = Date.parse(timestamp);

    try {
      const replies = await listCommentEdge(`${comment.id}/replies`);
      return {
        commentId: String(comment.id || ''),
        text: String(comment.text || ''),
        timestamp,
        timestampMs,
        author,
        replyCheckOk: true,
        hasGuiReply: hasGuiReply(replies, rule.publicReply),
        replyCount: replies.length,
      };
    } catch (error) {
      return {
        commentId: String(comment.id || ''),
        text: String(comment.text || ''),
        timestamp,
        timestampMs,
        author,
        replyCheckOk: false,
        hasGuiReply: false,
        replyCount: null,
        replyError: safeError(error),
      };
    }
  });

  const groups = new Map();
  const unsafe = [];

  for (const row of inspected) {
    if (!row.commentId || !row.author.key || !Number.isFinite(row.timestampMs)) {
      unsafe.push({
        commentId: row.commentId || null,
        username: row.author.username || null,
        reason: 'autor_ou_horario_indisponivel',
      });
      continue;
    }
    const list = groups.get(row.author.key) || [];
    list.push(row);
    groups.set(row.author.key, list);
  }

  const targets = [];
  const alreadyHandled = [];
  const samePersonAfterCutoff = [];
  const replyCheckFailed = [];
  let duplicateOldComments = 0;

  for (const [authorKey, rows] of groups) {
    rows.sort((a, b) => a.timestampMs - b.timestampMs);
    const oldRows = rows.filter((row) => row.timestampMs < CUTOFF_MS);
    const newRows = rows.filter((row) => row.timestampMs >= CUTOFF_MS);
    if (!oldRows.length) continue;

    duplicateOldComments += Math.max(0, oldRows.length - 1);

    if (rows.some((row) => !row.replyCheckOk)) {
      replyCheckFailed.push({
        authorKey,
        username: rows[0].author.username || null,
        commentIds: rows.map((row) => row.commentId),
      });
      continue;
    }

    if (newRows.length) {
      samePersonAfterCutoff.push({
        authorKey,
        username: rows[0].author.username || null,
        oldCommentIds: oldRows.map((row) => row.commentId),
        newCommentIds: newRows.map((row) => row.commentId),
      });
      continue;
    }

    if (rows.some((row) => row.hasGuiReply)) {
      alreadyHandled.push({
        authorKey,
        username: rows[0].author.username || null,
        commentIds: rows.map((row) => row.commentId),
      });
      continue;
    }

    const chosen = oldRows[0];
    targets.push({
      commentId: chosen.commentId,
      username: chosen.author.username,
      authorId: chosen.author.id,
      authorKey,
      timestamp: chosen.timestamp,
    });
  }

  return {
    totalComments: comments.length,
    matchedComments: inspected.length,
    matchedBeforeCutoff: inspected.filter((row) => row.timestampMs < CUTOFF_MS).length,
    matchedAfterCutoff: inspected.filter((row) => row.timestampMs >= CUTOFF_MS).length,
    uniqueMatchedPeople: groups.size,
    duplicateOldComments,
    alreadyHandled,
    samePersonAfterCutoff,
    replyCheckFailed,
    unsafe,
    targets,
  };
}

function publicInspection(inspection) {
  return {
    totalComments: inspection.totalComments,
    matchedComments: inspection.matchedComments,
    matchedBeforeCutoff: inspection.matchedBeforeCutoff,
    matchedAfterCutoff: inspection.matchedAfterCutoff,
    uniqueMatchedPeople: inspection.uniqueMatchedPeople,
    targetPeople: inspection.targets.length,
    alreadyHandledPeople: inspection.alreadyHandled.length,
    samePersonAfterCutoff: inspection.samePersonAfterCutoff.length,
    duplicateOldComments: inspection.duplicateOldComments,
    replyCheckFailed: inspection.replyCheckFailed.length,
    unsafeComments: inspection.unsafe.length,
    targets: inspection.targets,
  };
}

async function authorize(request, db) {
  const supplied = String(request.headers.get('x-recovery-token') || '');
  if (!supplied) return false;

  const { data, error } = await db
    .from('instagram_manual_backfills')
    .select('status,detail')
    .eq('key', AUTH_KEY)
    .maybeSingle();

  if (error) throw error;
  const stored = String(data?.detail || '');
  if (data?.status !== 'running' || !stored || stored.length !== supplied.length) return false;

  const storedBuffer = Buffer.from(stored, 'utf8');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');
  return crypto.timingSafeEqual(storedBuffer, suppliedBuffer);
}

async function setBackfill(db, key, status, detail) {
  const { error } = await db
    .from('instagram_manual_backfills')
    .update({
      status,
      detail: JSON.stringify(detail),
      updated_at: new Date().toISOString(),
    })
    .eq('key', key);
  if (error) throw error;
}

async function claimJob(db, inspection, rule) {
  const now = new Date().toISOString();
  const { error } = await db
    .from('instagram_manual_backfills')
    .insert({
      key: JOB_KEY,
      status: 'running',
      detail: JSON.stringify({
        stage: 'claimed',
        at: now,
        cutoff: CUTOFF_ISO,
        targets: inspection.targets.length,
        ruleId: rule.id,
        publicReplyHash: rule.publicReplyHash,
        privateMessageHash: rule.privateMessageHash,
      }),
      created_at: now,
      updated_at: now,
    });

  if (error?.code === '23505') return false;
  if (error) throw error;
  return true;
}

async function claimComment(db, target, rule) {
  const key = `${JOB_KEY}:comment:${target.commentId}`;
  const now = new Date().toISOString();
  const { error } = await db
    .from('instagram_manual_backfills')
    .insert({
      key,
      status: 'running',
      detail: JSON.stringify({
        stage: 'claimed',
        at: now,
        username: target.username || null,
        authorId: target.authorId || null,
        commentTimestamp: target.timestamp,
        ruleId: rule.id,
      }),
      created_at: now,
      updated_at: now,
    });

  if (error?.code === '23505') return { claimed: false, key };
  if (error) throw error;
  return { claimed: true, key };
}

function looksAlreadyPrivate(error) {
  const text = String(error?.message || '').toLowerCase();
  return /already|previously|one private reply|já (foi )?respond|replied to this comment/.test(text);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeRecovery(db, rule, inspection) {
  const results = [];
  const errors = [];

  for (const target of inspection.targets) {
    const claim = await claimComment(db, target, rule);
    if (!claim.claimed) {
      results.push({
        commentId: target.commentId,
        username: target.username || null,
        outcome: 'skipped_existing_claim',
      });
      continue;
    }

    try {
      const currentReplies = await listCommentEdge(`${target.commentId}/replies`);
      if (hasGuiReply(currentReplies, rule.publicReply)) {
        const detail = {
          outcome: 'skipped_existing_public_reply',
          username: target.username || null,
          commentId: target.commentId,
          checkedAt: new Date().toISOString(),
        };
        await setBackfill(db, claim.key, 'sent', detail);
        results.push(detail);
        continue;
      }

      let privateResult;
      try {
        privateResult = await metaPost(`${ACCOUNT_ID}/messages`, {
          recipient: { comment_id: target.commentId },
          message: { text: rule.privateMessage },
        });
      } catch (error) {
        const detail = {
          outcome: looksAlreadyPrivate(error)
            ? 'skipped_private_already_exists'
            : 'failed_private',
          username: target.username || null,
          commentId: target.commentId,
          error: safeError(error),
        };
        await setBackfill(
          db,
          claim.key,
          looksAlreadyPrivate(error) ? 'sent' : 'failed',
          detail
        );
        results.push(detail);
        if (!looksAlreadyPrivate(error)) errors.push(detail);
        continue;
      }

      let publicOutcome = 'sent_public';
      let publicResult = null;
      const repliesAfterPrivate = await listCommentEdge(`${target.commentId}/replies`);

      if (hasGuiReply(repliesAfterPrivate, rule.publicReply)) {
        publicOutcome = 'skipped_public_reply_race';
      } else {
        publicResult = await metaPost(`${target.commentId}/replies`, {
          message: rule.publicReply,
        });
      }

      const detail = {
        outcome: 'recovered',
        publicOutcome,
        username: target.username || null,
        authorId: target.authorId || null,
        commentId: target.commentId,
        privateMessageId: String(privateResult?.message_id || ''),
        publicReplyId: String(publicResult?.id || ''),
        completedAt: new Date().toISOString(),
      };
      await setBackfill(db, claim.key, 'sent', detail);
      results.push(detail);
    } catch (error) {
      const detail = {
        outcome: 'failed_after_claim',
        username: target.username || null,
        commentId: target.commentId,
        error: safeError(error),
      };
      try {
        await setBackfill(db, claim.key, 'failed', detail);
      } catch {
        // O resumo final ainda registra a falha.
      }
      results.push(detail);
      errors.push(detail);
    }

    await wait(250);
  }

  const counts = {
    recovered: results.filter((item) => item.outcome === 'recovered').length,
    skippedAlreadyHandled: results.filter((item) => (
      item.outcome === 'skipped_existing_public_reply'
      || item.outcome === 'skipped_private_already_exists'
    )).length,
    skippedExistingClaim: results.filter((item) => item.outcome === 'skipped_existing_claim').length,
    failed: errors.length,
  };

  return { counts, results, errors };
}

async function inspect(request) {
  const db = serverClient();
  if (!(await authorize(request, db))) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 403 });
  }

  const [rule, media] = await Promise.all([
    loadFornecedorRule(db),
    verifyMedia(),
  ]);
  const inspection = await buildInspection(rule);

  return Response.json({
    ok: true,
    mode: 'inspect',
    jobKey: JOB_KEY,
    cutoff: CUTOFF_ISO,
    media,
    rule: {
      id: rule.id,
      keyword: rule.keyword,
      stateUpdatedAt: rule.stateUpdatedAt,
      publicReplyHash: rule.publicReplyHash,
      privateMessageHash: rule.privateMessageHash,
    },
    inspection: publicInspection(inspection),
  });
}

export async function GET(request) {
  try {
    return await inspect(request);
  } catch (error) {
    return Response.json({ ok: false, error: safeError(error) }, { status: 500 });
  }
}

export async function POST(request) {
  let db;

  try {
    db = serverClient();
    if (!(await authorize(request, db))) {
      return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 403 });
    }

    const [rule, media] = await Promise.all([
      loadFornecedorRule(db),
      verifyMedia(),
    ]);
    const inspection = await buildInspection(rule);

    if (inspection.replyCheckFailed.length || inspection.unsafe.length) {
      return Response.json({
        ok: false,
        error: 'Inspeção incompleta; nenhum envio foi iniciado.',
        media,
        inspection: publicInspection(inspection),
      }, { status: 409 });
    }

    if (!(await claimJob(db, inspection, rule))) {
      const { data } = await db
        .from('instagram_manual_backfills')
        .select('status,detail,updated_at')
        .eq('key', JOB_KEY)
        .maybeSingle();
      return Response.json({
        ok: false,
        alreadyRun: true,
        jobKey: JOB_KEY,
        existing: data || null,
      }, { status: 409 });
    }

    const execution = await executeRecovery(db, rule, inspection);
    const finalStatus = execution.errors.length ? 'failed' : 'sent';
    const summary = {
      completedAt: new Date().toISOString(),
      cutoff: CUTOFF_ISO,
      media,
      rule: {
        id: rule.id,
        keyword: rule.keyword,
        stateUpdatedAt: rule.stateUpdatedAt,
        publicReplyHash: rule.publicReplyHash,
        privateMessageHash: rule.privateMessageHash,
      },
      inspection: publicInspection(inspection),
      execution,
    };

    await setBackfill(db, JOB_KEY, finalStatus, summary);
    await setBackfill(db, AUTH_KEY, finalStatus, {
      outcome: 'consumed',
      completedAt: summary.completedAt,
      jobKey: JOB_KEY,
    });

    return Response.json({
      ok: execution.errors.length === 0,
      status: finalStatus,
      jobKey: JOB_KEY,
      summary,
    });
  } catch (error) {
    const failure = {
      failedAt: new Date().toISOString(),
      error: safeError(error),
    };

    if (db) {
      try {
        const { data } = await db
          .from('instagram_manual_backfills')
          .select('key')
          .eq('key', JOB_KEY)
          .maybeSingle();
        if (data?.key) await setBackfill(db, JOB_KEY, 'failed', failure);
      } catch {
        // A resposta HTTP ainda informa a falha.
      }
    }

    return Response.json({ ok: false, status: 'failed', ...failure }, { status: 500 });
  }
}
