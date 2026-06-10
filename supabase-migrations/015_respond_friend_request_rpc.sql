-- Accept/reject friend requests via RPC (creates both friendship rows)
-- Also repair send_friend_request for already-accepted-but-missing-friends

create or replace function public.respond_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_req public.friend_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select * into v_req
  from public.friend_requests
  where id = p_request_id
    and receiver_id = v_user_id
    and status = 'pending';

  if not found then
    raise exception 'İstek bulunamadı veya zaten yanıtlandı';
  end if;

  if p_accept then
    update public.friend_requests
    set status = 'accepted'
    where id = p_request_id;

    insert into public.friends (user_id, friend_id)
    values (v_req.sender_id, v_req.receiver_id), (v_req.receiver_id, v_req.sender_id)
    on conflict (user_id, friend_id) do nothing;

    return jsonb_build_object(
      'accepted', true,
      'sender_id', v_req.sender_id,
      'receiver_id', v_req.receiver_id
    );
  end if;

  update public.friend_requests
  set status = 'rejected'
  where id = p_request_id;

  return jsonb_build_object('accepted', false);
end;
$$;

alter function public.respond_friend_request(uuid, boolean) owner to postgres;
revoke all on function public.respond_friend_request(uuid, boolean) from public;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- send_friend_request: friends kontrolü + kabul edilmiş ama eksik kayıt onarımı
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

  if exists (
    select 1 from public.friends
    where user_id = v_sender_id and friend_id = p_receiver_id
  ) then
    raise exception 'Zaten arkadaşsınız';
  end if;

  -- Onarım: kabul edilmiş istek var ama friends kaydı eksik
  if exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and (
        (sender_id = v_sender_id and receiver_id = p_receiver_id)
        or (sender_id = p_receiver_id and receiver_id = v_sender_id)
      )
  ) then
    insert into public.friends (user_id, friend_id)
    values (v_sender_id, p_receiver_id), (p_receiver_id, v_sender_id)
    on conflict (user_id, friend_id) do nothing;
    raise exception 'Zaten arkadaşsınız';
  end if;

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
    on conflict (user_id, friend_id) do nothing;

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
      insert into public.friends (user_id, friend_id)
      values (v_sender_id, p_receiver_id), (p_receiver_id, v_sender_id)
      on conflict (user_id, friend_id) do nothing;
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

-- Mevcut kabul edilmiş istekler için eksik friends kayıtlarını onar
insert into public.friends (user_id, friend_id)
select fr.sender_id, fr.receiver_id
from public.friend_requests fr
where fr.status = 'accepted'
  and not exists (
    select 1 from public.friends f
    where f.user_id = fr.sender_id and f.friend_id = fr.receiver_id
  )
on conflict (user_id, friend_id) do nothing;

insert into public.friends (user_id, friend_id)
select fr.receiver_id, fr.sender_id
from public.friend_requests fr
where fr.status = 'accepted'
  and not exists (
    select 1 from public.friends f
    where f.user_id = fr.receiver_id and f.friend_id = fr.sender_id
  )
on conflict (user_id, friend_id) do nothing;
