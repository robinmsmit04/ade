# Setup en deployment

## 1. Vereisten

- Node.js >=22 en npm; gebruik `npm ci` met het meegeleverde lockfile.
- Een nieuw Supabase-project en een Vercel-account waarop je mag deployen.
- GitHub-repository `robinmsmit04/ade`.
- Voor lokale integratietests: Docker en de Supabase CLI. Gebruik een wegwerpdatabase, nooit productie.

## 2. Hosted Supabase

1. Maak een project aan. Bewaar het databasewachtwoord buiten deze repository.
2. Koppel de CLI (`supabase login`, `supabase link --project-ref <jouw-ref>`) en voer `supabase db push` uit. Of voer de SQL-bestanden in `supabase/migrations` in volgorde uit in de SQL Editor, als projectbeheerder.
3. De migraties maken tabellen, constraints, RLS, helper/RPC-functies, een gebruikersprofieltrigger, realtimepublicatie, 13 ADE-challengetemplates en de private buckets `crew-evidence` en `profile-photos` aan. Voer ze niet tweemaal handmatig uit. De CLI houdt migratieversies bij.
4. Controleer dat alle applicatietabellen RLS gebruiken en beide buckets **private** zijn. Laat `activity` in `supabase_realtime`; publiceer geen gevoelige registratietabellen.
5. Auth → URL Configuration: stel Site URL in op je productie-URL. Voeg `https://<jouw-domein>/auth/callback` en lokale ontwikkel-URL's toe als toegestane redirects. Voor uitnodigingen na e-mailbevestiging is ook `https://<jouw-domein>/auth/callback?next=/invite/**` nodig (of het ondersteunde globpatroon `https://<jouw-domein>/auth/**`). Sta uitsluitend eigen domeinen toe.
6. Laat e-mailbevestiging in productie aan. Configureer een eigen SMTP-provider, afzender, afleverbaarheid, rate limits in Supabase. De lokale tests gebruiken uitsluitend auto-confirmatie in een afgeschermde wegwerpomgeving.
7. Kopieer de publieke URL en publishable key (legacy `anon` mag ook) naar `.env.local`, overeenkomstig `.env.example`. Dit zijn publieke clientinstellingen, **geen service-role key**. Een service-role key is nergens nodig voor de applicatie.
8. Start `npm run dev`. Registreer twee accounts en bevestig de e-mail. Nieuwe accounts vullen een naam in, kunnen een foto toevoegen en komen direct in de gezamenlijke groep. Bestaande bevestigde accounts van vóór V2 slaan onboarding over. De gezamenlijke omgeving bevat de 13 ADE-challenges.

## 3. Vercel

1. Importeer de repository in Vercel als Next.js-project. Root directory is de repositoryroot; build is `npm run build`. Kies Node 24 (22 of hoger ondersteund).
2. Stel `NEXT_PUBLIC_SUPABASE_URL` en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in voor de bedoelde deploymentomgevingen. Publieke Next.js-variabelen worden bij de build ingebakken; bouw opnieuw na wijzigingen.
3. Deploy met HTTPS. Werk Supabase Site URL en redirect-allowlist bij naar het echte domein. Zet productie-emailbevestiging aan en configureer SMTP.
4. Voer de controlelijst hieronder op het werkelijke domein uit. Deze repository bevat geen claim dat dit al gebeurd is.
5. Safari op iPhone: Delen → Zet op beginscherm. De PWA bevat PNG-icons, een maskable icon, Apple-touch-icon, manifest, safe-area styling en een uitsluitend statische offline cache.

## 4. Normale lokale Supabase-stack

```bash
supabase start
# CLI-status bevat lokale sleutels: deel die output niet.
supabase db reset  # uitsluitend voor de lokale, wegwerpdatabase; wist lokale testdata
```

