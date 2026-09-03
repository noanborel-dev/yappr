-- Beta schema: identity, entitlement, and abuse counters.
--
-- Design of record: docs/superpowers/specs/2026-08-31-hosted-inference-beta-design.md
-- Tier contents: docs/ARCHITECTURE.md
--
-- TWO RULES THIS FILE ENFORCES STRUCTURALLY
--
--  1. No transcript text is stored. Anywhere. The FAQ promises text is
--     "never stored, never sold, never used to train anything", and
--     behind the proxy that is our promise rather than the provider's.
--     Every column below is a count, a timestamp or an identity. If a
--     future migration adds a text column that could hold user content,
--     that promise breaks and the copy has to change first.
--
--  2. A client can never grant itself a plan. profiles.state is written
--     only by the service role (the Paddle webhook and the Edge
--     Function). The single client-facing policy is SELECT on your own
--     row -- with no UPDATE policy, RLS denies the write outright.
--
-- No Storage bucket is required. Nothing in this product stores files.

-- ---------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------

-- Closed beta allowlist. Sign-up is refused for anything not in here,
-- which is what makes "closed" a property of the database rather than of
-- who happens to know the URL.
create table public.invited_emails (
  email      text primary key,
  invited_at timestamptz not null default now(),
  -- Stored lowercase so the allowlist check cannot be defeated by
  -- capitalisation. A constraint rather than a convention: this fails
  -- loudly at insert instead of silently letting someone in.
  constraint invited_emails_lowercase check (email = lower(email))
);

create table public.profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  -- Mirrors Plan in src/shared/entitlements.ts. Kept as a check
  -- constraint rather than an enum so adding a tier is a migration, not
  -- a type rewrite.
  state            text not null default 'beta'
                     check (state in ('free', 'pro_trial', 'pro', 'beta')),
  trial_started_at timestamptz,
  pro_since        timestamptz,
  -- Instant kill switch for one account, checked on every proxied call.
  revoked          boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Abuse counters -- counts only, never content
-- ---------------------------------------------------------------------

-- Burst guard. 20 req/min is roughly 3x the fastest sustained human
-- dictation rate, so it catches runaway loops and no real user.
create table public.usage_minute (
  user_id  uuid not null references auth.users(id) on delete cascade,
  bucket   timestamptz not null,
  requests integer not null default 0,
  primary key (user_id, bucket)
);

-- The Free tier's 2,000 words/week. Bucketed by ISO week SERVER-SIDE so
-- a client clock cannot buy extra words by changing timezone.
create table public.usage_week (
  user_id  uuid not null references auth.users(id) on delete cascade,
  iso_week text not null,          -- e.g. '2026-W36'
  words    integer not null default 0,
  primary key (user_id, iso_week)
);

-- Global daily ceiling: the only protection against a failure class we
-- have not thought of. Bounds worst-case spend regardless of user count,
-- a leaked token, or a bug in the per-user counters above.
create table public.usage_day_global (
  day    date primary key,
  tokens bigint not null default 0
);

-- ---------------------------------------------------------------------
-- RLS -- deny by default, one narrow grant
-- ---------------------------------------------------------------------

alter table public.invited_emails   enable row level security;
alter table public.profiles         enable row level security;
alter table public.usage_minute     enable row level security;
alter table public.usage_week       enable row level security;
alter table public.usage_day_global enable row level security;

-- The ONLY client-facing policy. Everything else has RLS on and no
-- policy, which denies anon and authenticated entirely; the service role
-- bypasses RLS and is the sole writer.
--
-- Note there is deliberately no UPDATE policy: a user reading
-- "state = 'free'" must not be able to write "state = 'pro'".
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Sign-up
-- ---------------------------------------------------------------------

-- Refuse anyone not invited. Runs BEFORE the user row exists, so an
-- uninvited sign-up leaves nothing behind to clean up.
create or replace function public.enforce_beta_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.invited_emails where email = lower(new.email)
  ) then
    raise exception 'not_invited' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger enforce_beta_allowlist
  before insert on auth.users
  for each row execute function public.enforce_beta_allowlist();

-- Every user gets a profile at sign-up, so the proxy never has to handle
-- "authenticated but no entitlement row".
--
-- Beta testers land in 'beta', which is Pro. trial_started_at is stamped
-- now so the 7-day trial machinery has a start date to work from when
-- beta ends and they drop to 'free'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, state, trial_started_at)
  values (new.id, lower(new.email), 'beta', now());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Minute buckets accumulate one row per active minute per user. At beta
-- scale that is noise; before public launch, add a scheduled delete for
-- buckets older than a day.
