import { getVitalCrmMember } from '../../../../lib/vital-crm-access.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };

export async function GET(request) {
  try {
    const { access } = await getVitalCrmMember(request);
    if (access.role !== 'owner') throw Object.assign(new Error('Disponível apenas para a administradora.'), { status: 403 });
    const store = Boolean(process.env.NUVEMSHOP_VITAL_STORE_ID && process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN);
    let ledger = false;
    if (store) {
      const { error } = await access.db.from('crm_vital_payment_recovery').select('entity_id').limit(1);
      ledger = !error;
    }
    const email = process.env.VITAL_RESEND_DOMAIN_VERIFIED === 'true' && Boolean(process.env.RESEND_API_KEY) &&
      process.env.VITAL_RECOVERY_EMAIL_FROM === 'Vital Decor <atendimento@vitaldecor.com.br>';
    const scheduler = process.env.VITAL_RECOVERY_SCHEDULER_ENABLED === 'true';
    const whatsapp = false;

    return Response.json({
      mode: 'preparation',
      sendingEnabled: process.env.VITAL_PAYMENT_RECOVERY_ENABLED === 'true' && email && ledger && scheduler,
      checks: [
        { id: 'store', label: 'Consulta de pedidos da Nuvemshop', ready: store },
        { id: 'ledger', label: 'Histórico persistente e antiduplicidade', ready: ledger },
        { id: 'email', label: 'Remetente e domínio de e-mail verificados', ready: email },
        { id: 'whatsapp', label: 'Consentimento e modelo aprovado da Meta', ready: whatsapp },
        { id: 'scheduler', label: 'Agendamento automático', ready: scheduler },
      ],
      explanation: 'Os envios permanecem desativados até todas as verificações necessárias serem concluídas.',
    }, { headers });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Não foi possível consultar a preparação.' },
      { status: error.status || 503, headers });
  }
}
