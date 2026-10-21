# Crew Control op je eigen domein, met eigen e-mail en een schone start

Deze handleiding gaat uit van je bestaande GitHub-repository, Vercel-project **ade** en Supabase-project. Je hoeft geen nieuwe applicatie of database aan te maken. De accounts blijven behouden. De hosted wijzigingen en opschoning zijn nog niet namens jou uitgevoerd: deze cloudomgeving heeft geen beheerverbinding met jouw accounts.

Gebruik in de voorbeelden deze namen en vervang `jouwdomein.nl` door je echte domein:

| Doel                                    | Voorbeeld                                   |
| --------------------------------------- | ------------------------------------------- |
| Publieke website en deel-URL            | `https://app.jouwdomein.nl`                 |
| Geverifieerd verzenddomein              | `auth.jouwdomein.nl`                        |
| Afzender van bevestigings-/herstelmails | `Crew Control <noreply@auth.jouwdomein.nl>` |

Je domeinprovider beheert DNS. Vercel serveert de app. Supabase bewaart accounts/data en verstuurt Auth-mails via de mailprovider. In deze handleiding is die provider Resend. In-app challengemeldingen blijven in de app.

## 1. Het app-domein toevoegen aan Vercel

1. Ga naar [vercel.com](https://vercel.com), open je team en project **ade**.
2. Open **Settings → Domains → Add Domain**.
3. Vul `app.jouwdomein.nl` in. Koppel het domein aan **Production** als Vercel naar de omgeving vraagt.
4. Vercel toont de benodigde DNS-records. Laat dat scherm open en neem de waarden exact over: het CNAME-doel kan projectspecifiek zijn.
5. Ga naar de website van je domeinprovider → jouw domein → **DNS / DNS records / DNS beheren**.
6. Voeg het record uit Vercel toe. Voor dit subdomein is dat meestal een **CNAME** met naam/host **app** en het exact getoonde doel. Kies de standaard/automatische TTL. Gebruik bij de host de notatie die je provider vraagt; veel providers vullen `.jouwdomein.nl` zelf aan.
7. Ga terug naar Vercel en klik **Refresh / Verify** totdat **Valid Configuration** verschijnt. DNS-verwerking kan enige tijd kosten. Vercel regelt daarna het HTTPS-certificaat.
8. Open `https://app.jouwdomein.nl`. Je moet Crew Control zien met een geldig certificaat.

Heb je al een DNS-record voor `app`, pas dat bestaande record aan naar de waarde van Vercel. Voeg niet twee verschillende CNAME-doelen voor dezelfde host toe. Als je Cloudflare gebruikt, kun je het nieuwe record tijdens deze configuratie op **DNS only** zetten.

De Supabase-project-URL en publieke sleutel in Vercel blijven dezelfde. Ze verwijzen naar de database, niet naar je nieuwe websiteadres. Alleen een domein toevoegen vereist geen nieuwe Supabase-installatie.

## 2. De website publiek bereikbaar maken

1. Ga in Vercel naar **ade → Settings → Deployment Protection**.
2. Controleer **Vercel Authentication**. De vaste **Production**-website moet zonder Vercel-login toegankelijk zijn. Kies bijvoorbeeld **Standard Protection** als die Production-domeinen publiek laat en previews beschermt. Beveiliging voor alle deployments of een Production-wachtwoord mag de gedeelde website niet blokkeren.
3. Open **Deployments** en controleer of de nieuwste main-deployment **Ready** is en **Production** gebruikt.
4. Open je nieuwe vaste domein in een privé-/incognitovenster. Je moet meteen Crew Control-login/registratie zien.

Deel straks `https://app.jouwdomein.nl`. Je hoeft de unieke deployment-URL niet als vaste deel-URL te gebruiken.

## 3. Het maildomein bij Resend verifiëren

Je hebt aangegeven dat custom SMTP nog uitstaat en je een eigen domein hebt. Dit moet worden ingericht voor de bevestigingsmails aan je vrienden.

1. Ga naar [resend.com](https://resend.com), registreer of log in.
2. Open **Domains → Add Domain**.
3. Vul `auth.jouwdomein.nl` in. Kies een Europese regio als die beschikbaar is.
4. Resend toont DNS-records voor het verzenden. Voeg elk vereist record toe bij dezelfde domeinprovider. Kopieer **Type**, **Name/Host**, **Value/Content** en eventuele **Priority** exact. De waarden verschillen per domein.
5. Ga terug naar Resend en klik **Verify DNS Records**. Wacht totdat het domein **Verified** is.
6. Open **API Keys → Create API Key**. Noem deze bijvoorbeeld **Crew Control Auth** en geef verzendrechten voor dit geverifieerde domein.
7. Bewaar de sleutel veilig. Deze komt uitsluitend in het SMTP-wachtwoordveld van Supabase.

De DNS-records uit Resend staan naast het CNAME-record voor `app`. Ze dienen verschillende doelen. Laat de bestaande mailinstellingen voor je hoofddomein intact; voeg de door Resend gevraagde records voor het nieuwe verzendsubdomein toe.

## 4. Supabase met Resend laten mailen

1. Ga naar [supabase.com/dashboard](https://supabase.com/dashboard), open het bestaande Crew Control-project.
2. Open **Authentication → Emails → SMTP Settings** en zet **Enable custom SMTP** aan.
3. Vul het volgende in:

| Veld         | Waarde                       |
| ------------ | ---------------------------- |
| Sender email | `noreply@auth.jouwdomein.nl` |
| Sender name  | `Crew Control`               |
| Host         | `smtp.resend.com`            |
| Port         | `465`                        |
| Username     | `resend`                     |
| Password     | Je Resend API-key            |

4. Klik **Save changes**.
5. Open **Authentication → Rate Limits** en controleer **Email send rate limit**. Begin voor een kleine vriendengroep met **30 e-mails per uur**, voor zover je Resend-plan dit toestaat. Houd ook het dagelijkse quota van je provider aan.
6. Onder **Authentication → Sign In / Providers → Email** moet registratie met e-mail toegestaan zijn en **Confirm email** aan blijven staan.

De standaard Supabase-maildienst is een testvoorziening met ontvanger-/verzendbeperkingen. Je eigen SMTP-verbinding is daarom een afzonderlijke voorwaarde voor deze livegang. Een succesvolle SMTP-aanvraag bewijst nog niet dat de ontvangende mailbox de mail aflevert; dat toets je in stap 6.

Plaats je API-key, SMTP-wachtwoord of databasewachtwoord nooit in Git, broncode, `NEXT_PUBLIC_*`, screenshots of chat. Vercel heeft deze SMTP-key niet nodig.

## 5. Alle bevestigingslinks naar het nieuwe app-domein sturen

1. Open **Supabase → Authentication → URL Configuration**.
2. Zet **Site URL** op:

```text
https://app.jouwdomein.nl
```

3. Voeg onder **Redirect URLs** toe:

```text
https://app.jouwdomein.nl/auth/**
```

Dit patroon is beperkt tot de authpaden van je eigen website en ondersteunt de bestaande callback en uitnodigingscallback. Het normale callbackpad is `/auth/callback`. Behoud alleen de aanvullende eigen ontwikkel-/productiedomeinen die je nog gebruikt.

4. Klik **Save**.
5. Vraag na deze wijziging nieuwe bevestigings-/herstelmails aan vanuit het nieuwe domein. Eerder verstuurde mails kunnen het oude adres bevatten.

De bestaande app gebruikt het actuele websiteadres voor nieuwe Auth-callbacks. Je hoeft hiervoor geen code of publieke Supabase-variabelen te veranderen. Een bestaande gebruiker kan op het nieuwe domein opnieuw moeten inloggen; het account blijft hetzelfde.

## 6. Proefronde vóór de definitieve opschoning

Gebruik het nieuwe vaste domein in een privévenster en test met een of twee vrienden, inclusief een e-mailadres buiten je Supabase-team.

- De website opent zonder Vercel-login.
- Een nieuw account kan worden aangemaakt.
- De mail komt aan, ook na controle van spam, met jouw afzenderdomein.
- De bevestigingslink brengt de gebruiker naar je nieuwe app-domein; inloggen werkt.
- Naam invullen en **Verder met Crew Control** brengt iedereen in dezelfde gezamenlijke omgeving. Een privécrew maken is optioneel.
- Een registratie opslaan, tijdlijn bekijken en corrigeren werkt.
- Registraties zijn privé totdat de eigenaar zelf delen aanzet. Delen en intrekken werken in een tweede account.
- Camera/fotochallenge → Feed → beoordelen werkt. Voor de standaard twee goedkeuringen zijn de inzender plus twee andere accounts nodig. De punten komen precies eenmaal in de challengeranglijst.
- Feed, album en uitloggen/opnieuw inloggen werken op de telefoons van je vrienden.

Als een mail niet aankomt: open **Resend → Emails**, selecteer het bericht en bekijk de verzendstatus/fout. Bij een fout vóór verzending bekijk je **Supabase → Logs → Auth** bij de aanmeldpoging. Houd fouttekst en tijdstip apart van keys of bevestigingslinks. Bij een Vercel-loginscherm controleer je opnieuw stap 2 en de gebruikte vaste domein-URL.

## 7. Definitief leegmaken met behoud van accounts

Doe dit pas nadat de proefronde geslaagd is en vóór je de link breed deelt. De proefaccounts blijven bestaan, maar hun gebruiksgegevens verdwijnen.

**Blijft:** accounts, profielnamen, profielfoto’s, crews, leden, beheerdersrollen, challenges, templates, databasefuncties en beveiliging.

**Verdwijnt:** alle registraties, check-ins, challengefoto’s/-video’s, inzendingen, reacties, stemmen, punten, meldingen, feeststatus en oude uitnodigingslinks, in alle crews. Delen wordt teruggezet naar privé.

1. Ga naar **Supabase → Storage → crew-evidence**.
2. Selecteer alle bestanden en mappen en kies **Delete**. Verwijder de inhoud van resterende mappen totdat deze bucket leeg is. Laat de bucket zelf bestaan en private. Laat `profile-photos` staan.
3. Open [reset-test-data.sql](https://github.com/robinmsmit04/ade/blob/main/docs/reset-test-data.sql) op GitHub en klik **Copy raw file**.
4. Open **Supabase → SQL Editor → New query**, plak het hele bestand, hef eventuele tekstselectie op en klik **Run**.
5. Verwacht:

```text
Crew Control opgeschoond; accounts behouden
```

De velden `registraties`, `inzendingen`, `puntenregels` en `challengebestanden` moeten 0 zijn. Accounts, profielen en challenges blijven aanwezig. Het script breekt vóór het wissen af als er nog challengebestanden zijn of de vereiste V3-update ontbreekt.

Gebruik Storage om de echte bestanden te verwijderen. Het SQL-bestand verwijdert geen Storage-metadata en maakt geen orphan-bestanden. Deze reset hoort niet in de migratiemap en draait niet automatisch bij een deployment. Voer hem niet uit nadat je vrienden echte gegevens zijn gaan bijhouden.

De reset is getest op een aparte kopie van de lokale database. De controle bevestigde: Storage-guard, lege gebruikstabellen, behoud van accounts/profielen/rollen/challenges/avatars, delen uit, herhaalbaarheid en normale inschrijving van een nieuw bevestigd account. Dit is geen melding dat jouw hosted project al is gewist.

## 8. Laatste check en delen

Herlaad de nieuwe website of log opnieuw in. Controleer zonder nieuwe testinhoud toe te voegen:

- Home toont **Nog niets vastgelegd**.
- Tijdlijn, Feed en album hebben geen inzendingen/registraties.
- De challengeranglijst heeft geen punten en de registratieranglijst heeft geen momenten.
- De gewone challenges staan nog klaar.
- Je eigen account en profielfoto zijn behouden.
- Een privévenster toont de publieke Crew Control-login, geen Vercel-login.

Daarna kun je dit bericht delen, met jouw echte domein:

> Crew Control staat klaar: https://app.jouwdomein.nl
>
> Maak een account, bevestig je e-mail en kies ‘Verder met Crew Control’. Je kunt je naam en eventueel een foto toevoegen. Registraties zijn standaard privé; je kiest zelf of je ze deelt. Fotochallenges en de Feed zijn voor onze gezamenlijke groep.

Alleen een URL delen maakt deelnemers geen beheerder. In de gezamenlijke omgeving kan iedereen met een bevestigd account deelnemen; wie expliciet registraties deelt, deelt die met huidige en toekomstige deelnemers van die omgeving.

## Bronnen en status

- [Vercel: custom domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Supabase: custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend: SMTP](https://resend.com/docs/send-with-smtp)

Dashboardlabels kunnen wijzigen. Gebruik de DNS- en SMTP-waarden die je eigen dienst toont. Er zijn nog geen externe domein-, SMTP- of opschoonwijzigingen door de agent uitgevoerd. Productie is klaar om te delen nadat DNS/HTTPS, publieke toegang, mailontvangst, callback en de lege eindcontrole daadwerkelijk geslaagd zijn.
