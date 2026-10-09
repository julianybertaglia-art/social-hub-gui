-- Public business catalog files, uploaded with short-lived signed URLs.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('vital-public-catalogs','vital-public-catalogs',true,16000000,ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public=true,file_size_limit=16000000,allowed_mime_types=ARRAY['application/pdf'];
-- No direct anonymous or authenticated writes. Service role creates scoped upload tokens.
