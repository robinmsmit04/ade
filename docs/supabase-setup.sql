-- Crew Control: volledige installatie voor een leeg Supabase-project.
-- Bestaande installatie? Gebruik uitsluitend de ontbrekende upgrade uit docs/.
BEGIN;

-- Crew Control. Apply through Supabase migrations, not from a browser.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table public.profiles(id uuid primary key references auth.users on delete cascade, display_name text not null check(length(display_name) between 1 and 60));
create table public.crews(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 2 and 60),review_threshold integer not null default 2 check(review_threshold between 1 and 10),created_at timestamptz not null default now());
create table public.members(crew_id uuid not null references public.crews on delete cascade,user_id uuid not null references public.profiles on delete cascade,role text not null default 'member' check(role in ('admin','member')),primary key(crew_id,user_id));
create table public.consents(crew_id uuid not null,user_id uuid not null,sharing boolean not null default false,primary key(crew_id,user_id),foreign key(crew_id,user_id) references public.members on delete cascade);
create table public.invites(id uuid primary key default gen_random_uuid(),crew_id uuid not null references public.crews on delete cascade,token_hash text unique not null,expires_at timestamptz not null default now()+interval '7 days',max_uses integer not null default 20 check(max_uses between 1 and 100),uses integer not null default 0 check(uses>=0),created_by uuid references public.profiles on delete set null);
create table public.festivals(id text primary key check(id in ('DGTL','KI/KI')),name text not null);
insert into public.festivals values('DGTL','DGTL'),('KI/KI','KI/KI');
create table public.records(id uuid primary key default gen_random_uuid(),crew_id uuid not null,user_id uuid not null default auth.uid(),substance text not null check(length(trim(substance)) between 1 and 60),taken_at timestamptz not null default now() check(taken_at<=now()+interval '1 minute'),quantity text not null default '' check(length(quantity)<=60),notes text not null default '' check(length(notes)<=1000),created_at timestamptz not null default now(),foreign key(crew_id,user_id) references public.members on delete cascade);
create index records_crew_time on public.records(crew_id,taken_at desc);
create index records_user on public.records(user_id);
create table public.checkins(id uuid primary key default gen_random_uuid(),crew_id uuid not null,user_id uuid not null default auth.uid(),status text not null check(status in ('Goed','Rust nodig','Niet lekker')),help_requested boolean not null default false,shared boolean not null default false,created_at timestamptz not null default now(),foreign key(crew_id,user_id) references public.members on delete cascade);
create index checkins_crew_time on public.checkins(crew_id,created_at desc);
create table public.challenges(id uuid primary key default gen_random_uuid(),crew_id uuid not null references public.crews on delete cascade,title text not null check(length(title) between 3 and 100),description text not null check(length(description) between 10 and 2000),evidence text not null check(length(evidence) between 5 and 1000),festival text not null references public.festivals,difficulty text not null check(difficulty in ('Easy','Awkward','No Shame','Legendary')),points integer not null check(points between 1 and 1000),repeatable boolean not null default false,active boolean not null default true,unique(id,crew_id));
create index challenges_crew on public.challenges(crew_id);
create table public.submissions(id uuid primary key default gen_random_uuid(),crew_id uuid not null,user_id uuid not null,challenge_id uuid not null, status text not null default 'pending' check(status in ('pending','approved','rejected')),file_path text not null unique,mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm')),title text not null,festival text not null references public.festivals,points integer not null check(points between 1 and 1000),created_at timestamptz not null default now(),foreign key(crew_id,user_id) references public.members on delete cascade,foreign key(challenge_id,crew_id) references public.challenges(id,crew_id));
create index submissions_crew on public.submissions(crew_id,created_at desc);
create table public.reviews(submission_id uuid not null references public.submissions on delete cascade,reviewer_id uuid not null references public.profiles on delete cascade,approved boolean not null,created_at timestamptz not null default now(),primary key(submission_id,reviewer_id));
create table public.awards(id uuid primary key default gen_random_uuid(),submission_id uuid unique not null references public.submissions on delete cascade,crew_id uuid not null,user_id uuid not null,points integer not null check(points>0),festival text not null references public.festivals,created_at timestamptz not null default now(),foreign key(crew_id,user_id) references public.members on delete cascade);
create index awards_crew on public.awards(crew_id,created_at);
-- Only invalidation metadata is broadcast: never substance, quantity, check-in or media.
create table public.activity(id bigint generated always as identity primary key,crew_id uuid not null references public.crews on delete cascade,kind text not null,created_at timestamptz not null default now());
create index activity_crew on public.activity(crew_id,created_at desc);

create function public.is_member(cid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.members where crew_id=cid and user_id=auth.uid())$$;
create function public.is_admin(cid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.members where crew_id=cid and user_id=auth.uid() and role='admin')$$;
create function public.shares(cid uuid,uid uuid) returns boolean language sql stable security definer set search_path='' as $$select public.is_member(cid) and exists(select 1 from public.consents where crew_id=cid and user_id=uid and sharing)$$;
create function public.handle_user() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.profiles(id,display_name) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Crewlid'),60));return new;end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_user();

alter table public.profiles enable row level security;
alter table public.crews enable row level security;
alter table public.members enable row level security;
alter table public.consents enable row level security;
alter table public.invites enable row level security;
alter table public.festivals enable row level security;
alter table public.records enable row level security;
alter table public.checkins enable row level security;
alter table public.challenges enable row level security;
alter table public.submissions enable row level security;
alter table public.reviews enable row level security;
alter table public.awards enable row level security;
alter table public.activity enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or exists(select 1 from public.members m where m.user_id=profiles.id and public.is_member(m.crew_id)));
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy crews_read on public.crews for select to authenticated using(public.is_member(id));
create policy members_read on public.members for select to authenticated using(public.is_member(crew_id));
create policy consents_read on public.consents for select to authenticated using(user_id=auth.uid());
create policy consents_update on public.consents for update to authenticated using(user_id=auth.uid() and public.is_member(crew_id)) with check(user_id=auth.uid() and public.is_member(crew_id));
create policy invites_read on public.invites for select to authenticated using(public.is_admin(crew_id));
create policy invites_delete on public.invites for delete to authenticated using(public.is_admin(crew_id));
create policy festivals_read on public.festivals for select to authenticated using(true);
create policy records_read on public.records for select to authenticated using(user_id=auth.uid() or public.shares(crew_id,user_id));
create policy records_insert on public.records for insert to authenticated with check(user_id=auth.uid() and public.is_member(crew_id));
create policy records_update on public.records for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_member(crew_id));
create policy records_delete on public.records for delete to authenticated using(user_id=auth.uid());
create policy checkins_read on public.checkins for select to authenticated using(user_id=auth.uid() or (shared and public.is_member(crew_id)));
create policy checkins_insert on public.checkins for insert to authenticated with check(user_id=auth.uid() and public.is_member(crew_id));
create policy checkins_update on public.checkins for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_member(crew_id));
create policy checkins_delete on public.checkins for delete to authenticated using(user_id=auth.uid());
create policy challenges_read on public.challenges for select to authenticated using(public.is_member(crew_id));
create policy challenges_insert on public.challenges for insert to authenticated with check(public.is_admin(crew_id));
create policy challenges_update on public.challenges for update to authenticated using(public.is_admin(crew_id)) with check(public.is_admin(crew_id));
create policy submissions_read on public.submissions for select to authenticated using(public.is_member(crew_id));
create policy reviews_read on public.reviews for select to authenticated using(exists(select 1 from public.submissions s where s.id=submission_id and public.is_member(s.crew_id)));
create policy awards_read on public.awards for select to authenticated using(public.is_member(crew_id));
create policy activity_read on public.activity for select to authenticated using(public.is_member(crew_id));
-- Explicit column grants protect identity, timestamps and membership roles.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.crews,public.members,public.consents,public.invites,public.festivals,public.records,public.checkins,public.challenges,public.submissions,public.reviews,public.awards,public.activity to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant update(sharing) on public.consents to authenticated;
grant insert(id,crew_id,user_id,substance,taken_at,quantity,notes),delete on public.records to authenticated;
grant update(substance,taken_at,quantity,notes) on public.records to authenticated;
grant insert(id,crew_id,user_id,status,help_requested,shared),delete on public.checkins to authenticated;
grant update(shared) on public.checkins to authenticated;
grant insert(crew_id,title,description,evidence,festival,difficulty,points,repeatable,active) on public.challenges to authenticated;
grant update(title,description,evidence,festival,difficulty,points,repeatable,active) on public.challenges to authenticated;
grant delete on public.invites to authenticated;

