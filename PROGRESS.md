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

## Herstel na handmatige Auth-accountverwijdering

- Het generieke aansluitingsscherm verborg de werkelijke fout. De client verifieert bij een mislukte inschrijving of de Auth-identiteit nog bestaat; een verwijderde/verlopen identiteit wordt lokaal uitgelogd. Er is ook een expliciete knop terug naar inloggen.
- Ontbrekende platformfunctie, ontbrekende platformconfiguratie en onbevestigde e-mail krijgen afzonderlijke meldingen; overige gevallen tonen een foutcode. Er wordt geen productie-SQL uitgevoerd of e-mailbevestiging uitgeschakeld.
- Inlogscherm kan een signup-bevestigingsmail opnieuw aanvragen, met behoud van invitecallback. Verzendfouten worden getoond; een succesvolle API-aanvraag claimt niet dat een mail is afgeleverd.
- Gerichte browsercases simuleren een ontbrekende RPC, een door Auth geweigerde oude identiteit, een mailratelimiet en een succesvolle heraanvraag. Hosted oorzaak/mailbezorging blijven onbekend zonder toegang tot Auth Users en logs. Geen nieuwe migratie nodig voor deze clientcorrectie.

## Crew Control V3 met persoonlijk Feest afronden

- Vaste Feed-tab toegevoegd naast Home, Tijdlijn, Crew en Challenges. Eén sociale laag op bestaande submissions/reviews/awards, met stemstand, alle statussen, reacties, notificaties en unread counters. Bestaande review-RPC en server-scoretransacties behouden.
- Media-album met serverfilters, alle inzendstatussen, fullscreen, swipe/vorige/volgende en terug naar Feed; private, kortlevende links met herhaalde crewcontrole. Uploadpreview en native foto/video-inputs toegevoegd, inclusief behouden invoer na fouten.
- Mobiele audit vastgelegd in `docs/MOBILE_UX_AUDIT.md`. Stabiele realtimekanalen bij tabwissels, skeletons, sheets, safe areas, toetsenbordviewport, browser Back en scrollposities. Geen extra dependencies.
- Gebruikersaanvulling: persoonlijk Feest afronden stopt het Home-registratieblok zonder historie te wissen. Opnieuw starten begint leeg. Alleen de eigen sessie verandert; de bestaande toestemming bepaalt of anderen de eindstatus zien. Geen effect-/veiligheidsberekeningen of sociale gezondheidsmeldingen.
- Migratie 005: private reacties en eigen notificaties, geldige huidige stemtotalen, challenge-activiteitstriggers en uitgebreid gegevenswissen. Migratie 006: private `party_state`, idempotente eigen start/eindfuncties en historische selectie op nieuwe sessie-invoer. Beide lokaal toegepast; eerdere data en migraties behouden.
- Bestaande V2-installaties voeren eenmaal het volledige `docs/enable-social-v3.sql` uit via Supabase SQL Editor. Vereist 001–004. Verwacht `Crew Control V3 ingesteld`. Geen nieuwe env-vars of extra realtimepublicaties. Verse installaties gebruiken alle zes migraties of de volledige bundel.
- Validatie: 42 integratietests, 7 unit-tests en productiebuild slagen. 18 desktop-/mobiele Chromium-cases, inclusief de driegebruikersfeed zonder polling en een afspeelbare video. Extra browsercontrole voor swipen en opnieuw inloggen na sessiewissel is opgenomen. De definitieve typecheck, lint, productiebuild en alle 18 browsercases zijn opnieuw geslaagd, inclusief fullscreen swipe, terugknop en scrollherstel. `npm audit --omit=dev --audit-level=high` meldt 0 kwetsbaarheden.
- Hosted toegang blijft ontbreken; geen directe Supabase-migratie, Vercel-beheeractie of publieke URL-verificatie mogelijk. Native Git werkt; push naar main kan de bestaande Vercel-koppeling activeren. iPhone Safari en fysieke camera blijven niet geverifieerd.

## Registratieranglijst en camera/uploadherstel

