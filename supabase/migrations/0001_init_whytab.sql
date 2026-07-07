create extension if not exists "pgcrypto";

create table if not exists public.shortcut_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#14B8A6',
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shortcuts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.shortcut_groups(id) on delete set null,
  title text not null,
  url text not null,
  icon_url text,
  icon_color text not null default '#14B8A6',
  pinned boolean not null default false,
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  widget_key text not null,
  enabled boolean not null default true,
  layout jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id, widget_key)
);

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '随手笔记',
  body text not null default '',
  conflict_body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.countdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'primary',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.exchange_rate_cache (
  id text primary key default 'boc-usd-jpy',
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.shortcut_groups enable row level security;
alter table public.shortcuts enable row level security;
alter table public.widgets enable row level security;
alter table public.todos enable row level security;
alter table public.notes enable row level security;
alter table public.countdowns enable row level security;
alter table public.settings enable row level security;
alter table public.sync_snapshots enable row level security;

drop policy if exists "Users own shortcut groups" on public.shortcut_groups;
drop policy if exists "Users own shortcuts" on public.shortcuts;
drop policy if exists "Users own widgets" on public.widgets;
drop policy if exists "Users own todos" on public.todos;
drop policy if exists "Users own notes" on public.notes;
drop policy if exists "Users own countdowns" on public.countdowns;
drop policy if exists "Users own settings" on public.settings;
drop policy if exists "Users own sync snapshots" on public.sync_snapshots;

create policy "Users own shortcut groups" on public.shortcut_groups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own shortcuts" on public.shortcuts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own widgets" on public.widgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own todos" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own countdowns" on public.countdowns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own sync snapshots" on public.sync_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists shortcuts_user_order_idx on public.shortcuts(user_id, sort_order);
create index if not exists todos_user_order_idx on public.todos(user_id, sort_order);
create index if not exists snapshots_user_updated_idx on public.sync_snapshots(user_id, updated_at desc);
