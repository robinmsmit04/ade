# Architectuur

## Gezamenlijk platform (actuele gebruikersflow)

Iedereen gebruikt dezelfde URL, registreert en bevestigt zijn e-mail. De derde migratie maakt een singleton `community_settings`-configuratie die naar één gedeelde, intern als crew opgeslagen omgeving verwijst. Een Auth-trigger schrijft uitsluitend bevestigde accounts in. `ensure_community_membership` controleert de bevestiging opnieuw en is idempotent voor bestaande sessies. V2 gebruikt deze omgeving als standaard. Nieuwe gebruikers vullen hun profiel in en kunnen de gezamenlijke omgeving gebruiken, optioneel een privécrew aanmaken of een uitnodiging volgen. De server bewaart de gekozen actieve crew en onboardingstatus. Bestaande bevestigde accounts zijn bij migratie 004 voltooid, zodat ze direct op Home landen.

Alle nieuwe leden krijgen memberrechten, nooit automatisch admin. De projecteigenaar kan een bestaand bevestigd account via SQL expliciet beheer geven. Per account staat delen standaard uit; inschrijving en opnieuw inloggen wijzigen bestaande toestemming niet. De toestemmingstekst vermeldt dat delen zichtbaar maakt voor alle huidige en toekomstige bevestigde deelnemers. RLS, media- en stemrechten blijven dezelfde lidmaatschaps- en toestemmingsgrenzen afdwingen. Bestaande privécrews en hun gegevens worden niet samengevoegd. De bestaande serverfuncties voor privécrews en uitnodigingen worden ook door de optionele V2-instap gebruikt.

De gedeelde omgeving overleeft accountverwijdering, ook als de laatste beheerder vertrekt. Historische technische beschrijvingen hieronder blijven relevant voor de onderliggende relationele structuur.

## Applicatie

Next.js App Router serveert de Nederlandstalige mobiele shell, `/invite/[token]` en een PKCE-authcallback. React beheert sessie, actieve crew, navigatie en formulieren. Zod valideert record- en challengegrenzen; React Hook Form voert authvalidatie uit. Tailwind 4 verzorgt layout; `components/ui/button.tsx` volgt het shadcn/ui/Radix Slot/CVA-patroon. De complete bron en configuratie staan in de repository.

De browser gebruikt uitsluitend de Supabase publishable/anon-key en de ingelogde sessie. PostgreSQL is de autoriteit voor rechten en puntentoekenning. UI-controles zijn voor gebruiksgemak en geen beveiligingsgrens. Er is geen service-role client of verborgen client-side scoreadministratie.

## Datamodel

- `profiles`: profiel gekoppeld aan `auth.users`, aangemaakt door een trigger.
- `crews`, `members`: privécrew, configureerbare reviewdrempel en admin/member-rollen.
- `invites`: SHA256 van cryptografisch willekeurige tokens, verloopdatum, gebruikslimiet. Join lockt de uitnodiging en is voor bestaande leden idempotent.
- `consents`: één expliciete, standaard uitgeschakelde deelkeuze per gebruiker en crew.
- `records`: persoonlijke historische registraties, exacte UTC-timestamps, optionele hoeveelheid/opmerking. Identiteit en crew zijn na insert niet wijzigbaar.
- `checkins`: status, vrijwillige hulpvraag en deelkeuze per check-in.
- `festivals`: DGTL en KI/KI; challenges koppelen aan deze festivalevenementen. Datums worden niet verzonnen of hardgecodeerd.
- `challenge_templates`: twintig veilige, aantoonbare opdrachten, alleen intern gekopieerd bij crewcreatie.
- `challenges`: eigen crewversies met festival, niveau, bewijsvereisten, punten, herhaalbaarheid en archivering.
- `submissions`: status en onveranderlijke momentopname van titel, festival en punten plus het private bewijsobject. Bewijsmetadata en storage-object zijn via een uniek bestandspad verbonden.
- `reviews`: unieke stem per inzending en beoordelaar.
- `awards`: maximaal één servermatig toegekende puntentoekenning per inzending.
- `activity`: alleen crew-ID, wijzigingstype en tijdstip voor realtime-invalidatie; geen gebruiker-ID of gevoelige inhoud.

