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
