-- Alleen ALLE middelregistraties verwijderen, in alle groepen.
-- Alle accounts, profielen, foto's, challenges, punten, opstelling, wedstrijdverslagen,
-- check-ins, feeststatus, rollen en deeltoestemmingen blijven behouden.
-- Voer het HELE bestand uit in Supabase > SQL Editor > New query. Niets invullen.
-- Gebruik hiervoor NIET het oudere reset-test-data.sql: dat verwijdert meer gegevens.
DO $reset_registraties$
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 LOCK TABLE public.records IN SHARE ROW EXCLUSIVE MODE;
 DELETE FROM public.records;
END
$reset_registraties$;
SELECT 'Registraties verwijderd; overige gegevens behouden' AS status,
 (SELECT count(*) FROM public.records) AS resterende_registraties;
