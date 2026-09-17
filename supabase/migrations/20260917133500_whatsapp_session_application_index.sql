create index if not exists whatsapp_automation_sessions_application_idx
  on public.whatsapp_automation_sessions(influencer_application_id)
  where influencer_application_id is not null;
