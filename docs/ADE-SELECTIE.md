# ADE Selectie installeren en gebruiken

De bestaande app is ADE Selectie geworden. Iedereen blijft na e-mailbevestiging en profielopslag automatisch in dezelfde groep komen. Er zijn precies zeven veldposities: Linksvoor, Spits, Rechtsvoor; CV Links, CV Centraal, CV Rechts; Keeper. Er is geen middenveld. Lucas staat als bondscoach vermeld en heeft geen account nodig. De opstelling is opgebouwd uit interactieve React-componenten, niet uit één achtergrondafbeelding.

## Eenmalig de bestaande Supabase-database bijwerken

1. Open [Supabase](https://supabase.com/dashboard), kies je bestaande project en ga naar **SQL Editor → New query**.
2. Open [enable-ade-selection.sql](https://github.com/robinmsmit04/ade/blob/main/docs/enable-ade-selection.sql) op GitHub en klik **Copy raw file**.
3. Plak het volledige bestand in de SQL Editor, maak eventuele tekstselectie ongedaan en klik **Run**. Verwacht: **ADE Selectie ingesteld**.
4. De upgrade vereist de bestaande V3-updates (001 t/m 006). Hij wist geen accounts, registraties, challenges, media of toestemmingen. Voer de volledige installatie `supabase-setup.sql` niet uit over je bestaande database.
5. Open in [Vercel](https://vercel.com/dashboard) het bestaande project **ade → Deployments**. Wacht totdat de deployment van deze commit **Ready** is. Open de vaste productiedomeinnaam en herlaad de pagina. De Supabase-omgevingsvariabelen blijven hetzelfde.

De applicatie kan de database-upgrade niet vanuit de browser uitvoeren. Zonder de upgrade blijft de bestaande registratiefunctionaliteit werken; het veld meldt dat de selectie nog niet geladen kan worden.

## Alleen jouw account mag de selectie beheren

Wanneer de groep precies één bestaande beheerder heeft, krijgt die tijdens de upgrade automatisch het exclusieve opstellingsbeheer. Niemand krijgt rechten door de naam Lucas te kiezen. Er worden geen accounts op basis van een naam of e-mailadres geraden.

- Zie jij **Opstelling beheren** op Home, dan is jouw account aangewezen.
- Zie je als bestaande beheerder **Opstellingsbeheer activeren**, dan kun je daarmee jouw account aanwijzen wanneer nog niemand is aangewezen. Daarna kan alleen die aangewezen account posities/rugnummers/bijnamen en verslagen wijzigen; andere gewone leden en andere beheerders kunnen dit niet via de selectie-API.
- Zie je geen van beide knoppen of is het verkeerde account aangewezen? Als projecteigenaar kun je de juiste identiteit expliciet vastleggen via het dashboard. Ga naar **Authentication → Users**, zoek je eigen e-mailadres en kopieer de **User UID**. Gebruik geen UID van Lucas of van een vriend. Ga naar **SQL Editor → New query** en voer onderstaande SQL uit nadat je uitsluitend `JOUW-EIGEN-USER-UID` hebt vervangen. Dit is je account-ID, geen credential. Deze handeling geeft geen extra inzage in privéregistraties en verandert geen algemene beheerrollen.

```sql
DO $$
DECLARE
 mijn_account uuid := 'JOUW-EIGEN-USER-UID';
 groep uuid;
BEGIN
 SELECT crew_id INTO groep FROM public.community_settings WHERE singleton;
 IF NOT EXISTS (
  SELECT 1 FROM public.members WHERE crew_id=groep AND user_id=mijn_account
 ) THEN
  RAISE EXCEPTION 'Log eerst met jouw bevestigde account in op de app.';
 END IF;
 UPDATE public.team_settings
 SET manager_id=mijn_account,version=version+1
 WHERE crew_id=groep;
END $$;
```

Herlaad Home. Alleen jij ziet nu **Opstelling beheren** en de publiceerknoppen in de kleedkamer. Supabase-projecteigenaren houden uiteraard toegang tot hun eigen database en bestaande algemene beheerders houden hun oorspronkelijke account-/ledenbeheerrechten; wijs die alleen aan vertrouwde personen toe. Opstellingsbeheer op zichzelf geeft geen algemene adminrechten.

## Spelers koppelen en de visual vullen

1. Laat je vrienden via je vaste publieke URL een account maken, hun e-mail bevestigen en naam/foto opslaan. Profielfoto later wijzigen kan via **Mijn profiel → Instellingen & privacy**.
2. Kies op Home **Opstelling beheren**.
3. Kies voor elk van de zeven posities het bestaande account. Je kunt een positie voorlopig leeg laten. Alleen leden van deze groep zijn te selecteren.
4. Vul desgewenst een spelersnaam en bijnaam in; kies zeven verschillende rugnummers van 1 tot en met 99. De standaardnummers zijn 7/9/11 voorin, 3/4/5 achterin en 1 op doel.
5. **Opstelling opslaan** maakt het veld direct zichtbaar voor iedereen. Elke gekoppelde speler krijgt automatisch zijn eigen profielfoto; zonder foto verschijnen initialen. Er worden geen personen of foto's verzonnen.
6. Een al opgestelde speler bij een andere positie kiezen wisselt beide accounts om. Namen en bijnamen gaan met het account mee; rugnummers horen bij het positieslot en kun je apart aanpassen.
7. Twee open beheerschermen kunnen elkaar niet ongemerkt overschrijven: bij een versieconflict blijft je invoer staan en vraagt de app het beheerscherm opnieuw te openen.

De portretten zijn op mobiele schermen minimaal 64 px breed. Op Home blijven de snelle registratie en camera tijdens scrollen bovenaan bereikbaar. Tappen op een bezette positie opent het spelersprofiel: totaal verdiende challengepunten, ingezonden foto's en uitsluitend de via de bestaande privacyregels zichtbare geschiedenis. Je eigen gegevens blijven voor jezelf zichtbaar. Geen gedeelde gegevens betekent dat ook geen verborgen aantallen worden getoond. Afmelden of verlies van toegang verwijdert de zichtbare gevoelige gegevens bij hercontrole; medialinks blijven kort geldig volgens de bestaande regels.

## Officieel wedstrijdverslag

Open **Home → Kleedkamer → Wedstrijdverslag schrijven**. Jij publiceert namens bondscoach Lucas. Geef een titel en tekst op en kies **Verslag publiceren**. Alle huidige en toekomstige groepsleden zien dit; bezoekers zonder login niet. Je kunt verslagen bewerken of na bevestiging verwijderen. De tekst wordt als gewone tekst getoond, nooit als uitvoerbare HTML. Privéregistraties worden niet automatisch in een verslag verwerkt.

## Controle vóór delen

- Open de vaste productiedomeinnaam in een privévenster: geen Vercel-login, wel ADE Selectie-login.
- Log in met jouw account: alleen jij hebt opstellingsbeheer. Controleer hetzelfde met een vriendenaccount: geen beheer-/publiceerknoppen.
- Koppel de zeven echte accounts, controleer naam/bijnaam/rugnummer/foto en wissel twee spelers.
- Open een spelersprofiel met een tweede account: privéregistraties ontbreken. Zet delen vrijwillig aan en daarna weer uit; de geschiedenis moet verschijnen en verdwijnen.
- Plaats een verslag en controleer het in de kleedkamer van een tweede account.
- Test op je fysieke iPhone: portretten, lange namen, speler aantikken, registratie en foto maken. Lokale Chromium-tests emuleren telefoonformaten, geen fysieke iPhone-camera of Safari.
- De oorspronkelijke opstellingsafbeelding was in het verzoek niet beschikbaar. De layout volgt daarom de exact opgegeven zeven posities; namen/foto's worden uit gekoppelde echte accounts opgebouwd. Voor een nauwkeurige visuele vergelijking moet de referentie nog worden aangeleverd.

De GitHub-gekoppelde Vercel-build wordt door de push gestart. Zonder toegang tot jouw Vercel-/Supabase-account kan de hosted SQL niet zelfstandig worden uitgevoerd en de externe deployment niet als live bevestigd worden. Stuur na de dashboardstap alleen de succesmelding of concrete fout en je vaste publieke URL terug, nooit credentials.