Stel de lokale API-URL/anon-key in als `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `TEST_SUPABASE_URL` en `TEST_SUPABASE_ANON_KEY`. Houd deze in een genegeerd lokaal bestand of in de procesomgeving. Start Next.js opnieuw na een wijziging.

```bash
npm run test:integration
npm run test:e2e
```

De integratiesuites maken tijdelijke accounts, crews en testmedia aan en verwijderen eigen fixtures na afloop. Bij vroegtijdig afbreken kunnen fixtures achterblijven. Gebruik dus altijd een aparte testomgeving. Externe testprojecten vereisen daarnaast expliciet `ALLOW_REMOTE_TESTS=yes` en uitgeschakelde e-mailbevestiging voor die wegwerpprojecten.

## 5. Kleine fallback voor deze cloudhost

De standaard Supabase-PostgreSQL-image liep hier tegen de capaciteit van de Docker VFS-opslag aan. Een meegeleverde, lokale testopstelling gebruikt de officiële `postgres:17-alpine`, Supabase Auth/Storage/Realtime en PostgREST-images. Dit is testinfrastructuur, geen productie-installatie of vervanging van een beheerd Supabase-project.

```bash
node scripts/local-stack.mjs
# Eerste start bouwt zo nodig de upstream wal2json-plugin; vereist Linux x86_64, gcc, curl, tar en sha256sum.
# De download gebruikt TLS en een vast SHA256; verificatie blijft aan.
node scripts/local-proxy.mjs
# Laat de loopback-proxy draaien; voer in een tweede terminal uit:
node scripts/with-local-env.mjs npm run dev
node scripts/with-local-env.mjs npm run test:integration
```

`local-stack.mjs` genereert willekeurige, uitsluitend lokale database- en JWT-credentials in de genegeerde `.local-stack/`. Het script bewaart geen productiecredentials en schrijft ze niet naar logs. Migraties worden in de lokale database bijgehouden. Opnieuw starten bewaart bestaande testdata. Stop lokale containers met `docker stop crew-realtime crew-storage crew-rest crew-auth crew-db`; stop ook de proxy en Next.js-processen. Verwijder deze containers en `.local-stack` uitsluitend wanneer je de wegwerpdata bewust wilt wissen. Een PostgreSQL- of JWT-rol uit deze fallback hoort nooit in productie.

Voor de aanwezige systeembrowser:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node scripts/with-local-env.mjs npm run test:e2e -- --project=chromium --project=mobile-chromium
```

Deze run gebruikt Chromium, ook bij mobiel formaat. Het `iphone`-project gebruikt echte WebKit en vereist `npx playwright install --with-deps webkit` en toegang tot de Playwright-downloadservers. Het is geen test op een fysiek iPhone-toestel.

## 6. Netwerk en credentials

Applicatieverkeer vereist het eigen `<project-ref>.supabase.co`-domein (HTTPS én realtime WebSocket). Installatie gebruikt npm; de kleine teststack gebruikt Docker Hub, GitHub/raw GitHub voor de CLI/pluginbron. Browserinstallatie vereist `cdn.playwright.dev` en de door de officiële installer gerapporteerde downloadbestemmingen. De standaard Supabase CLI gebruikt eventueel `public.ecr.aws`; Docker Hub is een ondersteund registry-alternatief. Behoud bestaande allowlistregels als je bestemmingen toevoegt.

Sla externe geheimen uitsluitend op in de instellingen van de betreffende dienst. Zet nooit databasewachtwoorden of service-role keys in `NEXT_PUBLIC_*`, Git, screenshots of chat. Voor verdere deployment zijn toegang tot jouw Supabase- en Vercel-projecten nodig; de lokale testinstellingen zijn daar niet bruikbaar voor.

## 7. Controle vóór gebruik door de crew

- Migraties toegepast op het bedoelde project, private bucket en RLS gecontroleerd.
- Hosted registratie, bevestigingsmail, login en wachtwoordherstel via het echte domein getest.
- Twee echte accounts: automatisch aansluiten, privé opslaan, delen, intrekken, realtime en opnieuw inloggen getest.
- Ander crewaccount: registraties, bestanden, reviews en scores onbereikbaar.
- Foto én een afspeelbare iPhone-video uploaden, bekijken, beoordelen en wissen.
- Twee andere stemmers: precies eenmaal punten; eigen stem en browser-scorewijziging geweigerd.
- PWA installeren op fysiek iPhone, heropenen, rotatie, toetsenbord, slecht mobiel netwerk en herstel testen.
- Export en definitieve accountverwijdering testen; beheer eerst overdragen indien nodig.
- Back-ups, bewaartermijn en periodieke opruiming van niet-ingezonden of door crewverlaten verweesde media inrichten. Media van een gebruiker blijven via `my_media_paths` vindbaar voor eigen verwijdering, ook na crewverlaten.
- Maak met de crew afspraken over toestemming en bewaartermijnen. Medialinks verlopen na 60 seconden; reeds bekeken/kopieerbare informatie kan niet worden teruggehaald.

## Bestaande installatie omzetten naar één gezamenlijk platform

Open in het bestaande Supabase-project **SQL Editor → New query**. Kopieer het volledige bestand `docs/enable-shared-platform.sql` via GitHub **Copy raw file**, plak het, zorg dat er geen gedeeltelijke selectie actief is en klik **Run**. Verwacht: **Automatisch aansluiten ingesteld**. Dit is alleen de nieuwe derde migratie; voer de volledige oorspronkelijke installatie niet opnieuw uit. Nieuwe installaties gebruiken het bijgewerkte volledige `docs/supabase-setup.sql` of alle CLI-migraties in volgorde.

