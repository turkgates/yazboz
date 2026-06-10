-- Allow authenticated users to read profiles (needed for group members, friends list)
alter table profiles enable row level security;

drop policy if exists "Profiller okunabilir" on profiles;
create policy "Profiller okunabilir"
  on profiles for select
  to authenticated
  using (true);

drop policy if exists "Kullanıcı kendi profilini günceller" on profiles;
create policy "Kullanıcı kendi profilini günceller"
  on profiles for update
  using (id = auth.uid());

drop policy if exists "Kullanıcı kendi profilini oluşturur" on profiles;
create policy "Kullanıcı kendi profilini oluşturur"
  on profiles for insert
  with check (id = auth.uid());
