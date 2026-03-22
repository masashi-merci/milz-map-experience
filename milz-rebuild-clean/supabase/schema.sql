create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','user')) default 'user',
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists spots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  website text,
  image_url text,
  country text not null,
  region text not null,
  city text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  category text not null check (category in ('sightseeing','food','other')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_type text not null check (item_type in ('spot','recommendation','trend')),
  item_key text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_key)
);

create table if not exists ai_cache (
  id uuid primary key default gen_random_uuid(),
  cache_type text not null check (cache_type in ('recommendation','trend')),
  region_key text not null,
  payload_json jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (cache_type, region_key)
);

alter table profiles enable row level security;
alter table spots enable row level security;
alter table favorites enable row level security;
alter table ai_cache enable row level security;

create policy if not exists "profiles self read" on profiles for select using (auth.uid() = id);
create policy if not exists "profiles self write" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

create policy if not exists "spots public read" on spots for select using (true);
create policy if not exists "spots admin write" on spots for insert with check (
  exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy if not exists "spots admin update" on spots for update using (
  exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy if not exists "spots admin delete" on spots for delete using (
  exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy if not exists "favorites self read" on favorites for select using (auth.uid() = user_id);
create policy if not exists "favorites self insert" on favorites for insert with check (auth.uid() = user_id);
create policy if not exists "favorites self delete" on favorites for delete using (auth.uid() = user_id);

create policy if not exists "ai cache read" on ai_cache for select using (true);