De update voegt alle bestaande bevestigde accounts toe aan één omgeving, schrijft toekomstige accounts in zodra hun e-mail bevestigd is en herstelt ontbrekende inschrijving bij inloggen. Deeltoestemming staat standaard uit en wordt bij herhaald inloggen niet overschreven. Oude privécrewgegevens blijven op hun oorspronkelijke plek en worden niet automatisch in het gezamenlijke platform getoond. Vercel hoeft geen extra variabele of groeps-ID te krijgen. De GitHub-gekoppelde deployment bouwt de gewijzigde interface; open daarna de gebruikelijke website en log opnieuw in.

Nieuwe accounts krijgen uitsluitend de rol member. Om jezelf eenmalig beheerder te maken, voer als projecteigenaar in Supabase SQL Editor de volgende query uit met je eigen, al bevestigde accountadres. Dit is optioneel voor gewone deelname; beheer is nodig om challenges of de reviewdrempel aan te passen. Zet deze query met je eigen adres niet in Git.

```sql
update public.members m set role='admin'
from auth.users u, public.community_settings s
where m.user_id=u.id and m.crew_id=s.crew_id
  and lower(u.email)=lower('VUL_HIER_JE_EIGEN_ACCOUNTADRES_IN');
```

Voor een lokaal bewijs van de bevestigingsgrens kan de database-eigenaar `supabase/tests/shared-platform.sql` tegen een wegwerpdatabase uitvoeren. De test gebruikt een onbevestigde fixture, toetst onder authenticated-rechten, bevestigt de fixture en controleert gewone memberrechten en uitgeschakelde toestemming. Alle fixturewijzigingen worden teruggedraaid.

## Bestaande installatie bijwerken naar V2

Deze stap veronderstelt dat migraties 001, 002 en 003 al zijn uitgevoerd. Open [docs/enable-mobile-v2.sql](docs/enable-mobile-v2.sql) op GitHub en klik **Copy raw file**. Ga naar het bestaande project op **supabase.com/dashboard → SQL Editor → New query**, plak het volledige bestand, maak eventuele tekstselectie ongedaan en klik **Run**. Verwacht **Crew Control V2 ingesteld**. Voer dit eenmaal uit; het bestand bevat uitsluitend migratie 004 met een transactie. Gebruik hiervoor niet de volledige installatie en herhaal migratie 003 niet.

Dit voegt de private profielfotobucket, profiel-/onboardingvelden, gecontroleerde profielfuncties en RLS-respecterende historische filters/samenvattingen toe. Bestaande bevestigde accounts worden gemarkeerd als voltooid en houden toegang tot de gezamenlijke omgeving. Bestaande registraties, challenges en toestemmingen blijven behouden. Nieuwe accounts komen na hun naam en optionele foto automatisch op Home in de gezamenlijke groep. Foto’s kunnen later via **Mijn profiel → Instellingen & privacy** worden aangepast.

De GitHub-gekoppelde Vercel-build gebruikt dezelfde twee publieke omgevingsvariabelen. Controleer in **Vercel → ade → Deployments** dat de nieuwe main-build **Ready** is. Controleer daarna de gewone productie-URL met twee accounts: Home, naam/foto, snelle registratie, Tijdlijn-filters, delen/intrekken, Crew en de challenge-subnavigatie. De cloudomgeving heeft geen hosted beheerrechten; het uitvoeren van deze SQL en het resultaat van de publieke deployment zijn niet vanuit hier bevestigd.

## V3: sociale feed en feest afronden

Voor een bestaande installatie met migraties 001–004: open [docs/enable-social-v3.sql](docs/enable-social-v3.sql) op GitHub, klik **Copy raw file** en ga naar het bestaande project op **supabase.com/dashboard → SQL Editor → New query**. Plak het volledige bestand, hef tekstselecties op en klik **Run**. Verwacht **Crew Control V3 ingesteld**. Dit voert migraties 005 en 006 in één transactie uit. Voer het eenmaal uit; herhaal eerdere installatiebestanden niet. Als migratie 004 nog ontbreekt, voer eerst uitsluitend de V2-update uit.

De update bewaart alle bestaande accounts, records, toestemmingen, inzendingen en punten. Nieuwe tabellen zijn `submission_comments`, `social_notifications` en `party_state`, alle met RLS. Bestaande reviews/awards/RPC’s blijven de autoriteit. Er komen geen service-role keys, nieuwe omgevingsvariabelen of extra realtime-publicaties bij: uitsluitend `activity` wordt als bestaande invalidatiestroom gebruikt. De private bucket `crew-evidence` blijft ongewijzigd.

Controleer **Vercel → ade → Deployments** op de laatste main-commit en **Ready**. Open de gewone productie-URL, test met drie accounts: upload → Feed op beide andere apparaten → twee stemmen → melding bij de auteur → één award → album. Test een reactie en verwijderen, terugknop en fullscreen, en **Feest afronden → herladen → Nieuw feest starten**. Historie en deelkeuzes moeten behouden blijven. Een ander crewaccount mag geen records, reacties, meldingen of nieuwe medialinks kunnen uitlezen.

