-- KCG GHP Audit Report - shared Supabase schema
-- Browser users sign in anonymously, so they use the authenticated role.

create table if not exists public.audits (
  id text primary key,
  payload jsonb not null,
  site text,
  zone text,
  area text,
  audit_month text,
  audit_date date,
  audit_type text,
  status text not null default 'draft',
  created_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists audits_updated_at_idx on public.audits (updated_at desc);
create index if not exists audits_site_month_idx on public.audits (site, audit_month);

create table if not exists public.app_settings (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.audits enable row level security;
alter table public.app_settings enable row level security;

revoke all on public.audits from anon;
revoke all on public.app_settings from anon;
grant select, insert, update, delete on public.audits to authenticated;
grant select, insert, update on public.app_settings to authenticated;

drop policy if exists "authenticated read audits" on public.audits;
drop policy if exists "authenticated insert audits" on public.audits;
drop policy if exists "authenticated update audits" on public.audits;
drop policy if exists "authenticated delete audits" on public.audits;
create policy "authenticated read audits" on public.audits for select to authenticated using (true);
create policy "authenticated insert audits" on public.audits for insert to authenticated with check (auth.uid() = created_by);
create policy "authenticated update audits" on public.audits for update to authenticated using (true) with check (true);
create policy "authenticated delete audits" on public.audits for delete to authenticated using (true);

drop policy if exists "authenticated read settings" on public.app_settings;
drop policy if exists "authenticated insert settings" on public.app_settings;
drop policy if exists "authenticated update settings" on public.app_settings;
create policy "authenticated read settings" on public.app_settings for select to authenticated using (true);
create policy "authenticated insert settings" on public.app_settings for insert to authenticated with check (true);
create policy "authenticated update settings" on public.app_settings for update to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audit-photos',
  'audit-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated upload audit photos" on storage.objects;
drop policy if exists "authenticated read audit photos" on storage.objects;
drop policy if exists "authenticated update audit photos" on storage.objects;
drop policy if exists "authenticated delete audit photos" on storage.objects;
create policy "authenticated read audit photos" on storage.objects for select to authenticated
  using (bucket_id = 'audit-photos');
create policy "authenticated upload audit photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'audit-photos');
create policy "authenticated update audit photos" on storage.objects for update to authenticated
  using (bucket_id = 'audit-photos') with check (bucket_id = 'audit-photos');
create policy "authenticated delete audit photos" on storage.objects for delete to authenticated
  using (bucket_id = 'audit-photos');
