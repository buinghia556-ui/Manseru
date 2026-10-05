-- Giả lập tối thiểu các phần của Supabase (auth, storage, vai trò) để chạy
-- thử migration trên Postgres thường. Chỉ dùng cho kiểm thử cục bộ.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid default auth.uid()
);
alter table storage.objects enable row level security;

grant usage on schema public, auth, storage to anon, authenticated;
grant select, insert on storage.objects to authenticated;
-- Giống Supabase: mặc định anon/authenticated có mọi quyền trên bảng và hàm mới.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
