-- KAREEM Chemistry security hardening migration
-- Run once in Supabase SQL Editor before deploying the matching application branch.

-- Column-level permissions: students may update only their display name.
revoke update on table public.student_profiles from authenticated;
grant update (display_name) on table public.student_profiles to authenticated;

-- Validate question bank structure at the database boundary as well as in the API.
alter table public.admin_questions
  drop constraint if exists admin_questions_options_length_check;
alter table public.admin_questions
  add constraint admin_questions_options_length_check
  check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6);
alter table public.admin_questions
  drop constraint if exists admin_questions_correct_answer_check;
alter table public.admin_questions
  add constraint admin_questions_correct_answer_check
  check (correct_answer >= 0 and correct_answer < jsonb_array_length(options));
alter table public.admin_questions
  drop constraint if exists admin_questions_explanation_length_check;
alter table public.admin_questions
  add constraint admin_questions_explanation_length_check
  check (char_length(explanation) <= 2000);

-- Private server-side quiz attempts. No direct client access.
create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_ids uuid[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 hours')
);
create index if not exists question_attempts_user_expiry_idx
  on public.question_attempts(user_id, expires_at);

create table if not exists public.question_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.question_attempts(id) on delete cascade,
  question_id uuid not null references public.admin_questions(id) on delete cascade,
  selected_answer integer not null check (selected_answer between 0 and 5),
  correct_answer integer not null check (correct_answer between 0 and 5),
  is_correct boolean not null,
  explanation text not null default '',
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

alter table public.question_attempts enable row level security;
alter table public.question_attempt_answers enable row level security;
revoke all on public.question_attempts from public, anon, authenticated;
revoke all on public.question_attempt_answers from public, anon, authenticated;
grant all on public.question_attempts to service_role;
grant all on public.question_attempt_answers to service_role;

-- Atomic per-IP/API-scope rate limiting. Keys are SHA-256 hashes, not raw IPs.
create table if not exists public.api_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count >= 0)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
grant all on public.api_rate_limits to service_role;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(p_key) <> 64 then
    return false;
  end if;
  insert into public.api_rate_limits(rate_key, window_started_at, hit_count)
  values (p_key, now(), 1)
  on conflict (rate_key) do update
    set window_started_at = case
          when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
          then now() else public.api_rate_limits.window_started_at end,
        hit_count = case
          when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
          then 1 else public.api_rate_limits.hit_count + 1 end
  returning hit_count into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Keep the rate-limit table compact; expired buckets are harmless and can be
-- periodically pruned by a scheduled database job if traffic grows.
