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
