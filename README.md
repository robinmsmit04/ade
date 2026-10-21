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

Lees [SETUP.md](SETUP.md) voor database, e-mailbevestiging, lokale integratietests en Vercel. Elke cloudtaak is al geïsoleerd: gebruik de bestaande checkout en maak geen extra Git-worktree.

## Gebruik

1. Registreer een account en bevestig de e-mail (bij hosted Supabase).
2. Log in: je sluit automatisch aan bij Crew Control. Geen crew aanmaken, kiezen of uitnodigingslink nodig. De gezamenlijke omgeving bevat 20 challenges, verdeeld over DGTL en KI/KI.
3. Registreer historische momenten via **Registreren**; corrigeer of verwijder ze in **Mijn tijdlijn**.
4. Zet **Instellingen → Deel mijn registraties** alleen aan als je je volledige historie binnen deze crew wilt delen. Nieuwe deelnemers starten altijd privé. Delen geeft alle huidige en toekomstige bevestigde accounts op het platform toegang. Check-ins hebben een afzonderlijke deelkeuze.
5. Upload challengebewijs met instemming van iedereen in beeld. Twee andere leden beoordelen; de beheerder kan voor kleine crews de drempel verlagen tot één.
6. Bekijk goedgekeurde inzendingen in de privégalerij en punten per festival, Amsterdamse kalenderdag of hele weekend.

Beheer omvat challenges toevoegen/bewerken/archiveren, punten en herhaalbaarheid instellen en beheer overdragen. Beheerrechten worden eenmalig expliciet in Supabase toegewezen; registratie geeft nooit automatisch beheerrechten. Alleen serverfuncties kennen punten toe. Challenges zijn vrijwillig en vragen geen gevaarlijk gedrag of overlast.

## Privacy en grenzen

Registraties zijn standaard privé, ook voor beheerders. Toestemming geldt voor het volledige verleden en toekomstige registraties binnen het gezamenlijke platform, zichtbaar voor alle bevestigde deelnemers. Bestaande gegevens uit vroegere privécrews worden niet verplaatst of gedeeld. Intrekken blokkeert nieuwe databaselezingen onmiddellijk. De interface vernieuwt via realtime met een terugval naar 15 seconden polling. Eerder bekeken informatie of screenshots zijn niet terug te halen. Ondertekende medialinks zijn maximaal 60 seconden bruikbaar; de app vernieuwt ze alleen na een nieuwe toegangscontrole.

De app geeft geen doseer-, herdoseer- of veiligheidsadvies en beloont nooit middelengebruik. Tijden geven uitsluitend aan wanneer iets is geregistreerd. Check-ins zijn geen bewaakte hulpdienst. Zoek de EHBO of bel 112 bij acuut gevaar.

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
