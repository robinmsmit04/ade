# Crew Control — voortgang

Bijgewerkt: 21 oktober 2026.

## Implementatie

- [x] Lege repository opgebouwd met Next.js App Router, React/TypeScript, Tailwind, shadcn/ui/Radix Button, Zod en React Hook Form.
- [x] Login/registratie, PKCE-e-mailcallback, wachtwoordherstel en wijziging.
- [x] Privécrews, uitnodigingen, adminrollen, ledenbeheer en overdracht.
- [x] Historische registraties, tijdlijn, correctie/verwijdering, vriendprofiel en opt-in delen per crew.
- [x] Check-ins met individuele deelkeuze en vrijwillige hulpvraag.
- [x] Twee SQL-migraties: relationele database, constraints, indexes, kolomrechten en RLS.
- [x] Twintig aantoonbare foto/videochallenges, DGTL/KI/KI, vier niveaus, beheer en archivering.
- [x] Private bewijsuploads, review door andere leden, configureerbare drempel en transactieve puntentoekenning.
- [x] Leaderboard per festival, Amsterdamse kalenderdag en totaal; private galerij.
- [x] Realtime-invalidatie, reconnect/polling, fout-/lege-/laadstatussen en idempotente retries.
- [x] Export, persoonlijke dataverwijdering en accountverwijdering, inclusief storage-opruiming.
- [x] PWA-manifest, serviceworker zonder gevoelige cache, Apple-/maskable icons, mobile safe area en offlinepagina.
- [x] README, SETUP, ARCHITECTURE, TESTING, .env.example en CI-workflow.

## Aangetoond

- 7 unit-tests, 12 integratietests tegen echte lokale services en 8 desktop/mobiele Chromium-tests slagen.
- Integratietests controleren expliciet RLS, andere crews, ingetrokken consent, echte realtime, media-autorisatie, gelijktijdige stemmen, onwijzigbare puntmomentopname en accountverwijdering.
- Browserflows controleren ook invoerbehoud bij offline opslaan en upload → twee reviews → ranglijst/galerij.
- Typecheck, lint, productiebuild en productie-dependency-audit slagen. Ook een schone `npm ci` gevolgd door typecheck, lint, unit-tests en een geconfigureerde productiebuild is geslaagd.
- Standaard Supabase-image was te groot voor de Docker VFS-capaciteit; de kleinere lokale stack draait met echte diensten. Startup en plugininstallatie zijn herhaald en gecontroleerd. Zie SETUP.md.

## Externe vervolgstappen

- [ ] Eigen Supabase-project aanmaken/koppelen, migraties toepassen en publieke clientinstellingen opgeven.
- [ ] Productie-SMTP, e-mailbevestiging en toegestane authredirects instellen.
- [ ] Vercel koppelen en op het echte HTTPS-domein deployen.
- [ ] Hosted eindcontrole en fysieke iPhone/Safari/PWA/video-test uitvoeren.
- [ ] WebKit-binary installeren; download werd hier door de domeinallowlist geweigerd.
- [ ] Back-ups, media-bewaartermijn en periodieke opruiming van verweesde uploads inrichten.
- [ ] GitHub Actions-run en Vercel-publicatie verifiëren; een toegevoegd workflowbestand is geen geslaagde remote run.

De applicatie is lokaal functioneel met echte persistente PostgreSQL/Storage, geen nepbackend. Een productieomgeving is nog niet gepubliceerd. Actuele commit-/push- en configuratieopslagstatus wordt bij oplevering hieronder toegevoegd.

## Herbruikbare cloudconfiguratie

- Installatiescript en volledige startinstructies opgeslagen in een bevestigd configuratieconcept.
- Publieke Supabase-variabelen als vereisten geregistreerd, zonder waarden of externe geheimen.
- `cdn.playwright.dev` aan de voorgestelde custom netwerkallowlist toegevoegd; bestaande presets behouden. Dit concept is nog niet op de runtime toegepast of gepubliceerd.
- Review, opslaan en publiceren in de omgevingsinstellingen blijven een gebruikersactie.

## Laatste oplevercontrole

- Schone lockfile-installatie, typecheck, lint, 7 unit-tests en productiebuild geslaagd.
- Alle 8 browsercontroles ook tegen `next start` (productiemodus) geslaagd.
- 12 integratietests geslaagd; daadwerkelijke realtime en accountverwijdering zijn afzonderlijk gecontroleerd.
- Implementatiecommit `d7496ce` is succesvol naar `origin/main` gepusht; Git bevestigde het aanmaken van de remote branch. De documentatie wordt in een opvolgcommit bijgewerkt.

## Deploymentcontrole

- GitHub `main` gecontroleerd: gelijk aan lokale HEAD vóór de nieuwe realtime-correctie.
- Geen beschikbare Supabase-/Vercel-integratie; Supabase CLI mist accounttoken en Vercel CLI meldt uitgelogd. Bestaande lokale Supabase-testcredentials zijn geen hosted accounttoegang.
- Management-API's `api.supabase.com` en `api.vercel.com` worden door de huidige netwerkpolicy geblokkeerd. Beide bestemmingen en de vereisten `SUPABASE_ACCESS_TOKEN` en `VERCEL_TOKEN` zijn bevestigd opgeslagen in het cloudconfiguratieconcept. Waarden ontbreken nog; opslaan van het concept is geen runtime-activering of publicatie.
- Bij hercontrole een koude-startprobleem gevonden: de Realtime-client meldde een WebSocket-join vóór de PostgreSQL-subscriptie klaar was. De Live-indicator en integratietest wachten nu op de daadwerkelijke PostgreSQL-gereedheidsmelding. Na een expliciete restart van Realtime slagen alle 12 integratietests.
- Hosted migraties, Auth-redirects, Vercel-variabelen en publieke deployment zijn nog niet uitgevoerd: accounttoegang en het bedoelde Supabase-project ontbreken. Geen publieke HTTPS-URL aangemaakt en geen productie-eindtests geclaimd.
- GitHub Actions API is via deze omgeving niet toegankelijk; een geslaagde CI-run is daarom niet bevestigd. Native Git-toegang werkt wel.
- De gecorrigeerde productiebuild is opnieuw getest: alle 8 Chromium-browsertests slagen op desktop en mobiel formaat. De wijziging en deze bevindingen worden naar `main` gepusht.

