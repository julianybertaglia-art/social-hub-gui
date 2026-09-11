create index if not exists whatsapp_ai_suggestions_user_idx
  on public.whatsapp_ai_suggestions(user_id);
create index if not exists whatsapp_ai_suggestions_inbound_message_idx
  on public.whatsapp_ai_suggestions(inbound_message_id);
