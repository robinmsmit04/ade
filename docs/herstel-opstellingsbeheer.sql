-- Bestaande ADE Selectie-database. Wist geen accounts, profielen, opstelling of registraties.
-- 1. Supabase > Authentication > Users: kopieer de User UID van JOUW EIGEN account.
-- 2. Vervang hieronder uitsluitend 00000000-0000-0000-0000-000000000000 door die UID.
-- 3. Voer DIT HELE BESTAND uit in SQL Editor > New query, zonder tekstselectie.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE
 mijn_account uuid := '00000000-0000-0000-0000-000000000000';
 groep uuid;
BEGIN
 IF mijn_account='00000000-0000-0000-0000-000000000000'::uuid THEN
  RAISE EXCEPTION 'Vervang eerst de nul-UUID door jouw eigen User UID uit Authentication > Users. Gebruik geen wachtwoord of API-key.';
 END IF;
 IF to_regclass('public.team_settings') IS NULL OR to_regclass('public.team_lineup') IS NULL THEN
  RAISE EXCEPTION 'De ADE Selectie-update ontbreekt. Voer eerst het hele bestand docs/enable-ade-selection.sql uit; voer daarna dit herstelbestand opnieuw uit.';
 END IF;
 SELECT crew_id INTO groep FROM public.community_settings WHERE singleton;
 IF groep IS NULL THEN RAISE EXCEPTION 'De gezamenlijke groep is nog niet ingesteld.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=mijn_account AND email_confirmed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Jouw User UID bestaat niet of je e-mail is nog niet bevestigd. Controleer Authentication > Users.';
 END IF;
 -- Confirmed accounts are eligible even before choosing a name/photo or completing onboarding.
 -- Never confirm emails here, grant admin roles, mark onboarding complete or overwrite consent.
 INSERT INTO public.profiles(id,display_name)
 SELECT id,left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),'Crewlid'),60)
 FROM auth.users WHERE email_confirmed_at IS NOT NULL ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.members(crew_id,user_id,role)
 SELECT groep,id,'member' FROM auth.users WHERE email_confirmed_at IS NOT NULL
 ON CONFLICT(crew_id,user_id) DO NOTHING;
 INSERT INTO public.consents(crew_id,user_id,sharing)
 SELECT crew_id,user_id,false FROM public.members WHERE crew_id=groep
 ON CONFLICT(crew_id,user_id) DO NOTHING;
 UPDATE public.team_settings SET manager_id=mijn_account,version=version+1 WHERE crew_id=groep;
 IF NOT FOUND THEN RAISE EXCEPTION 'De selectie-instellingen ontbreken voor deze groep. Laat de database-inrichting controleren.'; END IF;
END $$;
COMMIT;

SELECT 'Opstellingsbeheer ingesteld; bevestigde accounts gekoppeld' AS status;
SELECT p.id AS account_id,p.display_name AS naam,
 (u.email_confirmed_at IS NOT NULL) AS email_bevestigd,
 (p.profile_completed_at IS NOT NULL) AS profiel_ingevuld,
 (p.avatar_path IS NOT NULL) AS heeft_profielfoto,
 (m.user_id IS NOT NULL AND u.email_confirmed_at IS NOT NULL) AS beschikbaar_voor_selectie,
 coalesce(p.id=t.manager_id,false) AS opstellingsbeheerder
FROM auth.users u
JOIN public.profiles p ON p.id=u.id
CROSS JOIN public.community_settings s
LEFT JOIN public.members m ON m.crew_id=s.crew_id AND m.user_id=u.id
LEFT JOIN public.team_settings t ON t.crew_id=s.crew_id
ORDER BY opstellingsbeheerder DESC,p.display_name;
