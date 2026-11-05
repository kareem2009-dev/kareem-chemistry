-- KAREEM Chemistry account schema
-- Run once in Supabase SQL Editor. Never expose the service-role key in the browser.
create table if not exists public.student_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 2 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.student_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.student_profiles enable row level security;
alter table public.student_data enable row level security;
drop policy if exists "Students read own profile" on public.student_profiles;
create policy "Students read own profile" on public.student_profiles for select to authenticated
using (auth.uid() = id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Students update own display name" on public.student_profiles;
create policy "Students update own display name" on public.student_profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Students read own data" on public.student_data;
create policy "Students read own data" on public.student_data for select to authenticated
using (auth.uid() = user_id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Students insert own data" on public.student_data;
create policy "Students insert own data" on public.student_data for insert to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Students update own data" on public.student_data;
create policy "Students update own data" on public.student_data for update to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, update on public.student_profiles to authenticated;
grant select, insert, update on public.student_data to authenticated;
revoke all on public.student_profiles from anon;
revoke all on public.student_data from anon;
