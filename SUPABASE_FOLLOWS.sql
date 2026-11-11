-- KONTA: follow subscriptions and secure server-side follow notifications.
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_pkey primary key (follower_id, followed_id),
  constraint follows_not_self check (follower_id <> followed_id)
);
create index if not exists follows_followed_id_idx on public.follows(followed_id);
alter table public.follows enable row level security;

drop policy if exists "konta follows view" on public.follows;
create policy "konta follows view" on public.follows
  for select to authenticated using (true);
drop policy if exists "konta follows insert" on public.follows;
create policy "konta follows insert" on public.follows
  for insert to authenticated with check ((select auth.uid()) = follower_id);
drop policy if exists "konta follows delete" on public.follows;
create policy "konta follows delete" on public.follows
  for delete to authenticated using ((select auth.uid()) = follower_id);
grant select, insert, delete on public.follows to authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('like','comment','friend','message','follow'));

create schema if not exists private;
create or replace function private.konta_follow_notification()
returns trigger language plpgsql security definer set search_path = ''
as $func$
begin
  if new.followed_id <> new.follower_id then
    insert into public.notifications(target_id, actor_id, kind)
      values (new.followed_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$func$;
revoke all on function private.konta_follow_notification() from public, anon, authenticated;
drop trigger if exists konta_follow_notify on public.follows;
create trigger konta_follow_notify
  after insert on public.follows for each row
  execute function private.konta_follow_notification();