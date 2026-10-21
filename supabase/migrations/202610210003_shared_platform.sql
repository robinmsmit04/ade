-- One shared platform for all email-confirmed accounts. Existing private crews and data stay private.
create table if not exists public.community_settings (
  singleton boolean primary key default true check (singleton),
  crew_id uuid not null unique references public.crews(id) on delete restrict
);
alter table public.community_settings enable row level security;
revoke all on public.community_settings from public, anon, authenticated;

do $$
declare community uuid;
begin
  select crew_id into community from public.community_settings where singleton;
  if community is null then
    insert into public.crews(name) values ('Crew Control') returning id into community;
    insert into public.community_settings(singleton,crew_id) values(true,community);
    insert into public.challenges(crew_id,title,description,evidence,festival,difficulty,points,repeatable)
      select community,title,description,evidence,festival,difficulty,points,repeatable from public.challenge_templates;
  end if;
end $$;

-- Existing confirmed accounts can join immediately; unconfirmed accounts get no membership.
insert into public.profiles(id,display_name)
select id,left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),'Crewlid'),60)
from auth.users where email_confirmed_at is not null
on conflict(id) do nothing;
insert into public.members(crew_id,user_id,role)
select s.crew_id,u.id,'member' from public.community_settings s cross join auth.users u
where u.email_confirmed_at is not null
on conflict(crew_id,user_id) do nothing;
insert into public.consents(crew_id,user_id,sharing)
select m.crew_id,m.user_id,false from public.members m join public.community_settings s on s.crew_id=m.crew_id
on conflict(crew_id,user_id) do nothing;

create or replace function public.enroll_confirmed_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare community uuid;
begin
  if new.email_confirmed_at is null then return new; end if;
  select crew_id into community from public.community_settings where singleton;
  if community is null then raise exception 'Het platform is nog niet ingesteld'; end if;
  insert into public.profiles(id,display_name)
    values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Crewlid'),60))
    on conflict(id) do nothing;
  insert into public.members(crew_id,user_id,role) values(community,new.id,'member') on conflict do nothing;
  insert into public.consents(crew_id,user_id,sharing) values(community,new.id,false) on conflict do nothing;
  return new;
end $$;
revoke all on function public.enroll_confirmed_account() from public,anon,authenticated;
drop trigger if exists zz_enroll_confirmed_account on auth.users;
create trigger zz_enroll_confirmed_account after insert or update of email_confirmed_at on auth.users
for each row execute function public.enroll_confirmed_account();

-- Retry-safe login path for existing sessions; never promotes users or overwrites consent.
create or replace function public.ensure_community_membership() returns uuid
language plpgsql security definer set search_path='' as $$
declare community uuid;
begin
  if auth.uid() is null then raise exception 'Log eerst in'; end if;
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'Bevestig eerst je e-mailadres';
  end if;
  select crew_id into community from public.community_settings where singleton;
  if community is null then raise exception 'Het platform is nog niet ingesteld'; end if;
  insert into public.members(crew_id,user_id,role) values(community,auth.uid(),'member') on conflict do nothing;
  insert into public.consents(crew_id,user_id,sharing) values(community,auth.uid(),false) on conflict do nothing;
  return community;
end $$;
revoke all on function public.ensure_community_membership() from public,anon;
grant execute on function public.ensure_community_membership() to authenticated;

-- The shared platform persists when its last administrator deletes their own account.
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Log eerst in'; end if;
  if exists(select 1 from public.members m where m.user_id=auth.uid() and m.role='admin' and (select count(*) from public.members other where other.crew_id=m.crew_id)>1 and not exists(select 1 from public.members a where a.crew_id=m.crew_id and a.role='admin' and a.user_id<>auth.uid())) then raise exception 'Draag eerst beheer over'; end if;
  perform public.delete_my_data();
  delete from public.crews where id in(select crew_id from public.members where user_id=auth.uid() and role='admin' and crew_id in(select crew_id from public.members group by crew_id having count(*)=1))
    and id not in(select crew_id from public.community_settings);
  delete from auth.users where id=auth.uid();
end $$;
revoke all on function public.delete_my_account() from public,anon;
grant execute on function public.delete_my_account() to authenticated;
