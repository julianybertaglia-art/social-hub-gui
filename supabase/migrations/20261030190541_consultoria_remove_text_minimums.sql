alter table public.consultoria_applications
  drop constraint if exists consultoria_applications_name_check,
  add constraint consultoria_applications_name_check check (length(name) between 1 and 120),
  drop constraint if exists consultoria_applications_product_check,
  add constraint consultoria_applications_product_check check (length(product) between 1 and 300),
  drop constraint if exists consultoria_applications_challenge_check,
  add constraint consultoria_applications_challenge_check check (length(challenge) between 1 and 1500);
