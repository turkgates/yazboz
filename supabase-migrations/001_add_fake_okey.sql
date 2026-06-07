-- Mevcut veritabanlarına fake_okey kolonu ekle
alter table rounds add column if not exists fake_okey boolean default false;
