-- Friend request: sender can delete/resubmit rejected requests

drop policy if exists "Gönderen isteği silebilir" on friend_requests;
create policy "Gönderen isteği silebilir"
  on friend_requests for delete
  using (sender_id = auth.uid());

drop policy if exists "Gönderen isteği günceller" on friend_requests;
create policy "Gönderen isteği günceller"
  on friend_requests for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());
