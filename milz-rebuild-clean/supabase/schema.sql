
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::text, 'user'),
    coalesce((new.raw_user_meta_data ->> 'display_name')::text, new.email)
  )
  on conflict (id) do update set
    role = excluded.role,
    display_name = excluded.display_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin');
$$;

alter table profiles enable row level security;
alter table spots enable row level security;
alter table favorites enable row level security;
alter table ai_cache enable row level security;

create policy if not exists "profiles self read" on profiles for select to authenticated using (auth.uid() = id);
create policy if not exists "profiles self update" on profiles for update to authenticated using (auth.uid() = id);

create policy if not exists "spots read all" on spots for select to authenticated using (true);
create policy if not exists "spots insert admin" on spots for insert to authenticated with check (public.is_admin(auth.uid()));
create policy if not exists "spots update admin" on spots for update to authenticated using (public.is_admin(auth.uid()));
create policy if not exists "spots delete admin" on spots for delete to authenticated using (public.is_admin(auth.uid()));

create policy if not exists "favorites read own" on favorites for select to authenticated using (auth.uid() = user_id);
create policy if not exists "favorites insert own" on favorites for insert to authenticated with check (auth.uid() = user_id);
create policy if not exists "favorites update own" on favorites for update to authenticated using (auth.uid() = user_id);
create policy if not exists "favorites delete own" on favorites for delete to authenticated using (auth.uid() = user_id);