create function public.create_crew(crew_name text) returns uuid language plpgsql security definer set search_path='' as $$declare cid uuid;begin
if auth.uid() is null then raise exception 'Log eerst in';end if;
insert into public.crews(name) values(trim(crew_name)) returning id into cid;
insert into public.members values(cid,auth.uid(),'admin');insert into public.consents values(cid,auth.uid(),false);
insert into public.challenges(crew_id,title,description,evidence,festival,difficulty,points,repeatable) select cid,title,description,evidence,festival,difficulty,points,repeatable from public.challenge_templates;
return cid;end$$;
create function public.create_invite(cid uuid) returns text language plpgsql security definer set search_path='' as $$declare token text;begin
if not public.is_admin(cid) then raise exception 'Geen beheerrechten';end if;
token:=encode(extensions.gen_random_bytes(24),'hex');
insert into public.invites(crew_id,token_hash,created_by) values(cid,encode(extensions.digest(token,'sha256'),'hex'),auth.uid());return token;end$$;
create function public.join_crew(token text) returns uuid language plpgsql security definer set search_path='' as $$declare invitation public.invites;begin
if auth.uid() is null then raise exception 'Log eerst in';end if;
select * into invitation from public.invites where token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
if invitation.id is null or invitation.expires_at<now() or invitation.uses>=invitation.max_uses then raise exception 'Uitnodiging ongeldig, verlopen of opgebruikt';end if;
if exists(select 1 from public.members where crew_id=invitation.crew_id and user_id=auth.uid()) then return invitation.crew_id;end if;
insert into public.members values(invitation.crew_id,auth.uid(),'member');insert into public.consents values(invitation.crew_id,auth.uid(),false);
update public.invites set uses=uses+1 where id=invitation.id;
insert into public.activity(crew_id,kind) values(invitation.crew_id,'membership');return invitation.crew_id;end$$;
create function public.configure_crew(cid uuid,new_name text,threshold integer) returns void language plpgsql security definer set search_path='' as $$begin
if not public.is_admin(cid) then raise exception 'Geen beheerrechten';end if;
update public.crews set name=trim(new_name),review_threshold=threshold where id=cid;insert into public.activity(crew_id,kind) values(cid,'crew');end$$;
create function public.remove_member(cid uuid,uid uuid) returns void language plpgsql security definer set search_path='' as $$begin
perform 1 from public.crews where id=cid for update;
if not public.is_admin(cid) and uid<>auth.uid() then raise exception 'Geen beheerrechten';end if;
if exists(select 1 from public.members where crew_id=cid and user_id=uid and role='admin') and (select count(*) from public.members where crew_id=cid and role='admin')<=1 then raise exception 'Draag eerst beheer over aan een ander lid';end if;
-- Membership revocation immediately denies crew access; owners retain deletion rights for orphan uploads.
delete from public.members where crew_id=cid and user_id=uid;
insert into public.activity(crew_id,kind) values(cid,'membership');end$$;
create function public.promote_member(cid uuid,uid uuid) returns void language plpgsql security definer set search_path='' as $$begin
if not public.is_admin(cid) then raise exception 'Geen beheerrechten';end if;update public.members set role='admin' where crew_id=cid and user_id=uid;insert into public.activity(crew_id,kind) values(cid,'membership');end$$;
create function public.submit_evidence(cid uuid,challenge uuid,path text,mime text,request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$declare c public.challenges;begin
if not public.is_member(cid) then raise exception 'Geen crewtoegang';end if;
if exists(select 1 from public.submissions where id=request_id and user_id=auth.uid() and crew_id=cid) then return request_id;end if;
select * into c from public.challenges where id=challenge and crew_id=cid for update;
if c.id is null or not c.active then raise exception 'Challenge niet beschikbaar';end if;
if not c.repeatable and exists(select 1 from public.submissions where challenge_id=challenge and user_id=auth.uid() and status in ('pending','approved')) then raise exception 'Deze challenge is al ingezonden';end if;
if split_part(path,'/',1)<>cid::text or split_part(path,'/',2)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='crew-evidence' and name=path) then raise exception 'Bewijs ontbreekt of is niet van jou';end if;
insert into public.submissions(id,crew_id,user_id,challenge_id,file_path,mime_type,title,festival,points) values(request_id,cid,auth.uid(),challenge,path,mime,c.title,c.festival,c.points);
insert into public.activity(crew_id,kind) values(cid,'submission');return request_id;end$$;
create function public.review_submission(sid uuid,approve boolean) returns void language plpgsql security definer set search_path='' as $$declare s public.submissions;threshold integer;begin
-- Serialise votes for this submission; exactly one award is also enforced by UNIQUE.
select * into s from public.submissions where id=sid for update;
if s.id is null or not public.is_member(s.crew_id) or s.user_id=auth.uid() then raise exception 'Geen geldige beoordelaar';end if;
if s.status<>'pending' then raise exception 'Inzending is al beoordeeld';end if;
insert into public.reviews(submission_id,reviewer_id,approved) values(sid,auth.uid(),approve);
select review_threshold into threshold from public.crews where id=s.crew_id;
if not approve then update public.submissions set status='rejected' where id=sid;
elsif (select count(*) from public.reviews r join public.members m on m.user_id=r.reviewer_id and m.crew_id=s.crew_id where r.submission_id=sid and r.approved)>=threshold then
update public.submissions set status='approved' where id=sid;
insert into public.awards(submission_id,crew_id,user_id,points,festival) values(sid,s.crew_id,s.user_id,s.points,s.festival) on conflict(submission_id) do nothing;
end if;
insert into public.activity(crew_id,kind) values(s.crew_id,'review');end$$;
-- Own-data deletion keeps the authentication identity until an explicit account deletion.
create function public.delete_my_data() returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null then raise exception 'Log eerst in';end if;
-- Storage API must remove files before database deletion (the app does this).
if exists(select 1 from storage.objects where bucket_id='crew-evidence' and (storage.foldername(name))[2]=auth.uid()::text) then raise exception 'Verwijder eerst je mediabestanden';end if;
delete from public.records where user_id=auth.uid();delete from public.checkins where user_id=auth.uid();delete from public.submissions where user_id=auth.uid();delete from public.reviews where reviewer_id=auth.uid();update public.consents set sharing=false where user_id=auth.uid();end$$;
create function public.delete_my_account() returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null then raise exception 'Log eerst in';end if;
if exists(select 1 from public.members m where m.user_id=auth.uid() and m.role='admin' and (select count(*) from public.members other where other.crew_id=m.crew_id)>1 and not exists(select 1 from public.members a where a.crew_id=m.crew_id and a.role='admin' and a.user_id<>auth.uid())) then raise exception 'Draag eerst beheer over';end if;
perform public.delete_my_data();
delete from public.crews where id in(select crew_id from public.members where user_id=auth.uid() and role='admin' and crew_id in(select crew_id from public.members group by crew_id having count(*)=1));
delete from auth.users where id=auth.uid();end$$;

