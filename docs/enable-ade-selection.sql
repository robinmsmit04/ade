-- ADE Selectie: upgrade bestaande V3-installatie, migraties 001 t/m 006 vereist.
-- Voer éénmalig het HELE bestand uit, zonder tekstselectie. Geen accounts of media worden gewist.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.party_state') IS NULL OR to_regclass('public.submission_comments') IS NULL THEN
  RAISE EXCEPTION 'Voer eerst docs/enable-social-v3.sql uit (migraties 005 en 006).';
 END IF;
 IF to_regclass('public.team_settings') IS NOT NULL THEN
  RAISE EXCEPTION 'ADE Selectie is al geïnstalleerd. Voer deze upgrade niet opnieuw uit.';
 END IF;
END $$;

-- ADE Selectie: fixed 3-0-3, one explicitly trusted lineup manager, private team reports.
create table public.team_settings (
 crew_id uuid primary key references public.crews on delete cascade,
 manager_id uuid references public.profiles on delete set null,
 version integer not null default 0
);
create table public.team_lineup (
 crew_id uuid not null references public.crews on delete cascade,
 position text not null check(position in ('keeper','cv_left','cv_center','cv_right','forward_left','striker','forward_right')),
 user_id uuid,
 player_name text not null default '' check(length(player_name)<=60),
 nickname text not null default '' check(length(nickname)<=60),
 shirt_number integer not null check(shirt_number between 1 and 99),
 primary key(crew_id,position),
 unique(crew_id,user_id), unique(crew_id,shirt_number),
 foreign key(crew_id,user_id) references public.members(crew_id,user_id) on delete set null(user_id)
);
create table public.match_reports (
 id uuid primary key default gen_random_uuid(),
 crew_id uuid not null references public.crews on delete cascade,
 author_id uuid references public.profiles on delete set null,
 title text not null check(length(trim(title)) between 3 and 120),
 body text not null check(length(trim(body)) between 10 and 8000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index match_reports_crew_time on public.match_reports(crew_id,created_at desc,id);

create function public.initialize_selection() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.team_settings(crew_id) values(new.id);
 insert into public.team_lineup(crew_id,position,shirt_number) values
 (new.id,'keeper',1),(new.id,'cv_left',3),(new.id,'cv_center',4),(new.id,'cv_right',5),
 (new.id,'forward_left',7),(new.id,'striker',9),(new.id,'forward_right',11);
 return new;
end$$;
create trigger selection_created after insert on public.crews for each row execute function public.initialize_selection();
insert into public.team_settings(crew_id,manager_id)
 select c.id,(select m.user_id from public.members m where m.crew_id=c.id and m.role='admin' limit 1)
 from public.crews c where (select count(*) from public.members m where m.crew_id=c.id and m.role='admin')=1;
insert into public.team_settings(crew_id) select id from public.crews on conflict do nothing;
insert into public.team_lineup(crew_id,position,shirt_number)
 select c.id,p.position,p.number from public.crews c cross join (values
 ('keeper',1),('cv_left',3),('cv_center',4),('cv_right',5),('forward_left',7),('striker',9),('forward_right',11)) p(position,number);

alter table public.team_settings enable row level security;
alter table public.team_lineup enable row level security;
alter table public.match_reports enable row level security;
create policy team_settings_read on public.team_settings for select to authenticated using(public.is_member(crew_id));
create policy team_lineup_read on public.team_lineup for select to authenticated using(public.is_member(crew_id));
create policy match_reports_read on public.match_reports for select to authenticated using(public.is_member(crew_id));
revoke all on public.team_settings,public.team_lineup,public.match_reports from public,anon,authenticated;
grant select on public.team_settings,public.team_lineup,public.match_reports to authenticated;

-- First assignment requires an existing admin. Afterwards only the designated manager can transfer control.
-- Account names, signup metadata and the honorary coach name never grant permissions.
create function public.set_selection_manager(cid uuid,manager_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$declare current_manager uuid;begin
 select manager_id into current_manager from public.team_settings where crew_id=cid for update;
 if not found or not public.is_member(cid) then raise exception 'Geen teamtoegang';end if;
 if current_manager is distinct from auth.uid() and not (current_manager is null and public.is_admin(cid)) then raise exception 'Alleen de opstellingsbeheerder kan dit wijzigen';end if;
 if not exists(select 1 from public.members where crew_id=cid and user_id=manager_user_id) then raise exception 'Kies een bestaand teamlid';end if;
 update public.team_settings set manager_id=manager_user_id,version=version+1 where crew_id=cid;
end$$;
create function public.save_team_lineup(cid uuid,players jsonb,expected_version integer) returns void
language plpgsql security definer set search_path='' as $$declare settings public.team_settings;begin
 select * into settings from public.team_settings where crew_id=cid for update;
 if not found or not public.is_member(cid) or settings.manager_id is distinct from auth.uid() then raise exception 'Alleen de opstellingsbeheerder kan dit wijzigen';end if;
 if expected_version is distinct from settings.version then raise exception 'De opstelling is intussen gewijzigd. Laad opnieuw voordat je opslaat.';end if;
 if jsonb_typeof(players) is distinct from 'array' then raise exception 'Vul de zeven posities in';end if;
 if jsonb_array_length(players)<>7 then raise exception 'Vul de zeven posities in';end if;
 if exists(select 1 from jsonb_to_recordset(players) as p(position text,user_id uuid,player_name text,nickname text,shirt_number integer)
  where p.user_id is not null and not exists(select 1 from public.members m where m.crew_id=cid and m.user_id=p.user_id)) then raise exception 'Kies alleen bestaande teamleden';end if;
 -- Delete and replace atomically allows swapping two occupied positions/numbers.
 delete from public.team_lineup where crew_id=cid;
 insert into public.team_lineup(crew_id,position,user_id,player_name,nickname,shirt_number)
 select cid,p.position,p.user_id,case when p.user_id is null then '' else trim(coalesce(p.player_name,'')) end,
 case when p.user_id is null then '' else trim(coalesce(p.nickname,'')) end,p.shirt_number
 from jsonb_to_recordset(players) as p(position text,user_id uuid,player_name text,nickname text,shirt_number integer);
 update public.team_settings set version=version+1 where crew_id=cid;
end$$;
create function public.save_match_report(cid uuid,heading text,report_body text,request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$declare manager uuid;begin
 select manager_id into manager from public.team_settings where crew_id=cid for update;
 if not found or not public.is_member(cid) or manager is distinct from auth.uid() then raise exception 'Alleen de opstellingsbeheerder kan namens Lucas publiceren';end if;
 if exists(select 1 from public.match_reports where id=request_id and crew_id<>cid) then raise exception 'Ongeldig verslag';end if;
 insert into public.match_reports(id,crew_id,author_id,title,body) values(request_id,cid,auth.uid(),trim(heading),trim(report_body))
 on conflict(id) do update set title=excluded.title,body=excluded.body,updated_at=now() where match_reports.crew_id=excluded.crew_id;
 if not found then raise exception 'Ongeldig verslag';end if;
 return request_id;
end$$;
create function public.delete_match_report(report_id uuid) returns void
language plpgsql security definer set search_path='' as $$declare cid uuid;manager uuid;begin
 select crew_id into cid from public.match_reports where id=report_id;
 select manager_id into manager from public.team_settings where crew_id=cid for update;
 if not public.is_member(cid) or manager is distinct from auth.uid() then raise exception 'Geen publicatierechten';end if;
 delete from public.match_reports where id=report_id;
end$$;
revoke all on function public.initialize_selection(),public.set_selection_manager(uuid,uuid),public.save_team_lineup(uuid,jsonb,integer),public.save_match_report(uuid,text,text,uuid),public.delete_match_report(uuid) from public,anon;
grant execute on function public.set_selection_manager(uuid,uuid),public.save_team_lineup(uuid,jsonb,integer),public.save_match_report(uuid,text,text,uuid),public.delete_match_report(uuid) to authenticated;
-- Sanitised invalidations only: no names, reports or private records in realtime payloads.
create trigger team_settings_changed after insert or update or delete on public.team_settings for each row execute function public.invalidate_crew();
create trigger team_lineup_changed after insert or update or delete on public.team_lineup for each row execute function public.invalidate_crew();
create trigger match_reports_changed after insert or update or delete on public.match_reports for each row execute function public.invalidate_crew();

-- Forget lineup aliases and report authorship on account/team removal.
create function public.clear_selection_member() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.team_lineup set user_id=null,player_name='',nickname='' where crew_id=old.crew_id and user_id=old.user_id;
 update public.team_settings set manager_id=case when manager_id=old.user_id then null else manager_id end,version=version+1 where crew_id=old.crew_id;
 return old;
end$$;
revoke all on function public.clear_selection_member() from public,anon,authenticated;
create trigger selection_member_removed before delete on public.members for each row execute function public.clear_selection_member();
create or replace function public.delete_my_data() returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 if exists(select 1 from storage.objects where (bucket_id='crew-evidence' and (storage.foldername(name))[2]=auth.uid()::text) or (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text)) then raise exception 'Verwijder eerst je mediabestanden';end if;
 update public.team_settings set version=version+1 where crew_id in(select crew_id from public.team_lineup where user_id=auth.uid());
 update public.team_lineup set user_id=null,player_name='',nickname='' where user_id=auth.uid();
 delete from public.match_reports where author_id=auth.uid();
 delete from public.party_state where user_id=auth.uid();
 delete from public.submission_comments where user_id=auth.uid();
 delete from public.records where user_id=auth.uid();delete from public.checkins where user_id=auth.uid();delete from public.submissions where user_id=auth.uid();delete from public.reviews where reviewer_id=auth.uid();update public.consents set sharing=false where user_id=auth.uid();update public.profiles set avatar_path=null where id=auth.uid();
 delete from public.social_notifications where recipient_id=auth.uid() or actor_id=auth.uid();
end$$;
-- Total challenge points across the whole team history; existing awards RLS still applies.
create function public.selection_player_points(cid uuid,player_id uuid) returns bigint
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(points),0)::bigint from public.awards where crew_id=cid and user_id=player_id and public.is_member(cid);
$$;
revoke all on function public.selection_player_points(uuid,uuid) from public,anon;
grant execute on function public.selection_player_points(uuid,uuid) to authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT 'ADE Selectie ingesteld' AS status;
