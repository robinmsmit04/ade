# Leeg starten met vrienden, accounts behouden

Dit is een bewuste opschoning van de gebruiksgegevens van **alle bestaande crews** in dit ADE Selectie-project. De accounts blijven bestaan, inclusief profielnaam, profielfoto en inloggegevens. Crewleden, beheerdersrollen, challenges en alle beveiligingsregels blijven behouden. Registraties, check-ins, challengefoto’s/video’s, reacties, stemmen, punten, meldingen, feeststatus en oude uitnodigingen verdwijnen. Delen wordt voor iedereen teruggezet naar privé.

De cloudagent heeft geen hosted Supabase-/Vercel-beheerverbinding. Onderstaande hosted handelingen zijn daarom nog niet uitgevoerd.

## 1. Challengebestanden verwijderen

Ga naar [Supabase Dashboard](https://supabase.com/dashboard), open het juiste project en ga naar **Storage → crew-evidence**. Selecteer alle mappen/bestanden en kies **Delete**. Verwijder ook de inhoud van eventuele resterende mappen totdat deze bucket leeg is. Laat de bucket zelf bestaan en houd hem **private**. Laat **profile-photos** en andere buckets staan: profielfoto’s blijven behouden.

Gebruik hiervoor Storage in het dashboard; verwijder geen rijen uit `storage.objects` met SQL. Zo worden ook de echte opgeslagen bestanden verwijderd. Open deze handeling niet wanneer je vrienden de app al actief gebruiken.

## 2. Gebruiksgegevens wissen

Open [reset-test-data.sql](https://github.com/robinmsmit04/ade/blob/main/docs/reset-test-data.sql) en klik **Copy raw file**. Ga in hetzelfde Supabase-project naar **SQL Editor → New query**, plak het volledige bestand, maak elke gedeeltelijke tekstselectie ongedaan en klik **Run**.

Verwacht: **ADE Selectie opgeschoond; accounts behouden**. `registraties`, `inzendingen`, `puntenregels` en `challengebestanden` moeten 0 zijn. De aantallen accounts, profielen en challenges blijven staan. Als challengebestanden nog bestaan, breekt de volledige transactie vóór het wissen af met een aanwijzing naar Storage. Een ontbrekende V3-update wordt ook vóór het wissen gemeld.

Log opnieuw in of herlaad de app. Home en Tijdlijn zijn leeg, de foto-feed/het album zijn leeg en de challengeranglijst heeft geen punten. Bestaande accounts hoeven hun profiel niet opnieuw te maken. Nieuwe accounts krijgen de normale naam-/foto-onboarding en komen automatisch in de gezamenlijke groep.

## 3. De publieke website delen

Ga naar [Vercel](https://vercel.com) → **ade → Settings → Deployment Protection**. Controleer dat de **Production**-omgeving publiek toegankelijk is. Previewbeveiliging kan aanblijven. Open **ade → Domains** en gebruik het aan Production gekoppelde HTTPS-domein als vaste deel-URL.

Open die URL in een privévenster. Zonder Vercel-account moet je de ADE Selectie-login/registratie zien. Deel precies dit vaste productiedomein met je vrienden.

## 4. Bevestigingsmails voor je vrienden

Ga naar **Supabase → Authentication → Sign In / Providers → Email**: e-mailregistratie moet aanstaan. Laat e-mailbevestiging aan als je wilt dat iedereen zijn adres bevestigt.

Controleer **Authentication → Emails → SMTP Settings → Enable custom SMTP**. De ingebouwde Supabase-maildienst is voor testen en kan ontvangers/rate beperken; vertrouw daar niet op voor een vriendengroep. Configureer bij ontbreken een eigen mailprovider voordat je meerdere vrienden uitnodigt. Zie [de Supabase SMTP-documentatie](https://supabase.com/docs/guides/auth/auth-smtp). De actuele hosted instelling is vanuit deze cloudomgeving niet zichtbaar. Een afzenderdomein/providerautorisatie kan een externe handeling vereisen.

Vul host, poort, gebruikersnaam, wachtwoord/API-key en geverifieerde afzender uitsluitend in het Supabase-dashboard in. Plaats deze nooit in Git, broncode of chat.

Onder **Authentication → URL Configuration** hoort **Site URL** hetzelfde vaste productiedomein te zijn. De toegestane redirects moeten minimaal `https://JOUW-DOMEIN/auth/callback` bevatten; behoud de bestaande eigen invitecallback als die wordt gebruikt.

Doe vóór breed delen één registratie met een adres van een vriend: bevestigingsmail ontvangen → link openen → inloggen → naam invullen → automatisch naar Home in de gezamenlijke groep. Nieuwe accounts blijven gewone leden en delen registraties standaard niet. Uitnodigen geeft niemand automatisch beheerrechten.

## Terugkoppeling

Geef alleen terug: de status uit de SQL-controle, het vaste publieke domein en of custom SMTP aanstaat. Deel geen wachtwoorden, keys of bevestigingslinks.

## Concrete SMTP-route met je eigen domein: Resend

Gebruik bijvoorbeeld `auth.jouwdomein.nl` als verzenddomein. Vervang `jouwdomein.nl` door je eigen domeinnaam; je bestaande app-URL hoeft niet te veranderen.

1. Ga naar [resend.com](https://resend.com), maak een account aan of log in.
2. Open **Domains → Add Domain**, vul `auth.jouwdomein.nl` in en kies een Europese regio als die beschikbaar is.
3. Open het DNS-beheer bij je domeinprovider. Voeg de records toe die Resend voor dit subdomein toont. Ga terug naar Resend en klik **Verify DNS Records**; wacht op **Verified**.
4. Open **API Keys → Create API Key**. Geef de sleutel een herkenbare naam, zoals `ADE Selectie Auth`, met verzendrechten voor het geverifieerde domein. Bewaar de sleutel veilig en vul hem uitsluitend als SMTP-wachtwoord in Supabase in.
5. Ga naar **Supabase → jouw project → Authentication → Emails → SMTP Settings**. Zet **Enable custom SMTP** aan en vul in:

| Instelling   | Waarde                                          |
| ------------ | ----------------------------------------------- |
| Sender email | `noreply@auth.jouwdomein.nl`                    |
| Sender name  | `ADE Selectie`                                  |
| Host         | `smtp.resend.com`                               |
| Port         | `465`                                           |
| Username     | `resend`                                        |
| Password     | De Resend API-key, uitsluitend in dit dashboard |

6. Klik **Save changes**. Controleer onder **Authentication → Rate Limits** dat het e-mailverzendlimiet past bij het quota van je mailprovider en de verwachte aanmeldingen. E-mailbevestiging blijft aan.
7. Vraag via de ADE Selectie-login een bevestigingsmail aan voor een nog onbevestigd account, of registreer een nieuwe vriend. Controleer **Resend → Emails** op de verzendstatus en laat de ontvanger de link openen. Een melding “verzonden” alleen is nog geen bewijs dat de mailbox de mail heeft ontvangen.

Officiële SMTP-instructie: [Resend SMTP](https://resend.com/docs/send-with-smtp). Als de dashboardlabels gewijzigd zijn, gebruik de daar getoonde verbindingsgegevens. De sleutel, DNS-accounttoegang en bevestigingslinks horen niet in deze chat.
