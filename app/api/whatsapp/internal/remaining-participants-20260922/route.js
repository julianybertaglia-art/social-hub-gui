import { getSupabaseAdmin, sendWhatsAppText } from '../../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KEY = 'rp-20260922-7f3d91c4';
const EVENT_KEY = 'imersao-2026-09-26';
const TO = '5511923990244';

const MESSAGE = `Participantes que ainda faltam tentar adicionar no grupo da Imersão:

Diogo Bernado — 11 97699-0740
Mary Verçosa — 11 93062-1997
Sebastião Gonçalvez — 11 94917-2528
Daniel Maestrelo — 11 91586-8822
Rafael Leony — 11 97047-5446
William de Jesus — 34 99274-7210
Getúlio de Jesus — 34 99932-4560
Carlos Daniel — 568765468/29 ⚠️ conferir número
Fernanda Ciardullo — 51 9985-9068
Gabriel Cavalcantti — 11 97961-3038
Rafael Quinalha — 11 95043-5189
Aguinaldo Proença — 11 94014-7936
Guilherme Sarmento — 11 94700-44855
Claudia Furlan — 19 99127-3521

Esses são os números que não entraram automaticamente ou ainda não tinham sido tentados. Adiciona um por um pelo WhatsApp.`;

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== KEY) {
    return Response.json({ ok: false }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();

  const { data: job, error: jobError } = await supabase
    .from('event_group_jobs')
    .select('last_status')
    .eq('event_key', EVENT_KEY)
    .maybeSingle();

  if (jobError) throw jobError;

  if (job?.last_status === 'manual_list_sent') {
    return Response.json({ ok: true, alreadySent: true });
  }

  const result = await sendWhatsAppText({ to: TO, text: MESSAGE });
  const messageId = result?.messages?.[0]?.id || result?.messageId || null;

  const { error: updateError } = await supabase
    .from('event_group_jobs')
    .update({ last_status: 'manual_list_sent', updated_at: new Date().toISOString() })
    .eq('event_key', EVENT_KEY);

  if (updateError) throw updateError;

  return Response.json({ ok: true, sent: true, messageId });
}
