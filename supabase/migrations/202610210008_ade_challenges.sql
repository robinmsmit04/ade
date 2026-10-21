-- One atomic statement: no temporary tables, no dependency on session or COMMIT behavior.
do $ade_catalog$
declare
 community uuid;
 catalog jsonb;
begin
 select jsonb_agg(to_jsonb(row_data)) into catalog
 from (values
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
('ade00008-0000-4000-8000-00000000000d','Help Fin aan een date na ADE','Help Fin aan een date na ADE, als Fin en de ander dat allebei leuk vinden.','Een foto ter bevestiging met toestemming van Fin en de ander; deel geen privéchats, telefoonnummers of contactgegevens.','Legendary',100)
 ) as row_data(id,title,description,evidence,difficulty,points);
alter table public.festivals drop constraint if exists festivals_id_check;
alter table public.festivals add constraint festivals_id_check check(id in ('DGTL','KI/KI','ADE'));
insert into public.festivals(id,name) values('ADE','ADE') on conflict(id) do update set name=excluded.name;

-- Templates affect future crews only; no submissions reference template rows.
delete from public.challenge_templates where id not in(select id from jsonb_to_recordset(catalog) as catalog_row(id uuid,title text,description text,evidence text,difficulty text,points integer));
insert into public.challenge_templates(id,title,description,evidence,festival,difficulty,points,repeatable)
select id,title,description,evidence,'ADE',difficulty,points,false from jsonb_to_recordset(catalog) as catalog_row(id uuid,title text,description text,evidence text,difficulty text,points integer)
on conflict(id) do update set title=excluded.title,description=excluded.description,evidence=excluded.evidence,
 festival=excluded.festival,difficulty=excluded.difficulty,points=excluded.points,repeatable=false;

-- Replace the active list in the one shared group; legacy private crews are unchanged.
 select crew_id into community from public.community_settings where singleton;
 if community is null then raise exception 'De gezamenlijke groep ontbreekt';end if;
 update public.challenges set active=false where crew_id=community and active and id not in(select id from jsonb_to_recordset(catalog) as catalog_row(id uuid,title text,description text,evidence text,difficulty text,points integer));
 insert into public.challenges(id,crew_id,title,description,evidence,festival,difficulty,points,repeatable,active)
 select id,community,title,description,evidence,'ADE',difficulty,points,false,true from jsonb_to_recordset(catalog) as catalog_row(id uuid,title text,description text,evidence text,difficulty text,points integer)
 on conflict(id) do update set title=excluded.title,description=excluded.description,evidence=excluded.evidence,
 festival=excluded.festival,difficulty=excluded.difficulty,points=excluded.points,repeatable=false,active=true
 where challenges.crew_id=excluded.crew_id;
 if (select count(*) from public.challenges where crew_id=community and active)<>13 then
  raise exception 'De actieve catalogus kon niet volledig worden ingesteld; er is niets gewijzigd';
 end if;


end
$ade_catalog$;