Foreign keys koppelen records, check-ins, inzendingen en awards aan het juiste crewlid. Een composite FK voorkomt dat een inzending een challenge uit een andere crew gebruikt. Tabellen hebben RLS, gerichte indexes en beperkte kolomrechten.

## Autorisatie

`is_member`, `is_admin` en `shares` zijn kleine SECURITY DEFINER-helpers met een lege `search_path`. Ze voorkomen recursieve membership-RLS zonder meer rechten aan de browser te geven. Alle muterende RPC's controleren `auth.uid()` en de vereiste crewrol. Standaard EXECUTE-rechten voor public/anon zijn ingetrokken; uitsluitend bedoelde functies zijn aan authenticated toegekend.

Registraties zijn leesbaar door de eigenaar, of door huidige crewleden als de eigenaar expliciet delen heeft aangezet. Admin is geen uitzondering. Een admin kan consent niet namens een ander wijzigen. Check-ins gebruiken hun eigen `shared`-vlag. Profielen zijn uitsluitend voor jezelf en gedeelde crewleden zichtbaar. Account- en dataverwijdering werken onder de eigen identiteit; de laatste beheerder van een crew met andere leden moet eerst beheer overdragen.

Storage-objectpaden zijn `crew_id/user_id/random_uuid.ext`. INSERT vereist het eigen pad én crewlidmaatschap. Een los uploadobject is alleen door de eigenaar leesbaar. Na indienen kunnen huidige crewleden het bewijs lezen. UPDATE is niet toegestaan, zodat bewijs niet na beoordeling kan worden omgewisseld. Bestandstype en 25 MB-limiet gelden zowel client-side als op bucketniveau; MIME-controle is geen antiviruscontrole. URL's worden per bevoegde aanvraag ondertekend voor 60 seconden en periodiek hernieuwd. De API ondersteunt eigen verwijdering, ook na vertrek uit een crew.

## Beoordeling en punten

De client heeft geen INSERT/UPDATE-rechten op reviews, awards of submissions. `submit_evidence` valideert lidmaatschap, challenge, herhaalbaarheid, eigendom en bestaan van het storage-object. Een UUID maakt herhaalde inzendpogingen herkenbaar. Challengepunten worden bij indienen vastgelegd; latere bewerkingen veranderen bestaande inzendingen niet.

`review_submission` lockt de inzending, weigert zelfstemmen, controleert de actuele membership van stemmers en schrijft een unieke stem. Twee andere leden zijn standaard vereist. Eén afwijzing maakt de inzending definitief afgewezen; een nieuwe inzending mag daarna. Bij voldoende goedkeuringen schrijft dezelfde transactie een award. Zowel row locking als UNIQUE(submission_id) beschermen tegen dubbele punten. Definitieve stemmen zijn niet wijzigbaar. Eerder verdiende punten blijven geldig wanneer een beoordelaar later vertrekt; de inzending en punten van een vertrekkende auteur worden verwijderd via FK-cascades.

De leaderboard-RPC aggregeert de volledige awardtabel in de database. Dagfilters rekenen in `Europe/Amsterdam`, op de dag waarop punten definitief werden toegekend. Registraties en check-ins spelen nooit mee.

## Realtime en herstel

Alleen `activity` wordt gepubliceerd. Een toegelaten INSERT-event laat de browser opnieuw onder zijn eigen sessie en RLS lezen. Intrekken veroorzaakt zo het verwijderen van eerder getoonde records, zonder een publiek DELETE-payload met recordinhoud. De Supabase-client reconnect automatisch. Een focus/online-trigger en 15 seconden polling vangen gemiste events op. Verouderde async responses worden met een generatiecounter genegeerd. Bij fouten verdwijnt het geladen gevoelige overzicht; formulieren blijven open.

