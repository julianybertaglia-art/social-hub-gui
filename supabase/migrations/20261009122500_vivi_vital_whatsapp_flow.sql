-- Viva/Vivi: isolated WhatsApp automation for Vital Decor (never in Gui CRM).
CREATE TABLE IF NOT EXISTS public.vital_whatsapp_flow_configs (
  connection_id uuid PRIMARY KEY REFERENCES public.workspace_meta_connections(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  bluetti_catalog_url text,
  wholesale_catalog_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safe_bluetti_catalog CHECK (bluetti_catalog_url IS NULL OR bluetti_catalog_url ~ '^https://[^[:space:]]+$'),
  CONSTRAINT safe_wholesale_catalog CHECK (wholesale_catalog_url IS NULL OR wholesale_catalog_url ~ '^https://[^[:space:]]+$')
);
CREATE TABLE IF NOT EXISTS public.vital_whatsapp_flow_sessions (
  connection_id uuid NOT NULL REFERENCES public.workspace_meta_connections(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  contact_wa_id text NOT NULL CHECK (contact_wa_id ~ '^[0-9]{8,15}$'),
  stage text NOT NULL DEFAULT 'menu',
  selection text,
  human_handoff boolean NOT NULL DEFAULT false,
  manual_override boolean NOT NULL DEFAULT false,
  last_interaction_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id,contact_wa_id)
);
CREATE TABLE IF NOT EXISTS public.vital_whatsapp_flow_events (
  connection_id uuid NOT NULL REFERENCES public.workspace_meta_connections(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  meta_message_id text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id,meta_message_id)
);
CREATE TABLE IF NOT EXISTS public.vital_whatsapp_affiliate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.workspace_meta_connections(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  contact_wa_id text NOT NULL CHECK (contact_wa_id ~ '^[0-9]{8,15}$'),
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted')),
  creator_name text,
  email text,
  city_state text,
  tiktok_url text,
  instagram_url text,
  niche text,
  followers integer,
  average_views integer,
  average_likes integer,
  average_comments integer,
  posts_per_week integer,
  brazil_audience_percent integer,
  affiliate_experience text,
  live_experience text,
  sales_last_30d_range text,
  sales_orders_last_30d integer,
  top_video_urls jsonb,
  score integer,
  qualification text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id,contact_wa_id)
);
ALTER TABLE public.vital_whatsapp_flow_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vital_whatsapp_flow_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vital_whatsapp_flow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vital_whatsapp_affiliate_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vital_whatsapp_flow_configs,public.vital_whatsapp_flow_sessions,public.vital_whatsapp_flow_events,public.vital_whatsapp_affiliate_applications FROM anon,authenticated;
GRANT ALL ON public.vital_whatsapp_flow_configs,public.vital_whatsapp_flow_sessions,public.vital_whatsapp_flow_events,public.vital_whatsapp_affiliate_applications TO service_role;
CREATE INDEX IF NOT EXISTS vital_whatsapp_flow_sessions_handoff ON public.vital_whatsapp_flow_sessions(connection_id,human_handoff);
CREATE INDEX IF NOT EXISTS vital_whatsapp_affiliate_qualification ON public.vital_whatsapp_affiliate_applications(qualification,submitted_at DESC);
