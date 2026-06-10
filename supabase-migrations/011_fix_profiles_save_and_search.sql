-- Fix profile save (upsert) and username search

alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists bio text;

alter table profiles enable row level security;

-- SELECT: authenticated users can read profiles (friend search, group members)
drop policy if exists "Kullanıcı kendi profilini görür" on profiles;
drop policy if exists "Profiller okunabilir" on profiles;
create policy "Profiller okunabilir"
  on profiles for select
  to authenticated
  using (true);

-- INSERT
drop policy if exists "Kullanıcı kendi profilini oluşturur" on profiles;
create policy "Kullanıcı kendi profilini oluşturur"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

-- UPDATE (with check for upsert)
drop policy if exists "Kullanıcı kendi profilini güncelleyebilir" on profiles;
drop policy if exists "Kullanıcı kendi profilini günceller" on profiles;
create policy "Kullanıcı kendi profilini günceller"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Username search (bypasses RLS edge cases)
create or replace function public.search_profile_by_username(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where lower(trim(p.username)) = lower(trim(both '@' from p_username))
  limit 1;
$$;

create or replace function public.check_username_available(
  p_username text,
  p_exclude_user_id uuid default null
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(trim(username)) = lower(trim(p_username))
      and (p_exclude_user_id is null or id <> p_exclude_user_id)
  );
$$;

grant execute on function public.search_profile_by_username(text) to authenticated;
grant execute on function public.check_username_available(text, uuid) to authenticated;
