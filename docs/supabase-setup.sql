-- Crew Control: volledige installatie voor een leeg Supabase-project.
-- Bestaande installatie? Gebruik docs/enable-shared-platform.sql.
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

COMMIT;
SELECT 'Crew Control database geïnstalleerd' AS status, count(*) AS challenge_templates FROM public.challenge_templates;