De gedeelde omgeving kent nieuwe accounts standaard memberrechten toe. Beoordelen kan als gewoon lid. Voor challengebeheer en de drempel is expliciet toegewezen admin nodig; maak jezelf niet opnieuw beheerder via de client. Voor een privécrew is de maker beheerder. De standaard reviewdrempel blijft twee unieke andere leden; stel die via Crewbeheer op één in voor een crew met twee personen.

Kortlevende medialinks blijven tot maximaal 60 seconden bruikbaar na uitgifte. De app controleert lidmaatschap opnieuw bij openen, focus en periodiek. Een mislukte validatie verwijdert de media uit de interface; eerder bekeken informatie kan niet worden teruggehaald. Meldingen tonen maximaal de geladen pagina, met **Eerdere meldingen**; markeren geldt uitsluitend voor getoonde eigen meldingen.

## Cameraknop en registratieranglijst

De update na V3 gebruikt dezelfde migraties 001–006, buckets en omgevingsvariabelen. Geen nieuwe SQL uitvoeren voor de cameraknop of ranglijst. Wacht in Vercel op de nieuwste main-build met status Ready. Camera via `getUserMedia` vereist HTTPS (of localhost) en een expliciete browsertoestemming. Bij blokkade kan de gebruiker de systeemcamera of bibliotheek gebruiken. Corrigeer een reeds gespiegeld bestand vóór het delen met **Spiegelen corrigeren**; een ingebakken spiegeling kan niet automatisch betrouwbaar worden herkend.

Bij een challengefout staat nu in het formulier of **Upload mislukt** (Storage) of **Inzenden mislukt** (de serverfunctie), gevolgd door de concrete fout. Laat selectie en toestemming staan voor een retry; de app hergebruikt de vaste upload-ID. Een oude algemene melding uit een eerdere deployment is niet voldoende om de hosted oorzaak vast te stellen. Bekijk pas de echte fout in de nieuwste build; verstrek geen credentials om deze diagnose te doen. De applicatie wijzigt geen hosted bucket-/accountrechten om een fout te omzeilen.

## Livegang op eigen domein

De volledige dashboardhandleiding staat in [docs/DOMEIN-EN-LIVEGANG.md](docs/DOMEIN-EN-LIVEGANG.md). Die behandelt Vercel/DNS, Resend met een eigen verzendsubdomein, Supabase SMTP/Auth-redirects, proefronde, de eenmalige opschoning en de eindcontrole. Het opschoonbestand staat buiten migrations en wordt nooit automatisch uitgevoerd.

## ADE Selectie: officiële opstelling en kleedkamer

Voor bestaande databases met 001 t/m 006: voer het volledige [docs/enable-ade-selection.sql](docs/enable-ade-selection.sql) eenmalig uit in **Supabase → SQL Editor → New query → Run**. Verwacht **ADE Selectie ingesteld**. Geen extra omgevingsvariabelen of Storage-buckets nodig. Zie [docs/ADE-SELECTIE.md](docs/ADE-SELECTIE.md) voor het expliciet aanwijzen van jouw account als exclusieve opstellingsbeheerder, spelers koppelen en de Vercel-uitrol controleren. Lucas is bondscoach als presentatie; hij hoeft geen account te hebben. Namen of aanmeldgegevens geven nooit opstellingsbeheerrechten.

## Officiële ADE-challenges (migratie 008)

Ga naar **Supabase → SQL Editor → New query**, plak het volledige [docs/enable-ade-challenges.sql](docs/enable-ade-challenges.sql) en klik **Run** zonder tekstselectie. Je hoeft niets in het bestand te vervangen. Verwacht **13 ADE-challenges ingesteld** en de verdeling 7 × 10, 3 × 30, 3 × 100 punten. Alleen de gezamenlijke groep krijgt de nieuwe actieve lijst; oude challenges worden gearchiveerd. Bestaande inzendingen/reviews/awards houden hun oorspronkelijke punten en foto's. Nieuwe crews gebruiken de nieuwe dertien templates. Bestaande privécrews blijven ongewijzigd. De upgrade voegt ADE toe als festival en kan herhaald worden zonder dubbele challenges. De gebruikersinterface vertaalt de bestaande niveauwaarden; historische waarden blijven ondersteund.

Controleer na Vercels GitHub-deployment (**ade → Deployments → Ready**) de vaste productie-URL, herlaad en open **Challenges**. Filters heten **🟢 Makkelijk**, **🟠 Medium** en **🔴 Bijna onmogelijk**; elke challenge is eenmaal per account te voltooien. De nieuwe lijst verandert bestaande privacy- of beoordelingsregels niet.