create function public.invalidate_crew() returns trigger language plpgsql security definer set search_path='' as $$begin
if exists(select 1 from public.crews where id=coalesce(new.crew_id,old.crew_id)) then insert into public.activity(crew_id,kind) values(coalesce(new.crew_id,old.crew_id),TG_TABLE_NAME);end if;return coalesce(new,old);end$$;
create trigger records_changed after insert or update or delete on public.records for each row execute function public.invalidate_crew();
create trigger consent_changed after update on public.consents for each row execute function public.invalidate_crew();
create trigger checkins_changed after insert or update or delete on public.checkins for each row execute function public.invalidate_crew();
create trigger challenges_changed after insert or update on public.challenges for each row execute function public.invalidate_crew();
alter publication supabase_realtime add table public.activity;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('crew-evidence','crew-evidence',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']);
-- Uploads are private to the owner until attached to a submission. No anonymous reads.
create policy evidence_insert on storage.objects for insert to authenticated with check(bucket_id='crew-evidence' and (storage.foldername(name))[2]=auth.uid()::text and public.is_member(((storage.foldername(name))[1])::uuid));
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='crew-evidence' and ((storage.foldername(name))[2]=auth.uid()::text or exists(select 1 from public.submissions s where s.file_path=name and public.is_member(s.crew_id))));
create policy evidence_delete on storage.objects for delete to authenticated using(bucket_id='crew-evidence' and (storage.foldername(name))[2]=auth.uid()::text);
-- No UPDATE policy: proof cannot be swapped after review.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_member(uuid),public.is_admin(uuid),public.shares(uuid,uuid),public.create_crew(text),public.create_invite(uuid),public.join_crew(text),public.configure_crew(uuid,text,integer),public.remove_member(uuid,uuid),public.promote_member(uuid,uuid),public.submit_evidence(uuid,uuid,text,text,uuid),public.review_submission(uuid,boolean),public.delete_my_data(),public.delete_my_account() to authenticated;


