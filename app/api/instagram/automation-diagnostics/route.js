import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_VERSION = 'v26.0';

async function metaGet(path, token) {
  const response = await fetch('https://graph.instagram.com/' + API_VERSION + '/' + path, {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    return {
      ok: false,
      status: response.status,
      code: payload?.error?.code || null,
      message: String(payload?.error?.message || 'Erro da Meta').slice(0, 180),
    };
  }
  return { ok: true, status: response.status, payload };
}

export async function GET() {
  const token = String(process.env.META_INSTAGRAM_ACCESS_TOKEN || '').trim();
  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  const webhookToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();

  const checks = {
    environment: process.env.VERCEL_ENV || 'unknown',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    credentials: {
      instagramToken: Boolean(token),
      appSecret: Boolean(appSecret),
      webhookVerifyToken: Boolean(webhookToken),
      supabase: Boolean(supabaseUrl && supabaseKey),
    },
    instagram: { ok: false },
    subscriptions: { ok: false, fields: [], appId: null, appName: null },
    database: { ok: false, stateTable: false, responseLedger: false, ingressLog: false },
    webhookDelivery: { received: false, signatureValid: null, field: null, receivedAt: null },
    lastAutomation: { found: false, publicStatus: null, privateStatus: null, publicReplyVisible: null, replyCount: null, replyCheckError: null },
  };

  if (token) {
    const profile = await metaGet('me?fields=user_id,username', token);
    checks.instagram = profile.ok
      ? {
          ok: true,
          username: profile.payload?.username || null,
          accountId: String(profile.payload?.user_id || profile.payload?.id || ''),
        }
      : { ok: false, status: profile.status, code: profile.code, message: profile.message };

    const accountId = checks.instagram?.accountId;
    if (accountId) {
      const subscriptions = await metaGet(accountId + '/subscribed_apps', token);
      if (subscriptions.ok) {
        const apps = Array.isArray(subscriptions.payload?.data) ? subscriptions.payload.data : [];
        const fields = [...new Set(
          apps.flatMap((app) => Array.isArray(app?.subscribed_fields) ? app.subscribed_fields : [])
        )].sort();
        checks.subscriptions = {
          ok: ['comments', 'messages', 'messaging_postbacks'].every((field) => fields.includes(field)),
          fields,
          appId: String(apps[0]?.id || '') || null,
          appName: apps[0]?.name || null,
        };

      } else {
        checks.subscriptions = {
          ok: false,
          fields: [],
          status: subscriptions.status,
          code: subscriptions.code,
          message: subscriptions.message,
        };
      }
    }
  }

  if (supabaseUrl && supabaseKey) {
    const db = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [stateCheck, ledgerCheck, ingressCheck, eventCheck] = await Promise.all([
      db.from('content_items').select('id').eq('title', '__SOCIAL_HUB_STATE__').limit(1),
      db.from('instagram_flow_responses').select('id').limit(1),
      db.from('instagram_webhook_ingress')
        .select('created_at,signature_valid,field_name')
        .order('created_at', { ascending: false })
        .limit(1),
      db.from('instagram_automation_events')
        .select('comment_id,media_id,public_reply_id,public_delivery_mode,private_status,public_status')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    checks.database = {
      ok: !stateCheck.error && !ledgerCheck.error && !ingressCheck.error,
      stateTable: !stateCheck.error,
      responseLedger: !ledgerCheck.error,
      ingressLog: !ingressCheck.error,
    };

    const lastIngress = ingressCheck.data?.[0] || null;
    checks.webhookDelivery = lastIngress ? {
      received: true,
      signatureValid: Boolean(lastIngress.signature_valid),
      field: lastIngress.field_name || null,
      receivedAt: lastIngress.created_at || null,
    } : checks.webhookDelivery;

    const lastEvent = eventCheck.data?.[0] || null;
    if (lastEvent?.comment_id) {
      checks.lastAutomation = {
        found: true,
        publicStatus: lastEvent.public_status || null,
        privateStatus: lastEvent.private_status || null,
        publicReplyVisible: null,
        replyCount: null,
        replyCheckError: null,
      };

      if (lastEvent.media_id) {
        const comments = await metaGet(
          String(lastEvent.media_id) + '/comments?fields=id,text,hidden,from,username,replies.limit(50){id,text,hidden,from,username}&limit=100',
          token
        );

        if (comments.ok) {
          const allComments = comments.payload?.data || [];
          const publicId = String(lastEvent.public_reply_id || '');

          if (lastEvent.public_delivery_mode === 'top_level_mention') {
            const publicComment = allComments.find((comment) => String(comment?.id || '') === publicId) || null;
            checks.lastAutomation.replyCount = publicComment ? 1 : 0;
            checks.lastAutomation.publicReplyVisible = Boolean(publicComment);
            checks.lastAutomation.replyHidden = publicComment ? Boolean(publicComment?.hidden) : null;
            checks.lastAutomation.replyTexts = publicComment ? [{
              id: String(publicComment?.id || ''),
              text: String(publicComment?.text || '').slice(0, 120),
              hidden: Boolean(publicComment?.hidden),
              username: String(publicComment?.from?.username || publicComment?.username || ''),
            }] : [];
            checks.lastAutomation.replyCheckError = publicComment ? null : {
              status: 404,
              code: null,
              message: 'Resposta pública não apareceu na listagem da mídia.',
            };
          } else {
            const matchedComment = allComments.find(
              (comment) => String(comment?.id || '') === String(lastEvent.comment_id)
            ) || null;

            if (matchedComment) {
              const replies = Array.isArray(matchedComment?.replies?.data) ? matchedComment.replies.data : [];
              checks.lastAutomation.replyCount = replies.length;
              checks.lastAutomation.publicReplyVisible = replies.some((reply) => (
                String(reply?.id || '') === publicId
              ));
              checks.lastAutomation.replyHidden = replies
                .filter((reply) => String(reply?.id || '') === publicId)
                .map((reply) => Boolean(reply?.hidden))[0] ?? null;
              checks.lastAutomation.replyTexts = replies.map((reply) => ({
                id: String(reply?.id || ''),
                text: String(reply?.text || '').slice(0, 120),
                hidden: Boolean(reply?.hidden),
                username: String(reply?.from?.username || reply?.username || ''),
              }));
              checks.lastAutomation.replyCheckError = null;
            } else {
              checks.lastAutomation.replyCheckError = {
                status: 404,
                code: null,
                message: 'Comentário não apareceu na listagem da mídia.',
              };
            }
          }
        } else {
          checks.lastAutomation.replyCheckError = {
            status: comments.status || null,
            code: comments.code || null,
            message: comments.message || null,
          };
        }
      } else {
        checks.lastAutomation.replyCheckError = {
          status: 404,
          code: null,
          message: 'Evento antigo sem media_id para conferência.',
        };
      }
    }
  }

  const ready =
    checks.credentials.instagramToken &&
    checks.credentials.appSecret &&
    checks.credentials.webhookVerifyToken &&
    checks.credentials.supabase &&
    checks.instagram.ok &&
    String(checks.instagram.username || '').toLowerCase() === 'gui_nonato' &&
    checks.subscriptions.ok &&
    checks.database.ok;

  return Response.json({
    ready,
    checks,
    testedAt: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
