-- Reliable friend request send via security definer RPC

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

grant execute on function public.send_friend_request(uuid) to authenticated;
