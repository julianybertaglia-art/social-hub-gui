-- The TikTok Content Posting API can transfer a video to the creator's inbox
-- for them to finish as a draft; distinguish this from actual published posts.
alter table public.multichannel_post_targets
  drop constraint if exists multichannel_post_targets_state_check;
alter table public.multichannel_post_targets
  add constraint multichannel_post_targets_state_check
    check (state in ('ready','sending','processing','published','private',
                    'pending_approval','failed','unknown','draft'));