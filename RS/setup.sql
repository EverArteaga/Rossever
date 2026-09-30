-- Ejecuta esto en Supabase → SQL Editor
--
-- Antes o después, crea tu usuario de acceso al panel en:
-- Supabase → Authentication → Users → Add user (correo + contraseña).
-- Desactiva "Confirm email" en Authentication → Providers → Email
-- si no quieres tener que confirmar el correo antes de poder entrar.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('text', 'video')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- Lectura pública (Rossi ve el feed)
create policy "posts_select_public"
  on public.posts for select
  to anon using (true);

-- Inserción solo para quien inició sesión (el panel de admin)
create policy "posts_insert_authenticated"
  on public.posts for insert
  to authenticated with check (true);

-- Borrado solo para quien inició sesión (para corregir errores)
create policy "posts_delete_authenticated"
  on public.posts for delete
  to authenticated using (true);

-- Tiempo real: las publicaciones nuevas aparecen sin recargar
alter publication supabase_realtime add table public.posts;

-- ============================================================
-- Notificaciones push (Android/Chrome)
-- ============================================================

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Cualquiera puede suscribirse desde el feed (Rossi, al aceptar el permiso)
create policy "push_insert_public"
  on public.push_subscriptions for insert
  to anon with check (true);

-- Solo el panel de admin necesita leerlas (la Edge Function usa la service role,
-- así que no necesita esta política, pero no está de más tenerla por si acaso)
create policy "push_select_authenticated"
  on public.push_subscriptions for select
  to authenticated using (true);
