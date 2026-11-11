const scalar=value=>typeof value==='string'||typeof value==='number'?value:null;
const text=value=>typeof value==='string'?value:null;
const localized=value=>text(value)||text(value?.pt)||text(value?.es)||text(value?.en);

// Allowlist CRM fields. Never return raw API responses, addresses, documents,
// authentication tokens, private checkout URLs or provider error bodies.
export function projectNuvemshop(resource, rows) {
  if (!Array.isArray(rows)) throw new Error('Resposta inválida.');
  if (!['products','customers','orders','checkouts'].includes(resource)) throw new Error('Recurso não permitido.');
  return rows.map(item=>{
    if (!item || typeof item!=='object' || Array.isArray(item)) return null;
    if(resource==='products')return {
      id:scalar(item.id), name:localized(item.name), published:typeof item.published==='boolean'?item.published:null,
      variants:(Array.isArray(item.variants)?item.variants:[]).slice(0,100).map(v=>({
        id:scalar(v?.id),price:scalar(v?.price),stock:scalar(v?.stock),
      })),
    };
    if(resource==='customers')return {
      id:scalar(item.id), name:text(item.name), email:text(item.email), phone:text(item.phone),
      acceptsMarketing:typeof item.accepts_marketing==='boolean'?item.accepts_marketing:null,
      totalSpent:scalar(item.total_spent),
    };
    if(resource==='orders')return {
      id:scalar(item.id),number:scalar(item.number),createdAt:text(item.created_at),
      status:text(item.status),paymentStatus:text(item.payment_status),total:scalar(item.total),
      currency:text(item.currency),customer:item.customer?{
        id:scalar(item.customer.id),name:text(item.customer.name),
      }:null,
      products:(Array.isArray(item.products)?item.products:[]).slice(0,100).map(p=>({
        name:localized(p?.name),quantity:scalar(p?.quantity),
      })),
    };
    if(resource==='checkouts')return {
      id:scalar(item.id),createdAt:text(item.created_at),updatedAt:text(item.updated_at),
      name:text(item.contact_name),email:text(item.contact_email),phone:text(item.contact_phone),
      total:scalar(item.total),
    };
    throw new Error('Recurso não permitido.');
  }).filter(Boolean);
}