- Gebruiker verduidelijkt: de ranglijst telt registratiemomenten, geen hoeveelheden. Crew heeft nu Leden en Ranglijst registratiemomenten, aflopende aantallen, gelijke posities en exact label-/dagfilter. Alleen eigen/toegestane RLS-samenvattingen worden gebruikt; geen punten of veiligheidsberekeningen.
- Home heeft een cameraknop met beschikbare challengekeuze. Gedeelde camera voor Home, challenge en profiel met ongespiegeld canvasbeeld, camera wisselen, stoppen van tracks en native fallback. Foto’s worden als kleinere JPEG verwerkt; spiegelcorrectie is expliciet en zichtbaar in de uiteindelijke preview.
- Upload en indienen delen één helper met vaste UUID, veilig hergebruik na 409 en concrete inline fouten. Bekende reeds ingezonden eenmalige challenges tonen de bestaande inzending. Geen SQL-/privilegewijziging nodig; bestaande buckets en alle data blijven behouden.
- De gebruiker meldde uitsluitend de oude algemene uploadmelding. De precieze hosted oorzaak is daarmee niet bekend; de nieuwe deployment toont de echte fout per fase. HEIC-decodering is browserafhankelijk, geen extra decoderlibrary toegevoegd.
- Nieuwe tests bewijzen pixelrichting, expliciete correctie, private orphan-upload, retry zonder dubbele inzending en toestemming/volgorde van de ranglijst. De volledige controles staan in TESTING.md. Hosted deployment en fysieke iPhonecamera blijven buiten de beschikbare projecttoegang.

De eindcontrole van de camera-/ranglijstupdate slaagt: 9 unit-tests, 20 desktop-/mobiele browsertests, typecheck, lint en productiebuild. De snapshots zijn bekeken; de mobiele cameraflow is ingekort met preview vóór vervangopties. Geen nieuwe migraties of dependencies. De nieuwe concrete foutmelding moet de hosted oorzaak zichtbaar maken als de upload bij de gebruiker nog mislukt.

## Voorbereiding schone livegang

- Gebruiker wil testgegevens wissen en bevestigt expliciet dat accounts behouden moeten blijven. Voorbereid: `docs/reset-test-data.sql`, handmatig als projecteigenaar uitvoeren na het legen van uitsluitend crew-evidence via Storage. Profielen/avatars, rollen, crews, challenges en beveiliging blijven; content/uitnodigingen verdwijnen en delen wordt privé. Geen productie-uitvoering zonder hosted toegang.
- Reset op een afzonderlijke lokale databasekopie getest met behoudchecks, Storage-guard, herhaalbaarheid en gewone inschrijving na de reset. Kopie na afloop verwijderd. Het script heeft geen remote databaseoptie.
- Gebruiker heeft custom SMTP niet ingesteld, maar heeft wel een eigen domein. `docs/DOMEIN-EN-LIVEGANG.md` beschrijft de volledige route: app-subdomein naar Vercel, publieke Production, Resend-verzenddomein/DNS, Supabase SMTP en callbacks, externe proefregistratie, definitieve reset en delen. Sleutels uitsluitend in de dashboards.
- Geen domeinnaam, DNS-, Resend- of hosted Supabase-/Vercel-beheerverbinding beschikbaar. Geen externe wijzigingen of publieke mailbezorging geclaimd. De handleiding en opschoonbestanden worden naar GitHub gepusht voor uitvoering door de projecteigenaar.

## Eén vaste groep

De crewkeuzestap is verwijderd: na profielopslag voltooit de app onboarding in de bestaande gezamenlijke groep. Ook bestaande accounts met een onderbroken onboarding of andere actieve crew keren terug naar die groep. Het menu voor crewkeuze/-aanmaak en uitnodigingsbeheer is verwijderd; oude uitnodigingslinks verwijzen naar de publieke startpagina. Accounts en bestaande privécrewdata worden niet verwijderd of verplaatst. Geen nieuwe SQL of omgevingsvariabele nodig.

TypeScript, lint en productiebuild geslaagd; vier gerichte browsercases tegen lokale productiebuild op desktop en mobiel controleren directe toegang, gedeelde groeps-ID, oude links, profielfoto, registratie en opnieuw inloggen. Hosted uitrol niet zelfstandig geverifieerd.

## ADE Selectie: officiële 3-0-3, exclusief opstellingsbeheer en kleedkamer

Home bevat een echt interactief veld met Linksvoor/Spits/Rechtsvoor, CV Links/CV Centraal/CV Rechts en één Keeper. Zeven vaste slots koppelen echte accounts aan eigen profielfoto, spelersnaam, bijnaam en uniek rugnummer. Er zijn geen verzonnen spelers of foto's. Accountkeuze wisselt bezette spelers atomair; serverconstraints bewaken de zeven posities, unieke accounts/nummers, groepslidmaatschap en versieconflicten. De registratie- en cameraknoppen staan vóór het veld en blijven sticky bereikbaar. De mobiele portretten zijn minimaal 64 px breed; lange namen breken af binnen de kolom. Animaties respecteren reduced motion.

