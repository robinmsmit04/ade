-- Crew Control V3: bestaande database met migraties 001 t/m 004.
-- Voer het volledige bestand eenmalig uit, zonder tekstselectie.
-- Nieuwe migraties 005 (sociale feed) en 006 (persoonlijk feest afronden).
BEGIN;

DO $$ BEGIN
 IF to_regprocedure('public.ensure_community_membership()') IS NULL THEN
  RAISE EXCEPTION 'Migratie 003 ontbreekt: voer eerst docs/enable-shared-platform.sql uit.';
 END IF;
 IF to_regprocedure('public.complete_onboarding(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Migratie 004 ontbreekt: voer eerst docs/enable-mobile-v2.sql uit.';
 END IF;
END $$;

-- V3 extends existing submissions/reviews. Sensitive records are not social events.
alter table public.submissions add column last_activity_at timestamptz not null default now();
update public.submissions set last_activity_at=created_at;
create index submissions_activity on public.submissions(crew_id,last_activity_at desc,id);
create table public.submission_comments(
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null references public.submissions on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 body text not null check(length(trim(body)) between 1 and 500),
 created_at timestamptz not null default now()
);
create index comments_submission on public.submission_comments(submission_id,created_at,id);
create index comments_author_time on public.submission_comments(user_id,created_at desc);
create table public.social_notifications(
 id uuid primary key default gen_random_uuid(),
 crew_id uuid not null,
 recipient_id uuid not null,
 actor_id uuid references public.profiles on delete set null,
 submission_id uuid not null references public.submissions on delete cascade,
 kind text not null check(kind in ('submission','review','approved','rejected','comment')),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 foreign key(crew_id,recipient_id) references public.members(crew_id,user_id) on delete cascade
);
create index notifications_recipient on public.social_notifications(recipient_id,crew_id,created_at desc);
alter table public.submission_comments enable row level security;
alter table public.social_notifications enable row level security;
create policy comments_read on public.submission_comments for select to authenticated using(exists(select 1 from public.submissions s where s.id=submission_id and public.is_member(s.crew_id)));
create policy notifications_read on public.social_notifications for select to authenticated using(recipient_id=auth.uid() and public.is_member(crew_id));
revoke all on public.submission_comments,public.social_notifications from public,anon,authenticated;
grant select on public.submission_comments,public.social_notifications to authenticated;

create function public.post_submission_comment(sid uuid,body_text text,request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 select crew_id into cid from public.submissions where id=sid;
 if cid is null or not public.is_member(cid) then raise exception 'Geen crewtoegang';end if;
 if body_text is null or length(trim(body_text)) not between 1 and 500 then raise exception 'Gebruik 1 tot 500 tekens';end if;
 -- Serialise this author's attempts, including concurrent requests and ambiguous retries.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.submission_comments where id=request_id and user_id=auth.uid() and submission_id=sid) then return request_id;end if;
 if exists(select 1 from public.submission_comments where user_id=auth.uid() and created_at>now()-interval '5 seconds')
 or (select count(*) from public.submission_comments where user_id=auth.uid() and created_at>now()-interval '1 minute')>=6 then raise exception 'Wacht even voordat je opnieuw reageert';end if;
 insert into public.submission_comments(id,submission_id,user_id,body) values(request_id,sid,auth.uid(),trim(body_text));
 return request_id;
end$$;
create function public.delete_submission_comment(comment_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 delete from public.submission_comments c where c.id=comment_id and c.user_id=auth.uid()
 and exists(select 1 from public.submissions s where s.id=c.submission_id and public.is_member(s.crew_id));
 if not found then raise exception 'Reactie niet gevonden of niet van jou';end if;
end$$;
create function public.read_social_notifications(cid uuid,notification_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(cid) then raise exception 'Geen crewtoegang';end if;
 update public.social_notifications set read_at=coalesce(read_at,now())
 where crew_id=cid and recipient_id=auth.uid() and id=any(notification_ids);
end$$;
create function public.submission_social_stats(cid uuid,submission_ids uuid[])
returns table(submission_id uuid,approvals bigint,rejections bigint,comment_count bigint,my_vote boolean)
language sql stable security invoker set search_path='' as $$
 select s.id,
 (select count(*) from public.reviews r join public.members m on m.crew_id=s.crew_id and m.user_id=r.reviewer_id where r.submission_id=s.id and r.approved),
 (select count(*) from public.reviews r join public.members m on m.crew_id=s.crew_id and m.user_id=r.reviewer_id where r.submission_id=s.id and not r.approved),
 (select count(*) from public.submission_comments c where c.submission_id=s.id),
 (select r.approved from public.reviews r where r.submission_id=s.id and r.reviewer_id=auth.uid())
 from public.submissions s where s.crew_id=cid and public.is_member(cid) and s.id=any(submission_ids);
$$;
-- Only challenge events create notifications; no health-record payloads or events.
create function public.notify_submission_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.submissions;event_kind text;actor uuid;
begin
 if TG_TABLE_NAME='submissions' then
   s:=new;event_kind:='submission';actor:=new.user_id;
   insert into public.social_notifications(crew_id,recipient_id,actor_id,submission_id,kind)
    select s.crew_id,m.user_id,actor,s.id,event_kind from public.members m where m.crew_id=s.crew_id and m.user_id<>actor;
 elsif TG_TABLE_NAME='reviews' then
   select * into s from public.submissions where id=new.submission_id;
   actor:=new.reviewer_id;event_kind:='review';
   update public.submissions set last_activity_at=now() where id=s.id;
   insert into public.social_notifications(crew_id,recipient_id,actor_id,submission_id,kind) values(s.crew_id,s.user_id,actor,s.id,event_kind);
 else
   select * into s from public.submissions where id=coalesce(new.submission_id,old.submission_id);
   if s.id is null then return coalesce(new,old);end if;
   update public.submissions set last_activity_at=now() where id=s.id;
   if TG_OP='INSERT' and new.user_id<>s.user_id then
    insert into public.social_notifications(crew_id,recipient_id,actor_id,submission_id,kind) values(s.crew_id,s.user_id,new.user_id,s.id,'comment');
   end if;
   insert into public.activity(crew_id,kind) values(s.crew_id,'comment');
 end if;
 return coalesce(new,old);
end$$;
create function public.notify_submission_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then
  insert into public.social_notifications(crew_id,recipient_id,actor_id,submission_id,kind) values(new.crew_id,new.user_id,auth.uid(),new.id,new.status);
 end if;
 return new;
end$$;
create trigger social_new_submission after insert on public.submissions for each row execute function public.notify_submission_activity();
create trigger social_new_review after insert on public.reviews for each row execute function public.notify_submission_activity();
create trigger social_comment after insert or delete on public.submission_comments for each row execute function public.notify_submission_activity();
create trigger social_status after update of status on public.submissions for each row execute function public.notify_submission_status();

-- Extend the existing own-data deletion; Storage objects still must be removed via API first.
create or replace function public.delete_my_data() returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 if exists(select 1 from storage.objects where (bucket_id='crew-evidence' and (storage.foldername(name))[2]=auth.uid()::text) or (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text)) then raise exception 'Verwijder eerst je mediabestanden';end if;
 delete from public.submission_comments where user_id=auth.uid();
 delete from public.records where user_id=auth.uid();delete from public.checkins where user_id=auth.uid();delete from public.submissions where user_id=auth.uid();delete from public.reviews where reviewer_id=auth.uid();update public.consents set sharing=false where user_id=auth.uid();update public.profiles set avatar_path=null where id=auth.uid();
 delete from public.social_notifications where recipient_id=auth.uid() or actor_id=auth.uid();
end$$;
revoke all on function public.post_submission_comment(uuid,text,uuid),public.delete_submission_comment(uuid),public.read_social_notifications(uuid,uuid[]),public.submission_social_stats(uuid,uuid[]),public.notify_submission_activity(),public.notify_submission_status() from public,anon,authenticated;
grant execute on function public.post_submission_comment(uuid,text,uuid),public.delete_submission_comment(uuid),public.read_social_notifications(uuid,uuid[]),public.submission_social_stats(uuid,uuid[]) to authenticated;
-- The activity publication and its crew RLS remain unchanged: clients re-read under RLS.


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

COMMIT;
SELECT 'Crew Control V3 ingesteld' AS status;
