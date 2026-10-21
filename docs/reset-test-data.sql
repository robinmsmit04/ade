-- Crew Control: alle gebruiks-/testgegevens wissen, accounts en inrichting behouden.
-- Eenmalig als projecteigenaar uitvoeren vóór je vrienden de app gebruiken.
-- BLIJFT: Auth-accounts, profielen/profielfoto's, crews, leden/rollen, challenges,
-- templates, opstelling/opstellingsbeheer, schema, RLS, omgevingsinstellingen en gezamenlijke toegang.
-- WEG: registraties, check-ins, ingezonden media, stemmen, punten, reacties,
-- meldingen, feeststatus, wedstrijdverslagen en uitnodigingslinks. Delen wordt privé.
-- EERST via Supabase Storage de inhoud van uitsluitend crew-evidence verwijderen.
-- Nooit storage.objects via SQL leegmaken: echte bestanden via Storage verwijderen.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
 IF to_regclass('public.party_state') IS NULL OR to_regclass('public.social_notifications') IS NULL THEN
  RAISE EXCEPTION 'De V3-databaseupdate ontbreekt. Pas eerst de bestaande migraties 005 en 006 toe.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.community_settings WHERE singleton) THEN
  RAISE EXCEPTION 'De gezamenlijke omgeving ontbreekt. Controleer eerst de platforminrichting.';
 END IF;
 IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='crew-evidence') THEN
  RAISE EXCEPTION 'Verwijder eerst alle bestanden uit Storage > crew-evidence via het Supabase-dashboard. Accounts en profielfoto’s blijven behouden. Voer daarna dit hele bestand opnieuw uit.';
 END IF;
END $$;

-- Prevent concurrent content changes inside this short reset transaction.
LOCK TABLE public.records,public.checkins,public.submissions,public.reviews,
 public.awards,public.submission_comments,public.social_notifications,
 public.party_state,public.invites,public.consents,public.activity IN SHARE ROW EXCLUSIVE MODE;

-- Also reset reports when the optional ADE Selectie upgrade is installed.
DO $$ BEGIN
 IF to_regclass('public.match_reports') IS NOT NULL THEN
  LOCK TABLE public.match_reports IN SHARE ROW EXCLUSIVE MODE;
  DELETE FROM public.match_reports;
 END IF;
END $$;

DELETE FROM public.submission_comments;
DELETE FROM public.social_notifications;
DELETE FROM public.awards;
DELETE FROM public.reviews;
DELETE FROM public.submissions;
DELETE FROM public.records;
DELETE FROM public.checkins;
DELETE FROM public.party_state;
DELETE FROM public.invites;
UPDATE public.consents SET sharing=false WHERE sharing;
-- Existing invalidation triggers can have created rows during deletion.
DELETE FROM public.activity;
COMMIT;

SELECT 'Crew Control opgeschoond; accounts behouden' AS status,
 (SELECT count(*) FROM auth.users) AS accounts_behouden,
 (SELECT count(*) FROM public.profiles) AS profielen_behouden,
 (SELECT count(*) FROM public.challenges) AS challenges_behouden,
 (SELECT count(*) FROM public.records) AS registraties,
 (SELECT count(*) FROM public.submissions) AS inzendingen,
 (SELECT count(*) FROM public.awards) AS puntenregels,
 (SELECT count(*) FROM storage.objects WHERE bucket_id='crew-evidence') AS challengebestanden;
