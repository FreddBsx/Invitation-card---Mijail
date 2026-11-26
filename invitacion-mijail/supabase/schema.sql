-- Crea la tabla de respuestas para la invitación.
create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  normalized_name text not null unique,
  attendance text not null check (attendance in ('yes', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Las invitaciones públicas solo pueden guardar respuestas a través de la función privada de Vercel.
alter table public.rsvps enable row level security;
revoke all on table public.rsvps from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on table public.rsvps to service_role;
