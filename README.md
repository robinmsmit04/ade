# Crew Control

Mobiele app voor één gezamenlijke Crew Control-omgeving tijdens Amsterdam Dance Event. Iedereen kan via dezelfde URL een account aanmaken en na e-mailbevestiging automatisch deelnemen. Donkere festivalstijl, lime accenten en een navigatie voor bediening met één hand. Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui Button, Supabase Auth/PostgreSQL/Realtime/Storage, Zod, React Hook Form, Vitest en Playwright.

## Starten

Node.js 22 of hoger (in deze omgeving: Node 24), npm en een Supabase-project met de migraties uit `supabase/migrations`.

```bash
npm ci
cp .env.example .env.local
# Vul de URL en publieke publishable/anon-key van jouw Supabase-project in.
npm run dev
```

Zonder Supabase-configuratie verschijnt een herkenbare lege shell met een configuratiemelding. Die slaat geen fictieve accounts of registraties op. Met Supabase zijn accounts en databaseopslag verplicht; er is geen localStorage-databasemodus.

Voor een bestaande V2-installatie (migraties 001 t/m 004): voer eenmaal [docs/enable-social-v3.sql](docs/enable-social-v3.sql) uit in Supabase SQL Editor. Ontbreekt V2 nog, voer eerst [docs/enable-mobile-v2.sql](docs/enable-mobile-v2.sql) uit; herhaal de oorspronkelijke installatie niet.

Lees [SETUP.md](SETUP.md) voor database, e-mailbevestiging, lokale integratietests en Vercel. Elke cloudtaak is al geïsoleerd: gebruik de bestaande checkout en maak geen extra Git-worktree.

## Gebruik

1. Registreer een account en bevestig de e-mail (bij hosted Supabase).
2. Nieuwe accounts vullen een naam in en kunnen optioneel een profielfoto uploaden of maken. Ga verder in de gezamenlijke Crew Control-omgeving, maak optioneel een eigen crew of gebruik een uitnodiging. Bestaande accounts slaan onboarding over. De gezamenlijke omgeving bevat 20 challenges, verdeeld over DGTL en KI/KI.
3. Home toont je laatste historische registratie en de grote knop **Nieuwe registratie**. Kies een label en bevestig; hoeveelheid en opmerking zijn optioneel. **Tijdlijn** biedt dag- en middelfilters, corrigeren en verwijderen. **Crew** toont uitsluitend toegestane gedeelde gegevens, zonder punten voor middelenregistraties.
4. Rond je avond af via **Feest afronden** op Home. De teller verdwijnt en je historie blijft intact. **Nieuw feest starten** begint een leeg persoonlijk registratieblok; het sluit niets voor anderen af en zegt niets over effecten of veiligheid.
5. Zet **Mijn profiel → Instellingen & privacy → Deel mijn registraties** alleen aan als je je volledige historie binnen deze crew wilt delen. Nieuwe deelnemers starten altijd privé. In de gezamenlijke omgeving geeft delen alle huidige en toekomstige bevestigde accounts toegang; in een eigen crew geldt toestemming uitsluitend voor die crew. Check-ins hebben een afzonderlijke deelkeuze.
6. Upload challengebewijs met instemming van iedereen in beeld. Twee andere leden beoordelen; de beheerder kan voor kleine crews de drempel verlagen tot één.
7. **Challenges** bevat opdrachten, beoordelingen, leaderboard en de private Wall of Shame. De vijf hoofdtabbladen zijn Home, Feed, Tijdlijn, Crew en Challenges. Feed bevat alle challenge-inzendingen, stemmen en reacties; Fotoalbum opent de gefilterde Wall of Shame met fullscreen media. Het belletje toont je eigen meldingen en ongelezen aantal.

Beheer omvat challenges toevoegen/bewerken/archiveren, punten en herhaalbaarheid instellen en beheer overdragen. Beheerrechten worden eenmalig expliciet in Supabase toegewezen; registratie geeft nooit automatisch beheerrechten. Alleen serverfuncties kennen punten toe. Challenges zijn vrijwillig en vragen geen gevaarlijk gedrag of overlast.

## Privacy en grenzen

Registraties zijn standaard privé, ook voor beheerders. Toestemming geldt voor het volledige verleden en toekomstige registraties binnen de gekozen crew; in de gezamenlijke omgeving omvat dat alle bevestigde deelnemers. Profielfoto’s staan in private storage en zijn zichtbaar voor jezelf en crewleden. Bestaande gegevens uit vroegere privécrews worden niet verplaatst of gedeeld. Intrekken blokkeert nieuwe databaselezingen onmiddellijk. De interface vernieuwt via realtime met een terugval naar 15 seconden polling. Eerder bekeken informatie of screenshots zijn niet terug te halen. Ondertekende medialinks zijn maximaal 60 seconden bruikbaar; de app vernieuwt ze alleen na een nieuwe toegangscontrole.

De app geeft geen doseer-, herdoseer- of veiligheidsadvies en beloont nooit middelengebruik. Tijden geven uitsluitend aan wanneer iets is geregistreerd. Check-ins zijn geen bewaakte hulpdienst. Zoek de EHBO of bel 112 bij acuut gevaar.

Reacties zijn uitsluitend voor de huidige crew: maximaal 500 tekens, minimaal vijf seconden tussen berichten en maximaal zes per minuut. Je kunt eigen reacties verwijderen. Notificaties gaan uitsluitend over challenges, stemmen en reacties; middelenregistraties en check-ins leveren nooit sociale meldingen op.

Gevoelige formulieren blijven bij netwerkfouten open, uitsluitend in geheugen. Sluiten of herladen kan invoer wissen; er is een waarschuwing bij een open formulier. Authenticated HTML, registraties en media worden niet door de service worker opgeslagen. Offline is uitsluitend een hulppagina beschikbaar.

## Ontwikkeling

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:integration  # vereist geïsoleerde Supabase-testconfiguratie
npm run test:e2e         # vereist geïnstalleerde Playwright-browsers
```

[ARCHITECTURE.md](ARCHITECTURE.md) beschrijft de beveiliging en [TESTING.md](TESTING.md) de werkelijk uitgevoerde controles. [PROGRESS.md](PROGRESS.md) houdt voortgang en externe vervolgstappen bij. Productiepublicatie vereist een eigen Supabase-project en Vercel-account; de lokale teststack is geen productieomgeving.