## Handmatige Supabase-installatie

- Gebruiker kreeg syntaxfout op regel 1 bij `token:=...`. Deze regel hoort binnen de `create_invite`-functie en is geen zelfstandig SQL-statement. Een onvolledig geplakt of geselecteerd fragment kan deze fout veroorzaken; hosted database-inhoud is niet geïnspecteerd.
- De twee bestaande migraties zijn ongewijzigd gebundeld in `docs/supabase-setup.sql`, met één transactie en een resultaatcontrole op 20 templates. Dit bestand staat buiten de migratiemap zodat de CLI het niet nogmaals toepast.

## Bevestigingsmail

- Gebruiker meldt dat hosted registratie, e-mailbevestiging en opnieuw inloggen werken; niet zelfstandig vanuit deze cloudomgeving geverifieerd.
- Nederlandstalige HTML-template in Crew Control-stijl toegevoegd onder `supabase/templates/confirmation.html`. Supabase `ConfirmationURL` blijft intact; geen externe assets of echte tokens opgenomen.
- Browserpreview past op 320 en 600 pixels. De projecteigenaar moet de template nog in het hosted Supabase-dashboard opslaan; mailclientweergave en verzending daarna controleren.

## Gewijzigde productflow: dezelfde URL voor iedereen

- Gebruiker wil geen crew aanmaken of uitnodigingen beheren. App opent voortaan één gezamenlijke omgeving na registratie en e-mailbevestiging.
- Nieuwe migratie `202610210003_shared_platform.sql`: singletonconfiguratie, bestaande bevestigde accounts inschrijven, Auth-trigger na bevestiging, idempotente inschrijving bij inloggen en behoud van het platform bij accountverwijdering. Geen automatische beheerderstoewijzing.
- Crewcreatie, crewkeuze en uitnodigingen uit de gebruikersinterface verwijderd; oude uitnodigingslinks leiden naar de root-URL. Deeltoestemming blijft standaard uit en noemt expliciet alle bevestigde platformaccounts. Oude privécrewgegevens worden niet verplaatst of ontsloten.
- Lokale migratie toegepast; 18 integratietests en de SQL-test voor onbevestigd → bevestigd geslaagd. Typecheck, lint en unit-tests worden opnieuw gecontroleerd, evenals de gewijzigde browserflows.
- Hosted actie blijft noodzakelijk zonder accounttoegang: in Supabase SQL Editor uitsluitend `docs/enable-shared-platform.sql` uitvoeren. Volledige installatie in `docs/supabase-setup.sql` bijgewerkt voor nieuwe lege projecten.
- Eindcontrole van deze wijziging geslaagd: typecheck, lint, 7 unit-tests, 18 integratietests, productiebuild en 8 browsercases tegen productiemodus (desktop en mobiel). De SQL-test bevestigt bovendien dat de gezamenlijke omgeving behouden blijft wanneer de laatste beheerder het eigen account verwijdert. De handmatige update is lokaal opnieuw uitgevoerd zonder dubbele challenges of nieuwe deeltoestemming.

## Crew Control V2

- Bestaande applicatie omgebouwd naar persoonlijk Home, twee-stapsregistratie, gefilterde tijdlijn, crewkaarten en vier hoofdtabbladen. Challenges behouden reviews, leaderboard en private wall als subnavigatie. Profielmenu bevat privacy, instellingen, crewkeuze en beheer.
- Nieuwe accounts krijgen persistente naam-/foto-onboarding en kunnen gezamenlijk doorgaan, een privécrew maken of een uitnodiging volgen. Geen verplichte crewcreatie; bestaande bevestigde accounts slaan de nieuwe stappen over.
- Migratie 004 voegt private profielfoto’s en gecontroleerde profiel-/crewfuncties toe. Tijdlijn en neutrale statistieken volgen caller-RLS, ook voor aantallen. Geen punten voor middelenregistraties; de bestaande record- en challengebeveiliging blijft behouden.
- Lokale controles: 26 integratietests, 7 unit-tests, typecheck, lint en productiebuild geslaagd. 12 desktop-/mobiele Chromium-browsercases tegen productiemodus; aanvullende regressiecontrole voorkomt foutmeldingen na uitloggen en onjuist doorwerken van een crew-datumfilter op Home.
- Hosted vervolgstap: voer eenmaal het volledige `docs/enable-mobile-v2.sql` uit via Supabase SQL Editor, met de eerste drie migraties als bestaande basis. Verwachte status: `Crew Control V2 ingesteld`. Geen nieuwe omgevingsvariabelen nodig. Nieuwe lege projecten gebruiken de volledige installatie met vier migraties.
- Geen hosted Supabase-/Vercel-beheerrechten in deze sessie. Native Git-push kan de gekoppelde Vercel-build activeren; publieke readiness is niet vanuit hier bevestigd. WebKit/fysieke iPhone niet getest.
