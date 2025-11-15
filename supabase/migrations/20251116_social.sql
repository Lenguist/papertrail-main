-- Social features schema: profiles, follows, posts, and status constraint
-- Idempotent-ish creation with IF NOT EXISTS where supported

-- 1) profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Case-insensitive unique username
create unique index if not exists profiles_username_ci_unique on public.profiles (lower(username));

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles are publicly readable'
  ) then
    create policy "profiles are publicly readable"
      on public.profiles for select
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'users can insert their own profile'
  ) then
    create policy "users can insert their own profile"
      on public.profiles for insert
      with check (auth.uid() = id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'users can update their own profile'
  ) then
    create policy "users can update their own profile"
      on public.profiles for update
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end $$;

-- 2) follows (directed)
create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  constraint follows_unique unique (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists idx_follows_follower on public.follows (follower_id);
create index if not exists idx_follows_following on public.follows (following_id);

alter table public.follows enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'follows' and policyname = 'follows are publicly readable'
  ) then
    create policy "follows are publicly readable"
      on public.follows for select
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'follows' and policyname = 'user can follow others'
  ) then
    create policy "user can follow others"
      on public.follows for insert
      with check (auth.uid() = follower_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'follows' and policyname = 'user can unfollow'
  ) then
    create policy "user can unfollow"
      on public.follows for delete
      using (auth.uid() = follower_id);
  end if;
end $$;

-- 3) posts (feed items)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, -- 'added_to_library' | 'status_changed' | 'reviewed' (future)
  openalex_id text,
  status text,  -- for status_changed
  rating int,   -- for reviewed (future)
  note text,    -- optional short note
  created_at timestamptz default now()
);

create index if not exists idx_posts_user_created on public.posts (user_id, created_at desc);
create index if not exists idx_posts_openalex on public.posts (openalex_id);

alter table public.posts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts are publicly readable'
  ) then
    create policy "posts are publicly readable"
      on public.posts for select
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'user can create their own posts'
  ) then
    create policy "user can create their own posts"
      on public.posts for insert
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'user can manage their own posts'
  ) then
    create policy "user can manage their own posts"
      on public.posts for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'user can delete their own posts'
  ) then
    create policy "user can delete their own posts"
      on public.posts for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- 4) user_papers.status CHECK + default
-- Add constraint only if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_papers_status_valid'
  ) then
    alter table public.user_papers
      add constraint user_papers_status_valid
      check (status in ('to_read','reading','read'));
  end if;
end $$;

alter table public.user_papers alter column status set default 'to_read';