Naar aanleiding van de verduidelijking van de eigenaar krijgt Lucas geen account of rechten: hij blijft de zichtbare bondscoach. Eén expliciet aangewezen opstellingsbeheerder koppelt de accounts en publiceert namens Lucas. Migratie 007 neemt een bestaande unieke admin over als manager; anders kan een bestaande admin de lege rol claimen of wijst de projecteigenaar via de gedocumenteerde UID-stap zichzelf expliciet aan. Namen en signupmetadata geven nooit privileges. Na aanwijzen kunnen ook andere admins de selectie-API niet gebruiken; hun bestaande algemene ledenbeheerrechten blijven intact. De manager kan de rol bewust overdragen via de beveiligde RPC; niemand kan zonder rechten zichzelf aanwijzen.

Tappen opent een spelersprofiel met alle verdiende challengepunten, gepagineerde ingezonden foto's en RLS-gefilterde geschiedenis. Foto's gebruiken de bestaande private Storage en kortlevende URL's. Registraties van anderen verschijnen alleen met de bestaande deeltoestemming; intrekken verwijdert de geschiedenis via live invalidatie. Een beheerder/bondscoach krijgt geen inzage in privéregistraties. De kleedkamer bevat member-only wedstrijdverslagen met idempotent publiceren, bewerken en bevestigde verwijdering. Alleen gesaniteerde activiteitssignalen gaan via realtime; berichttekst, namen en registraties niet. Account-/dataverwijdering wist eigen opstellingsidentiteit en eigen verslagen; slots blijven bestaan.

Nieuw: `docs/enable-ade-selection.sql` voor bestaande V3-databases, bijgewerkte volledige installatie, `docs/ADE-SELECTIE.md` voor daadwerkelijke accountkoppeling/rechten en Vercel-uitrol. De opschoon-SQL verwijdert voortaan ook wedstrijdverslagen wanneer de upgrade bestaat en bewaart opstelling/managerconfiguratie. De resetverificatie bewaakt die nieuwe configuratie expliciet.

De genoemde referentieafbeelding was niet als toegankelijke bijlage aanwezig. De visual volgt de exact opgegeven posities, maar een vergelijking met de originele afbeelding is daarom niet geclaimd. Hosted Supabase-/Vercel-credentials, CLI en integraties ontbreken; migratie 007 moet door de projecteigenaar in de bestaande SQL Editor worden uitgevoerd. De GitHub-push kan de bestaande automatische Vercel-uitrol starten, maar de externe deployment en productiegegevens zijn niet zelfstandig gecontroleerd.

Eindcontrole: 11 unit-tests, 50 echte lokale integratietests en alle 22 desktop-/mobiele Chromium-browsercases tegen de productiebuild geslaagd. TypeScript, lint en productiebuild geslaagd; de accountbehoudende reset is inclusief verslagen en behoud van opstelling/managerconfiguratie in een wegwerpdatabasekopie geverifieerd. Geen hosted database of fysieke iPhone/Safari getest.

## Profiel aanpassen en ontbrekende beheerknop

De gebruiker zag drie accounts met lege profiel-/onboardingdatums en geen knop Opstelling beheren. Zulke profielrijen ontstaan al bij aanmelden; de screenshot bewijst niet of de e-mail bevestigd is. De beheerknop is bewust uitsluitend voor team_settings.manager_id en eventueel de bestaande admin die een lege rol mag claimen. Zonder hosted toegang is de feitelijke productie-instelling niet uitgelezen of gewijzigd.

Naam/foto bewerken is direct bereikbaar via Mijn profiel → Naam en foto aanpassen en een Home-verwijzing zonder foto. De bestaande instellingenroute blijft werken. Profielafronding wordt gecontroleerd onafhankelijk van onboardingafronding. De editor toont ook bevestigde accounts zonder afgerond profiel of foto, markeert hun status en gebruikt standaard een lege naamoverride zodat de nieuwste profielnaam automatisch volgt. Expliciete afwijkende spelersnamen blijven mogelijk. Home toont bij ontbrekende beheerrechten welk account beheert, of dat de rol nog niet is aangewezen; het verleent geen rechten.