create table public.challenge_templates(id uuid primary key default gen_random_uuid(),title text not null,description text not null,evidence text not null,festival text not null references public.festivals,difficulty text not null,points integer not null,repeatable boolean not null default false);
alter table public.challenge_templates enable row level security;
revoke all on public.challenge_templates from anon,authenticated;
insert into public.challenge_templates(title,description,evidence,festival,difficulty,points,repeatable) values
('Crew in beeld','Maak met toestemming een groepsfoto met je crew. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto met minstens twee instemmende crewleden.','DGTL','Easy',10,false),
('Kleurcode lime','Vind iets limegroens op het terrein en leg het vast. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto van een limegroen detail; geen herkenbare omstanders.','DGTL','Easy',10,false),
('Festivalletters','Spel de festivalnaam met jullie handen of spullen. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto waarop de festivalnaam herkenbaar is.','DGTL','Awkward',20,false),
('Dansende schaduw','Leg je eigen dansende schaduw vast. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video van minimaal vijf seconden.','DGTL','Easy',15,false),
('Albumcover','Maak een fictieve albumcover met je crew. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto met zelfgekozen pose en titel in de beschrijving.','DGTL','Awkward',25,false),
('Synchroon','Doe samen een korte, rustige dansroutine op een vrije plek. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video van tien seconden met twee crewleden.','DGTL','No Shame',35,false),
('Luchtgitaar','Speel een denkbeeldige gitaarsolo op een vrije plek. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video van vijf seconden zonder anderen te hinderen.','DGTL','Awkward',20,false),
('Stille disco','Dans tien seconden zonder geluid op een rustige plek. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video met toestemming van alle zichtbare personen.','DGTL','No Shame',30,false),
('Mini documentaire','Vertel voor de camera over je favoriete moment. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video van maximaal dertig seconden.','DGTL','Easy',15,false),
('Crew choreografie','Bedenk een originele dans met minstens drie crewleden. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video van twintig seconden, op een vrije plek.','DGTL','Legendary',50,false),
('Spiegelbeeld','Maak een symmetrische foto van twee crewleden. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto met twee instemmende deelnemers.','KI/KI','Easy',10,false),
('Festivalpoëzie','Draag vier zelfgeschreven regels over het festival voor. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video van de voordracht op een rustige plek.','KI/KI','Awkward',25,false),
('Menselijk logo','Beeld een zelfbedacht crewlogo uit. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto zonder klimmen of gevaarlijke houdingen.','KI/KI','No Shame',30,false),
('Vogue moment','Laat je beste zelfgekozen festivalpose zien. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto of korte video op een vrije plek.','KI/KI','Awkward',20,false),
('Detailsafari','Maak een close-up van een bijzonder decoratiedetail. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto zonder verboden ruimtes te betreden.','KI/KI','Easy',10,false),
('Weekendjournaal','Presenteer samen een fictief festivaljournaal. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video van maximaal dertig seconden met twee presentatoren.','KI/KI','Legendary',50,false),
('Freeze frame','De crew staat stil in een grappige pose. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto met alle deelnemers in beeld en hun toestemming.','KI/KI','No Shame',30,false),
('Hart voor de crew','Maak samen een hartvorm met jullie handen. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Foto met minstens twee crewleden.','KI/KI','Easy',10,false),
('Slow motion','Film een simpele dansbeweging in slow motion. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video op een vrije plek, zonder anderen te hinderen.','KI/KI','Awkward',20,false),
('Finale buiging','Maak een theatrale gezamenlijke buiging voor de camera. Vraag toestemming aan iedereen in beeld; stop als iemand dat wil.','Video met drie instemmende crewleden op een rustige plek.','KI/KI','Legendary',45,false);

