-- V2 profile onboarding, active crew, private avatars and RLS-respecting crew summaries.
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists profile_completed_at timestamptz;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists active_crew_id uuid references public.crews(id) on delete set null;
-- Existing confirmed accounts keep their current access without repeating onboarding.
update public.profiles p set profile_completed_at=now(),onboarding_completed_at=now(),active_crew_id=s.crew_id
from auth.users u,public.community_settings s
where p.id=u.id and u.email_confirmed_at is not null and p.onboarding_completed_at is null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy avatar_insert on storage.objects for insert to authenticated with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_read on storage.objects for select to authenticated using(bucket_id='profile-photos' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.profiles p where p.avatar_path=objects.name)));
create policy avatar_delete on storage.objects for delete to authenticated using(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);

create function public.save_my_profile(nickname text,photo_path text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 if length(trim(nickname)) not between 1 and 60 then raise exception 'Vul een naam van maximaal 60 tekens in';end if;
 if photo_path is not null and (split_part(photo_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=photo_path)) then raise exception 'Profielfoto ontbreekt of is niet van jou';end if;
 update public.profiles set display_name=trim(nickname),avatar_path=photo_path,profile_completed_at=coalesce(profile_completed_at,now()) where id=auth.uid();
 insert into public.activity(crew_id,kind) select crew_id,'profile' from public.members where user_id=auth.uid();
end$$;
create function public.complete_onboarding(chosen_crew uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(chosen_crew) then raise exception 'Je bent geen lid van deze crew';end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and profile_completed_at is not null) then raise exception 'Vul eerst je profiel in';end if;
 update public.profiles set active_crew_id=chosen_crew,onboarding_completed_at=now() where id=auth.uid();
end$$;
create function public.my_avatar_paths() returns setof text language sql stable security definer set search_path='' as $$
 select name from storage.objects where bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text;
$$;
-- SECURITY INVOKER is intentional: every aggregate observes the caller's records RLS.
create function public.crew_record_summary(cid uuid,day_filter date default null)
returns table(user_id uuid,last_substance text,last_taken_at timestamptz,today_count bigint,substance_counts jsonb)
language sql stable security invoker set search_path='' as $$
 with visible as (
  select r.* from public.records r where r.crew_id=cid and public.is_member(cid)
  and (day_filter is null or (r.taken_at at time zone 'Europe/Amsterdam')::date=day_filter)
 ), latest as (select distinct on(v.user_id) v.user_id,v.substance,v.taken_at from visible v order by v.user_id,v.taken_at desc,v.id),
 totals as(select v.user_id,count(*) filter(where (v.taken_at at time zone 'Europe/Amsterdam')::date=coalesce(day_filter,(now() at time zone 'Europe/Amsterdam')::date)) as n from visible v group by v.user_id),
 counts as(select x.user_id,jsonb_object_agg(x.substance,x.n) as counts from(select v.user_id,v.substance,count(*) as n from visible v group by v.user_id,v.substance)x group by x.user_id)
 select l.user_id,l.substance,l.taken_at,t.n,c.counts from latest l join totals t using(user_id) join counts c using(user_id);
$$;
revoke all on function public.save_my_profile(text,text),public.complete_onboarding(uuid),public.my_avatar_paths(),public.crew_record_summary(uuid,date) from public,anon;
grant execute on function public.save_my_profile(text,text),public.complete_onboarding(uuid),public.my_avatar_paths(),public.crew_record_summary(uuid,date) to authenticated;
-- No client grant for avatar/onboarding/active crew columns; the checked functions own these writes.
create or replace function public.delete_my_data() returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 if exists(select 1 from storage.objects where (bucket_id='crew-evidence' and (storage.foldername(name))[2]=auth.uid()::text) or (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text)) then raise exception 'Verwijder eerst je mediabestanden';end if;
 delete from public.records where user_id=auth.uid();delete from public.checkins where user_id=auth.uid();delete from public.submissions where user_id=auth.uid();delete from public.reviews where reviewer_id=auth.uid();update public.consents set sharing=false where user_id=auth.uid();update public.profiles set avatar_path=null where id=auth.uid();
end$$;
revoke all on function public.delete_my_data() from public,anon;
grant execute on function public.delete_my_data() to authenticated;

create function public.visible_timeline(cid uuid,owner_filter uuid default null,day_filter date default null,label_filter text default null)
returns setof public.records language sql stable security invoker set search_path='' as $$
 select r.* from public.records r where r.crew_id=cid and public.is_member(cid)
 and (owner_filter is null or r.user_id=owner_filter)
 and (day_filter is null or (r.taken_at at time zone 'Europe/Amsterdam')::date=day_filter)
 and (label_filter is null or r.substance=label_filter)
 order by r.taken_at desc,r.id;
$$;
revoke all on function public.visible_timeline(uuid,uuid,date,text) from public,anon;
grant execute on function public.visible_timeline(uuid,uuid,date,text) to authenticated;