Nieuw dashboardherstelbestand docs/herstel-opstellingsbeheer.sql vraagt expliciet de eigen User UID. Het kent uitsluitend dat bevestigde account opstellingsbeheer toe, herstelt groepslidmaatschap voor bevestigde accounts en bewaart bestaande namen/foto's, opstelling, deeltoestemming, adminrollen en privéregistraties. Het bevestigt geen e-mail en markeert profielen niet voltooid. Nul-UUID, onbekende en onbevestigde accounts worden geweigerd. Bij ontbrekende selectie-update noemt het bestand de benodigde upgrade.

Verificatie: productiebuild, TypeScript, lint en 11 unit-tests geslaagd. Zes gerichte desktop-/mobiele Chromium-cases tegen productiemodus bewijzen later wijzigen van naam/foto na opnieuw inloggen, persistentie na herladen, opstellen van een account met alle drie profielvelden NULL en live doorvoeren van diens later opgeslagen naam/foto. De geometrieassertie gebruikt layout-offsets zodat de bestaande hoveranimatie geen vals alarm veroorzaakt. scripts/verify-selection-repair.mjs is geslaagd in een weggegooide kopie van uitsluitend de lokale database: behoud van bestaande gegevens/privacy, geen adminpromotie, bevestigde accounts herstellen, onbevestigde uitsluiten en veilig herhalen. Geen productiegegevens aangepast. De code wordt naar main gepusht voor Vercels bestaande automatische build; de hosted beheerinstelling vereist nog de dashboardhandeling van de eigenaar.

## Officiële ADE-challenges: 7 × 10, 3 × 30, 3 × 100

De gevraagde dertien challenges zijn opgenomen: dubbelganger, festivalbruiloft, uitsmijter, boyband, verkleedpartij, foto met de DJ en Snapchat-verzoek voor 10 punten; menselijke piramide, reünie en celebrity voor 30; hoofdact, legendarische elf en Fin aan een date helpen voor 100. De omschrijvingen volgen de opdracht, met bewijsvereisten die de bestaande vrijwilligheid/toestemming bewaken. De UI toont Makkelijk/Medium/Bijna onmogelijk; oude niveauwaarden blijven ondersteund voor historie. ADE is als festival toegevoegd aan database, validatie, filters en beheerformulier.

Migratie 008 en het hele dashboardbestand docs/enable-ade-challenges.sql vervangen de actieve lijst uitsluitend in de gezamenlijke groep. Oude challenges worden gearchiveerd; submissions/reviews/awards bewaren hun bestaande titel-/puntensnapshots en private bestanden. Nieuwe templates gelden voor toekomstige crews; bestaande privécrews blijven ongemoeid. Vaste catalogus-ID's en upserts voorkomen duplicaten bij herhalen. Het bestand vereist geen UUID, credentials of handmatige aanpassingen. De volledige verse installatie bevat dezelfde migratie.

Verificatie: 11 unit-tests, 50 echte lokale integratietests, TypeScript, lint en productiebuild geslaagd. Van de 24 desktop-/mobiele browsercases slaagden er 22 in de volledige run; twee registratiemeldingsasserties zijn verduidelijkt om de al bestaande tweede statusmelding over opstellingsbeheer te onderscheiden, waarna beide betrokken cases geslaagd zijn herhaald. Nieuwe browsercases controleren de dertien actieve kaarten, ADE-filter, de 7/3/3-verdeling, punten en de Snapchat-/Fin-bewijssheets. Alle bestaande foto-/camera-/review-/sociale-/profiel-/selectieflows zijn op desktop en mobiel gecontroleerd.

scripts/verify-ade-challenges.mjs voert de dashboardupgrade tweemaal uit in een wegwerpdatabasekopie en bewijst behoud van accounts/profielen/mediareferenties/registraties/consents/opstelling/privécrews en een historische inzending met 55 daadwerkelijk via reviews toegekende punten. De oude opdracht wordt inactief en er blijven exact dertien actieve opdrachten. De bestaande accountbehoudende resetverificatie slaagt ook met de nieuwe catalogus. Hosted Supabase-toegang ontbreekt: de eigenaar moet het nieuwe SQL-bestand één keer uitvoeren; de push naar main start de bestaande Vercel-integratie, zonder zelfstandig geclaimde productie-uitrol.