create function public.leaderboard(cid uuid,festival_filter text default null,day_filter date default null) returns table(user_id uuid,points bigint,count bigint) language sql stable security definer set search_path='' as $$
select a.user_id,sum(a.points)::bigint,count(*)::bigint from public.awards a
where a.crew_id=cid and public.is_member(cid) and (festival_filter is null or a.festival=festival_filter) and (day_filter is null or (a.created_at at time zone 'Europe/Amsterdam')::date=day_filter)
group by a.user_id order by sum(a.points) desc,a.user_id;
$$;
revoke all on function public.leaderboard(uuid,text,date) from public,anon;
grant execute on function public.leaderboard(uuid,text,date) to authenticated;
-- This also finds orphan uploads from previously left crews for complete deletion.
create function public.my_media_paths() returns setof text language sql stable security definer set search_path='' as $$select name from storage.objects where bucket_id='crew-evidence' and (storage.foldername(name))[2]=auth.uid()::text$$;
revoke all on function public.my_media_paths() from public,anon;
grant execute on function public.my_media_paths() to authenticated;


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

-- Official ADE Selectie catalog. Repeat-safe; existing evidence and awarded points stay intact.
alter table public.festivals drop constraint if exists festivals_id_check;
alter table public.festivals add constraint festivals_id_check check(id in ('DGTL','KI/KI','ADE'));
insert into public.festivals(id,name) values('ADE','ADE') on conflict(id) do update set name=excluded.name;
create temporary table ade_challenge_catalog(
 id uuid primary key,title text,description text,evidence text,difficulty text,points integer
) on commit drop;
insert into ade_challenge_catalog values
('ade00008-0000-4000-8000-000000000001','De dubbelganger','Maak een foto met iemand die qua uiterlijk of outfit verdacht veel op jou lijkt.','Een foto van jou en je dubbelganger, met toestemming van beiden.','Easy',10),
('ade00008-0000-4000-8000-000000000002','De festivalbruiloft','Maak een trouwfoto met een wildvreemde, inclusief geïmproviseerd aanzoek.','Een trouwfoto met een instemmende onbekende en een geïmproviseerde aanzoekpose.','Easy',10),
('ade00008-0000-4000-8000-000000000003','De uitsmijter','Maak een foto met een beveiliger die een duimpje omhoog geeft.','Een foto samen met een instemmende beveiliger die een duimpje omhoog geeft.','Easy',10),
('ade00008-0000-4000-8000-000000000004','De boyband','Maak een foto met minimaal vier onbekenden die samen een boyband-pose aannemen.','Een foto met minimaal vier instemmende onbekenden in een gezamenlijke boyband-pose.','Easy',10),
('ade00008-0000-4000-8000-000000000005','De verkleedpartij','Maak een foto waarop je een kledingstuk of accessoire van een vreemde draagt.','Een foto met het geleende kledingstuk of accessoire, met toestemming van de eigenaar.','Easy',10),
('ade00008-0000-4000-8000-000000000006','Maak foto met de DJ','Maak een foto met de DJ.','Een foto waarop jij samen met een instemmende DJ staat.','Easy',10),
('ade00008-0000-4000-8000-000000000007','Vraag een nummertje aan bij de DJ','Vraag een nummertje aan bij de DJ via Snapchat-tekst.','Een foto van je verzoek in Snapchat-tekst bij de DJ. Houd privéberichten en contactgegevens buiten beeld.','Easy',10),
('ade00008-0000-4000-8000-000000000008','De menselijke piramide','Maak een foto van een menselijke piramide met minimaal zes mensen, waarvan minstens drie onbekenden.','Een foto van minimaal zes instemmende mensen, waaronder minstens drie onbekenden. Kies een lage, stabiele pose zonder op schouders te klimmen.','Awkward',30),
('ade00008-0000-4000-8000-000000000009','De reünie','Maak een overtuigende familiefoto met minimaal vijf volslagen vreemden, inclusief een vader, moeder en kinderen.','Een geposeerde familiefoto met minimaal vijf instemmende vreemden die de rollen van vader, moeder en kinderen spelen.','Awkward',30),
('ade00008-0000-4000-8000-00000000000a','De celebrity','Maak een foto met iemand die opvallend veel lijkt op een bekende Nederlander of internationale artiest.','Een foto met een instemmende lookalike van een bekende Nederlander of internationale artiest.','Awkward',30),
('ade00008-0000-4000-8000-00000000000b','De hoofdact','Maak een selfie met een DJ die daadwerkelijk op het festival draait. Geen foto vanaf het publiek, echt samen op de foto.','Een gezamenlijke selfie met een instemmende DJ die op het festival draait; een foto vanaf het publiek telt niet.','Legendary',100),
('ade00008-0000-4000-8000-00000000000c','De legendarische elf','Verzamel elf wildvreemden voor een officiële voetbalelftalfoto, inclusief twee rijen, een keeper en iemand die als bondscoach poseert.','Een officiële elftalfoto met elf instemmende onbekenden, twee rijen, een keeper en een bondscoach.','Legendary',100),
('ade00008-0000-4000-8000-00000000000d','Help Fin aan een date na ADE','Help Fin aan een date na ADE, als Fin en de ander dat allebei leuk vinden.','Een foto ter bevestiging met toestemming van Fin en de ander; deel geen privéchats, telefoonnummers of contactgegevens.','Legendary',100);

