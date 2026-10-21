# Teststrategie en resultaten

Uitgevoerd op 21 oktober 2026 in deze cloudomgeving, met Node 24, PostgreSQL 17 en echte lokale Supabase Auth-, Storage- en Realtime-services. Alle accounts en bestanden in de suites zijn tijdelijke testfixtures. Dit is geen validatie van een hosted productieproject.

## Resultaten

| Controle                                     | Resultaat                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| TypeScript `npm run typecheck`               | Geslaagd                                                                                                        |
| ESLint `npm run lint`                        | Geslaagd, zonder meldingen                                                                                      |
| Vitest unit                                  | 7 tests geslaagd                                                                                                |
| Vitest Supabase-integratie                   | 26 tests geslaagd                                                                                               |
| Playwright Chromium desktop                  | 6 tests geslaagd                                                                                                |
| Playwright mobiel Chromium                   | 6 tests geslaagd, in productiemodus; Pixel 7 en 390 × 844                                                       |
| Productiebuild Next.js                       | Geslaagd, ook na een schone npm ci                                                                              |
| `npm audit --omit=dev --audit-level=high`    | 0 kwetsbaarheden gemeld                                                                                         |
| Kleine lokale stack opnieuw starten          | Geslaagd; migratieledger voorkomt dubbel toepassen                                                              |
| `local-wal2json.sh` herhalen en plugin laden | Geslaagd, SHA256 gecontroleerd en replication-slot aangemaakt/verwijderd                                        |
| WebKit / fysiek iPhone                       | Niet uitgevoerd: Playwright-binarydownload geblokkeerd op `cdn.playwright.dev`; geen fysiek toestel beschikbaar |
| GitHub Actions                               | Workflow toegevoegd; uitvoering op GitHub nog niet geverifieerd                                                 |
| Hosted Supabase, SMTP en Vercel-deployment   | Niet uitgevoerd: geen gekoppelde externe projectconfiguratie                                                    |

## Unit-tests

`npm test` controleert invoergrenzen, tijdstippen in de toekomst, lege waarden, historische verstreken tijd, Amsterdamse winter-/zomertijd, authenticatievalidatie, mediatypes/grootte en challengepunten/niveaus/festivals. De tests verzinnen geen veiligheids- of herdoseerregels.

## Integratietests

```bash
node scripts/with-local-env.mjs npm run test:integration
```

De suite gebruikt uitsluitend normale ingelogde gebruikers via de publieke Supabase-client. Geen service-role bypass in assertions. Vier gebruikers, twee crews, echte database-RLS, Auth, HTTP Storage en WebSocket Realtime worden gebruikt.

1. Registreren en opnieuw inloggen; privécrews, twintig templates, uitnodigingslimieten voor onbevoegden en idempotent deelnemen.
2. Een registratie tweemaal met dezelfde UUID opslaan geeft één rij. Ook de beheerder kan de privéregistratie van een ander niet lezen of diens consent aanpassen.
3. Delen en intrekken veranderen toegestane lezingen; een andere crew ziet niets.
4. Identiteit vervalsen, cross-crew schrijven en vreemde registraties bewerken worden geweigerd; eigen correctie werkt.
5. Een daadwerkelijke realtime-invalidatie bereikt een tweede ingelogde sessie en bevat geen middel of notitie. Er is geen polling die dit testresultaat kan laten slagen.
6. Check-ins zijn per bericht privé/deelbaar/intrekbaar.
7. Foto-upload is privé tot inzending; huidige crewleden kunnen bewijs lezen. Anonymous en andere crews worden geweigerd, ook voor signed URL-aanvragen. Bewijs overschrijven wordt geweigerd.
8. Zelfstemmen, vreemde crewstemmen, directe puntinserts en browserwijzigingen aan submissionstatus worden geweigerd. Twee andere stemmen geven precies één award; de ranglijst sommeert correct en festivalfiltering werkt.
9. Video-MIME en private opslag/download worden gecontroleerd; drempel één voor kleine crews werkt. De videofixture controleert opslag/autorisatie, niet videodecodering of iPhone-codecs.
10. Gelijktijdige reviewers leiden tot één award. Challengepunten wijzigen ná inzending verandert de vastgelegde punten niet.
11. Eigen registratie verwijderen en crewlidmaatschap intrekken blokkeren verdere toegang tot database en bewijs.
12. Persoonlijke gegevens worden pas gewist nadat de echte storage-objecten via de Storage API zijn verwijderd. Records, check-ins, inzendingen en eigen awards verdwijnen; de accountidentiteit blijft bestaan.

