-- Fix friend_requests INSERT RLS + ensure send_friend_request RPC bypasses RLS

-- Tüm mevcut politikaları temizle
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'friend_requests'
  loop
    execute format('drop policy if exists %I on public.friend_requests', pol.policyname);
  end loop;
end $$;

alter table public.friend_requests enable row level security;

-- Tablo izinleri
grant select, insert, update, delete on public.friend_requests to authenticated;

create policy "friend_requests_select"
  on public.friend_requests for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "friend_requests_insert"
  on public.friend_requests for insert
  to authenticated
  with check (
    auth.uid() is not null
    and sender_id = auth.uid()
    and receiver_id <> auth.uid()
  );

create policy "friend_requests_update_receiver"
  on public.friend_requests for update
  to authenticated
  using (receiver_id = auth.uid())
  with check (receiver_id = auth.uid());

create policy "friend_requests_update_sender"
  on public.friend_requests for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy "friend_requests_delete_sender"
  on public.friend_requests for delete
  to authenticated
  using (sender_id = auth.uid());

-- friends tablosu: RPC otomatik kabul için
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'friends'
  loop
    execute format('drop policy if exists %I on public.friends', pol.policyname);
  end loop;
end $$;

alter table public.friends enable row level security;
grant select, insert, delete on public.friends to authenticated;

create policy "friends_select"
  on public.friends for select
  to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

create policy "friends_insert"
  on public.friends for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "friends_delete"
  on public.friends for delete
  to authenticated
  using (user_id = auth.uid());

-- RPC: supabase_admin sahibi → RLS bypass
create or replace function public.send_friend_request(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_existing public.friend_requests%rowtype;
  v_reverse public.friend_requests%rowtype;
  v_new_id uuid;
begin
  if v_sender_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if v_sender_id = p_receiver_id then
    raise exception 'Kendine istek gönderemezsin';
  end if;

  if not exists (select 1 from public.profiles where id = p_receiver_id) then
    raise exception 'Kullanıcı bulunamadı';
  end if;

  -- Karşı taraf zaten istek gönderdiyse otomatik kabul et
  select * into v_reverse
  from public.friend_requests
  where sender_id = p_receiver_id
    and receiver_id = v_sender_id
    and status = 'pending';

  if found then
    update public.friend_requests
    set status = 'accepted'
    where id = v_reverse.id;

    insert into public.friends (user_id, friend_id)
    values (v_sender_id, p_receiver_id), (p_receiver_id, v_sender_id)
    on conflict do nothing;

    return v_reverse.id;
  end if;

  select * into v_existing
  from public.friend_requests
  where sender_id = v_sender_id
    and receiver_id = p_receiver_id;

  if found then
    if v_existing.status = 'pending' then
      raise exception 'Bu kullanıcıya zaten istek gönderdin';
    elsif v_existing.status = 'accepted' then
      raise exception 'Zaten arkadaşsınız';
    elsif v_existing.status = 'rejected' then
      delete from public.friend_requests where id = v_existing.id;
    else
      raise exception 'Bu kullanıcıya zaten istek gönderdin';
    end if;
  end if;

  insert into public.friend_requests (sender_id, receiver_id, status)
  values (v_sender_id, p_receiver_id, 'pending')
  returning id into v_new_id;

  return v_new_id;
end;
$$;

alter function public.send_friend_request(uuid) owner to postgres;

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;
