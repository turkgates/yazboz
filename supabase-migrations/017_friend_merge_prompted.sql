-- Track whether merge prompt was shown after friend accept

alter table public.friend_requests
  add column if not exists merge_prompted boolean default false;
