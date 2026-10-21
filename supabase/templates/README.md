# Bevestigingsmail

`confirmation.html` is de Nederlandse Crew Control-template voor Supabase **Confirm signup**. De layout gebruikt inline CSS en presentatietabellen, zonder externe afbeeldingen, lettertypen of scripts.

## Instellen in het dashboard

1. Open het bedoelde Supabase-project → **Authentication → Email → Templates → Confirm signup**. Afhankelijk van de dashboardversie staat dit onder **Authentication → Email Templates**.
2. Stel het onderwerp in op **Bevestig je account · Crew Control**.
3. Plak de volledige inhoud van `confirmation.html` in **Body** / **Source**, met de exacte Supabase-variabele `{{ .ConfirmationURL }}` intact.
4. Sla op en test met een nieuwe registratie. Gebruik een nieuw verzonden bevestigingslink; oude mails worden niet bijgewerkt.

De URL wordt door Supabase gegenereerd en behoudt de bestaande bevestigings- en redirectflow. De template bevat geen credentials of trackingafbeeldingen. De accountgebonden wijziging in het hosted dashboard moet door de projecteigenaar worden opgeslagen; een Git-push past deze instelling niet automatisch toe.

De zichtbare afzendernaam, het afzenderadres en eventuele door de maildienst toegevoegde branding worden niet door deze HTML ingesteld. Configureer een eigen SMTP-provider om de afzender op Crew Control te zetten.

Browsercontrole op 320 en 600 pixels uitgevoerd met een dummy-URL, zonder echte bevestigingsmail te versturen. Rendering/bezorging in Gmail, Outlook en Apple Mail moeten na het instellen met een echte testmail worden gecontroleerd; een browserpreview bewijst dat niet.