Registraties gebruiken een vaste UUID per formulier en INSERT ON CONFLICT DO NOTHING tegen dubbelklikken en onduidelijke netwerkantwoorden. Bewijsuploads gebruiken een vaste UUID/pad voor retry. Een upload die geslaagd is terwijl indienen faalt blijft privé en kan opnieuw worden ingediend; eigen gegevens wissen ruimt ook deze objecten op. Er is geen automatische achtergrondupload bij slecht bereik.

De volledige geladen historie kan in stappen van 100 verder terug worden opgehaald; range-requests vermijden de standaardlimiet van 1.000 rows. Home toont de eigen laatste registratie en een compact crew-overzicht. De afzonderlijke crewpagina toont alle leden en neutrale statistieken. Check-ins tonen de laatste 100, review/wall de laatste 200 inzendingen; voor grote langdurige communities is paginering daarvan een vervolgstap. De puntentelling blijft volledig doordat die server-side aggregeert.

## PWA en deployment

Service worker: alleen icons, manifest en offlinehulppagina. Geen cache voor HTML, Supabase, media, tokens of persoonlijke data. Supabase Auth bewaart de sessie volgens de SSR-client/cookieconfiguratie; gevoelige invoertekst wordt niet persistent lokaal opgeslagen. Installatie op iPhone gebeurt via Safari.

Vercel bouwt de statische shell en de authcallbackroute. Alleen publieke Supabase-configuratie is nodig. HTTPS, hosted SMTP, productieback-ups, storage-bewaarbeleid en praktijkvalidatie op fysiek iPhone vallen onder de productie-inrichting in SETUP.md. De optionele kleine lokale stack is uitsluitend voor ontwikkeling en integratievalidatie.

## V2-profielen en historische overzichten

`profiles` bewaart `avatar_path`, profiel-/onboardingvoltooiing en `active_crew_id`. Alleen gecontroleerde RPC’s schrijven deze nieuwe velden: naamvalidatie, foto-eigendom en crewlidmaatschap worden op de server gecontroleerd. Onvoltooide onboarding wordt bij opnieuw inloggen hervat. Invitecodes blijven tijdens authenticatie behouden; de authcallback accepteert alleen geldige interne invitepaden.

`profile-photos` is een private bucket met een limiet van 5 MB en JPEG/PNG/WebP. De browser verwerkt gekozen foto’s tot een vierkante JPEG van 512 pixels zonder oorspronkelijke metadata, inclusief preview. Uploadpaden zijn `user_id/random_uuid.jpg`; overschrijven is niet toegestaan. Een niet-geselecteerde upload is alleen voor de eigenaar zichtbaar; een gekozen profielfoto volgt de bestaande profiel-RLS voor crewleden. Ondertekende links verlopen na 60 seconden. Gegevens-/accountverwijdering ruimt zowel avatars als challengebewijs via de Storage API op vóór databaseverwijdering.

`visible_timeline` en `crew_record_summary` zijn SECURITY INVOKER: ook aantallen en laatste labels volgen de records-RLS van de aanvrager. Filters op eigenaar, exacte labeltekst en Amsterdamse kalenderdag werken in PostgreSQL vóór paginering. SOS, MDMA, XTC, Paddo-druppels en Joint komen uit `lib/record-labels.ts`; Anders bewaart de letterlijke gebruikersinvoer. Statistieken zijn alfabetisch en leveren geen punten of rangorde op. Alleen fotochallenges kennen punten toe.

De mobiele navigatie bevat Home, Tijdlijn, Crew en Challenges; challenge-review/leaderboard/wall zijn subnavigatie. Instellingen, crewkeuze, beheer en accountverwijdering staan achter het profielmenu. Registratie gebruikt twee stappen, een vaste UUID en een submitlock; netwerkfouten behouden het formulier in geheugen en vereisen een bewuste retry. Succes keert terug naar Home. Dialogen beheren focus en ondersteunen Escape; touch targets zijn minimaal 44 pixels en reduced-motion blijft gerespecteerd.