De teardown verwijdert accounts in de juiste volgorde (beheerder laatst) en verifieert dat Auth het verwijderde account niet meer teruggeeft. Een fout in accountverwijdering laat de suite falen. Afgebroken eerdere runs kunnen nog fixtures bevatten; deze lokale omgeving is uitsluitend voor tests.

## Browsertests

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node scripts/with-local-env.mjs npm run test:e2e -- --project=chromium --project=mobile-chromium
```

Vier scenario's per formaat:

- Authschermen en responsive layout; zonder instellingen een eerlijke lege configuratieshell.
- PWA-manifest, daadwerkelijke PNG-/Apple-icons, serviceworker en offlinepagina.
- Twee browsersessies: uitnodiging aannemen, registratie bij netwerkverlies behouden, online opnieuw opslaan, expliciet delen en intrekken zonder refresh, tijdlijn bewerken en verwijderen.
- Drie browsersessies: foto selecteren/uploaden, twee beoordelaars via de interface, correcte punten en privé-Wall of Shame.

De suite bewaart screenshots van tijdlijn en galerij en failure traces in de genegeerde map `test-results`. Ze kunnen gevoelige sessie- of formuliergegevens bevatten; deel traces uitsluitend uit wegwerptests. CI bewaart failure artifacts drie dagen. De losse realtime-integratietest bewijst realtime apart van de 15-secondenherstelpolling in de app.

## Nog in de echte omgeving uitvoeren

Gebruik de checklist in SETUP.md: e-mailbevestiging en herstelmail, authcallback op het echte domein, hosted RLS/Storage/Realtime, fysieke iPhone/Safari/PWA-installatie, afspelen van echte iPhone-video, langzame netwerkherstelpraktijk, back-ups en bewaartermijnen. De CI-workflow bevat ook WebKit, maar is hier niet als uitgevoerd aangemerkt.

## Hercontrole voor deployment

Bij een koude start kon de realtime-test een wijziging versturen vóór de PostgreSQL-stream gereed was. De client onderscheidt nu een WebSocket-join van een werkende PostgreSQL-subscriptie, ververst na de gereedheidsmelding en toont pas dan Live. De test verstuurt de wijziging na dezelfde echte servermelding, zonder polling als bewijs te gebruiken. Na het expliciet herstarten van de Realtime-service zijn de 12 integratietests geslaagd. Typecheck, lint en 7 unit-tests zijn opnieuw geslaagd. Hosted tests blijven geblokkeerd op externe accounttoegang.

Ook de productiebuild en alle 8 desktop-/mobiele Chromium-tests zijn na deze correctie opnieuw geslaagd. Deze resultaten betreffen de lokale productiebuild met de echte lokale Supabase-diensten, niet een publieke deployment.

## Eén gezamenlijke omgeving

De huidige browserflow gebruikt geen crewcreatie of uitnodiging: twee accounts openen dezelfde root-URL en kunnen direct registreren. De browsercases voor delen/intrekken en foto → twee reviews → ranglijst/galerij zijn aangepast voor deze gezamenlijke omgeving, met unieke fixtures zodat gelijktijdige tests elkaars gegevens niet verwarren.

Zes aanvullende integratietests controleren automatische inschrijving, één gedeelde omgeving, geen beheerrechten bij aanmelden, geweigerde anonieme toegang en zelfpromotie, privérecords, expliciet delen/intrekken, behoud van deelkeuze bij opnieuw inschrijven, geen ontsluiting van oude privécrewdata, en parallelle idempotente inschrijving. Samen met de twaalf regressietests zijn dit achttien integratietests.

Ook `supabase/tests/shared-platform.sql` is uitgevoerd tegen de lokale database: een onbevestigd account kan niet aansluiten, e-mailbevestiging activeert deelname en geeft uitsluitend memberrechten met delen uit. De SQL-fixture rolt terug. Deze controle vervangt geen daadwerkelijke hosted bevestigingsmail; de gebruiker heeft die flow eerder zelf bevestigd. De nieuwe hosted migratie moet nog door de projecteigenaar worden uitgevoerd.

Eindcontrole van de gezamenlijke instapflow: typecheck, lint, 7 unit-tests, 18 integratietests, productiebuild en alle 8 Chromium-browsercases tegen productiemodus geslaagd. De SQL-fixture bewijst ook dat accountverwijdering van de laatste beheerder het platform behoudt. De bestaande-installatie-update is lokaal herhaald zonder dubbele inschrijving of challenges. Hosted activering blijft de SQL-stap voor de projecteigenaar.

## V2: actuele eindcontrole

De huidige suite bevat 26 integratietests: 12 oorspronkelijke backendtests, 6 voor de gezamenlijke omgeving en 8 voor V2. De acht aanvullingen toetsen persistente onboarding, private avatars en geselecteerde foto’s, naam-/fotorechten en geweigerde directe profielwrites, crewkeuze met uitnodigingen, afgeschermde samenvattingen zonder privé-aantallen, exacte label-/dag-/eigenaarfilters, intrekken en verwijdering van avatarobjecten vóór gegevenswissen. Amsterdamse daggrenzen worden met vaste historische timestamps gecontroleerd. Alle 26 slagen tegen echte lokale diensten.

Twaalf browsercases slagen tegen de lokale productiebuild: zes scenario’s op desktop en mobiel Chromium. Naast auth/PWA en de bestaande registratie-/challengeflows testen ze registratie via de interface, naam en een echt verwerkt foto-object met preview, onboarding naar Home, de primaire knop boven de vouw, twee taps tot opslaan, correcte opgeslagen timestamp, tijdlijnfilter, herladen, uitloggen en opnieuw inloggen zonder herhaalde onboarding of achtergebleven foutmelding. Een historisch crewfilter verandert de werkelijke laatste registratie op Home niet. Een tweede scenario maakt een privécrew en laat een tweede nieuw account via de uitnodigings-URL aansluiten; beide bewaren de actieve crew. De bestaande twee-/driesessieflows toetsen behouden offline-invoer, delen/intrekken, corrigeren/wissen, foto-upload, twee reviews, leaderboard en wall via de nieuwe navigatie.

Typecheck, lint, 7 unit-tests en productiebuild slagen. De browser uploadt een foto bij mobiel formaat; fysieke camera, iPhone Safari/WebKit en hosted e-mailbevestiging zijn hiermee niet getest. WebKit-download blijft in deze omgeving geblokkeerd. De gebruiker meldde eerder dat de hosted bevestigingsmail en login werkten; V2 heeft geen eigen SMTP of nieuwe publieke credentials nodig. Hosted migratie 004 en de Vercel-uitrol blijven afzonderlijk te controleren.

## Herstel van accounttoegang

Vier extra browsercases (twee op desktop en mobiel) toetsen een ontbrekende membership-RPC met terugkeer naar inloggen en heraanvraag van bevestigingsmail, plus een verwijderde Auth-identiteit achter een bewaarde browsersessie. Deze foutresponses worden expliciet gesimuleerd; accountcreatie/login en fixtureverwijdering gebruiken lokale Supabase. De mailtest toetst aanvraagpayload, foutmelding bij ratelimiet en conditionele succesmelding, niet daadwerkelijke bezorging. De volledige suite bevat nu 16 browsercases.

Na deze correctie slagen typecheck, lint, 7 unit-tests, de productiebuild en alle 16 desktop-/mobiele Chromium-cases tegen productiemodus. Hosted accountstatus en mailbezorging zijn niet geïnspecteerd.
