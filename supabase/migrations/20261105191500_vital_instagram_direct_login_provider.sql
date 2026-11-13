-- Planned change only. Do not apply until Instagram Login credentials, webhook
-- subscriptions, and application review have been verified for Vital Decor.
ALTER TABLE public.workspace_meta_connections
  ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'facebook';
ALTER TABLE public.workspace_meta_connections
  DROP CONSTRAINT IF EXISTS workspace_meta_connections_auth_provider_check;
ALTER TABLE public.workspace_meta_connections
  ADD CONSTRAINT workspace_meta_connections_auth_provider_check
  CHECK (auth_provider IN ('facebook', 'instagram_login'));
COMMENT ON COLUMN public.workspace_meta_connections.auth_provider
  IS 'Instagram authorization API family: facebook or direct Instagram Login. WhatsApp stays facebook.';
