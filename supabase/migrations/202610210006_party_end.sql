-- Personal per-crew party state. Ending a party never changes or deletes its records.
create table public.party_state(
 crew_id uuid not null,
 user_id uuid not null,
 started_at timestamptz,
 ended_at timestamptz,
 primary key(crew_id,user_id),
 foreign key(crew_id,user_id) references public.members(crew_id,user_id) on delete cascade,
 check(ended_at is null or started_at is null or ended_at>=started_at)
);
alter table public.party_state enable row level security;
create policy party_state_read on public.party_state for select to authenticated using(user_id=auth.uid() or public.shares(crew_id,user_id));
revoke all on public.party_state from public,anon,authenticated;
grant select on public.party_state to authenticated;
create function public.end_my_party(cid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(cid) then raise exception 'Geen crewtoegang';end if;
 insert into public.party_state(crew_id,user_id,ended_at) values(cid,auth.uid(),now())
 on conflict(crew_id,user_id) do update set ended_at=coalesce(party_state.ended_at,excluded.ended_at);
 insert into public.activity(crew_id,kind) values(cid,'party');
end$$;
create function public.start_my_party(cid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(cid) then raise exception 'Geen crewtoegang';end if;
 insert into public.party_state(crew_id,user_id,started_at) values(cid,auth.uid(),now())
 on conflict(crew_id,user_id) do update set started_at=excluded.started_at,ended_at=null
 where party_state.ended_at is not null;
 insert into public.activity(crew_id,kind) values(cid,'party');
end$$;
revoke all on function public.end_my_party(uuid),public.start_my_party(uuid) from public,anon;
grant execute on function public.end_my_party(uuid),public.start_my_party(uuid) to authenticated;
-- created_at distinguishes new-session entries even when taken_at is corrected or minute-precision.
create function public.my_party_latest(cid uuid) returns setof public.records
language sql stable security invoker set search_path='' as $$
 select r.* from public.records r left join public.party_state p on p.crew_id=r.crew_id and p.user_id=r.user_id
 where r.crew_id=cid and r.user_id=auth.uid() and public.is_member(cid)
 and (p.started_at is null or r.created_at>=p.started_at)
 order by r.taken_at desc,r.id limit 1;
$$;
revoke all on function public.my_party_latest(uuid) from public,anon;
grant execute on function public.my_party_latest(uuid) to authenticated;

create or replace function public.delete_my_data() returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 if exists(select 1 from storage.objects where (bucket_id='crew-evidence' and (storage.foldername(name))[2]=auth.uid()::text) or (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text)) then raise exception 'Verwijder eerst je mediabestanden';end if;
 delete from public.party_state where user_id=auth.uid();
 delete from public.submission_comments where user_id=auth.uid();
 delete from public.records where user_id=auth.uid();delete from public.checkins where user_id=auth.uid();delete from public.submissions where user_id=auth.uid();delete from public.reviews where reviewer_id=auth.uid();update public.consents set sharing=false where user_id=auth.uid();update public.profiles set avatar_path=null where id=auth.uid();
 delete from public.social_notifications where recipient_id=auth.uid() or actor_id=auth.uid();
end$$;