-- Templates affect future crews only; no submissions reference template rows.
delete from public.challenge_templates where id not in(select id from ade_challenge_catalog);
insert into public.challenge_templates(id,title,description,evidence,festival,difficulty,points,repeatable)
select id,title,description,evidence,'ADE',difficulty,points,false from ade_challenge_catalog
on conflict(id) do update set title=excluded.title,description=excluded.description,evidence=excluded.evidence,
 festival=excluded.festival,difficulty=excluded.difficulty,points=excluded.points,repeatable=false;

-- Replace the active list in the one shared group; legacy private crews are unchanged.
do $$declare community uuid;begin
 select crew_id into community from public.community_settings where singleton;
 if community is null then raise exception 'De gezamenlijke groep ontbreekt';end if;
 update public.challenges set active=false where crew_id=community and active and id not in(select id from ade_challenge_catalog);
 insert into public.challenges(id,crew_id,title,description,evidence,festival,difficulty,points,repeatable,active)
 select id,community,title,description,evidence,'ADE',difficulty,points,false,true from ade_challenge_catalog
 on conflict(id) do update set title=excluded.title,description=excluded.description,evidence=excluded.evidence,
 festival=excluded.festival,difficulty=excluded.difficulty,points=excluded.points,repeatable=false,active=true
 where challenges.crew_id=excluded.crew_id;
 if (select count(*) from public.challenges where crew_id=community and active)<>13 then
  raise exception 'De actieve catalogus kon niet volledig worden ingesteld; er is niets gewijzigd';
 end if;
end$$;

COMMIT;
SELECT 'Crew Control database geïnstalleerd' AS status, count(*) AS challenge_templates FROM public.challenge_templates;
