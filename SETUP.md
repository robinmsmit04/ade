# Setup en deployment

## 1. Vereisten

- Node.js >=22 en npm; gebruik `npm ci` met het meegeleverde lockfile.
- Een nieuw Supabase-project en een Vercel-account waarop je mag deployen.
- GitHub-repository `robinmsmit04/ade`.
- Voor lokale integratietests: Docker en de Supabase CLI. Gebruik een wegwerpdatabase, nooit productie.

## 2. Hosted Supabase

1. Maak een project aan. Bewaar het databasewachtwoord buiten deze repository.
2. Koppel de CLI (`supabase login`, `supabase link --project-ref <jouw-ref>`) en voer `supabase db push` uit. Of voer de SQL-bestanden in `supabase/migrations` in volgorde uit in de SQL Editor, als projectbeheerder.
3. De migraties maken tabellen, constraints, RLS, helper/RPC-functies, een gebruikersprofieltrigger, realtimepublicatie, 20 challengetemplates en de private bucket `crew-evidence` aan. Voer ze niet tweemaal handmatig uit. De CLI houdt migratieversies bij.
4. Controleer dat alle applicatietabellen RLS gebruiken en `crew-evidence` **private** is. Laat `activity` in `supabase_realtime`; publiceer geen gevoelige registratietabellen.
5. Auth → URL Configuration: stel Site URL in op je productie-URL. Voeg `https://<jouw-domein>/auth/callback` en lokale ontwikkel-URL's toe als toegestane redirects. Voor uitnodigingen na e-mailbevestiging is ook `https://<jouw-domein>/auth/callback?next=/invite/**` nodig (of het ondersteunde globpatroon `https://<jouw-domein>/auth/**`). Sta uitsluitend eigen domeinen toe.
6. Laat e-mailbevestiging in productie aan. Configureer een eigen SMTP-provider, afzender, afleverbaarheid, rate limits in Supabase. De lokale tests gebruiken uitsluitend auto-confirmatie in een afgeschermde wegwerpomgeving.
7. Kopieer de publieke URL en publishable key (legacy `anon` mag ook) naar `.env.local`, overeenkomstig `.env.example`. Dit zijn publieke clientinstellingen, **geen service-role key**. Een service-role key is nergens nodig voor de applicatie.
8. Start `npm run dev`. Registreer twee accounts en bevestig de e-mail. Beide sluiten automatisch aan bij dezelfde omgeving; er is geen crew- of uitnodigingsstap. De gezamenlijke omgeving bevat de twintig challenges.

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

De integratiesuite maakt vier tijdelijke accounts, twee crews en testmedia aan en verwijdert eigen fixtures na afloop. Bij vroegtijdig afbreken kunnen fixtures achterblijven. Gebruik dus altijd een aparte testomgeving. Externe testprojecten vereisen daarnaast expliciet `ALLOW_REMOTE_TESTS=yes` en uitgeschakelde e-mailbevestiging voor die wegwerpprojecten.

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

Open in het bestaande Supabase-project **SQL Editor → New query**. Kopieer het volledige bestand `docs/enable-shared-platform.sql` via GitHub **Copy raw file**, plak het, zorg dat er geen gedeeltelijke selectie actief is en klik **Run**. Verwacht: **Automatisch aansluiten ingesteld**. Dit is alleen de nieuwe derde migratie; voer de volledige oorspronkelijke installatie niet opnieuw uit. Nieuwe installaties gebruiken het bijgewerkte volledige `docs/supabase-setup.sql` of de drie CLI-migraties in volgorde.

De update voegt alle bestaande bevestigde accounts toe aan één omgeving, schrijft toekomstige accounts in zodra hun e-mail bevestigd is en herstelt ontbrekende inschrijving bij inloggen. Deeltoestemming staat standaard uit en wordt bij herhaald inloggen niet overschreven. Oude privécrewgegevens blijven op hun oorspronkelijke plek en worden niet automatisch in het gezamenlijke platform getoond. Vercel hoeft geen extra variabele of groeps-ID te krijgen. De GitHub-gekoppelde deployment bouwt de gewijzigde interface; open daarna de gebruikelijke website en log opnieuw in.

Nieuwe accounts krijgen uitsluitend de rol member. Om jezelf eenmalig beheerder te maken, voer als projecteigenaar in Supabase SQL Editor de volgende query uit met je eigen, al bevestigde accountadres. Dit is optioneel voor gewone deelname; beheer is nodig om challenges of de reviewdrempel aan te passen. Zet deze query met je eigen adres niet in Git.

```sql
update public.members m set role='admin'
from auth.users u, public.community_settings s
where m.user_id=u.id and m.crew_id=s.crew_id
  and lower(u.email)=lower('VUL_HIER_JE_EIGEN_ACCOUNTADRES_IN');
```

Voor een lokaal bewijs van de bevestigingsgrens kan de database-eigenaar `supabase/tests/shared-platform.sql` tegen een wegwerpdatabase uitvoeren. De test gebruikt een onbevestigde fixture, toetst onder authenticated-rechten, bevestigt de fixture en controleert gewone memberrechten en uitgeschakelde toestemming. Alle fixturewijzigingen worden teruggedraaid.
