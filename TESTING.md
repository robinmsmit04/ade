# Teststrategie en resultaten

Uitgevoerd op 21 oktober 2026 in deze cloudomgeving, met Node 24, PostgreSQL 17 en echte lokale Supabase Auth-, Storage- en Realtime-services. Alle accounts en bestanden in de suites zijn tijdelijke testfixtures. Dit is geen validatie van een hosted productieproject.

## Resultaten

| Controle                                     | Resultaat                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| TypeScript `npm run typecheck`               | Geslaagd                                                                                                        |
| ESLint `npm run lint`                        | Geslaagd, zonder meldingen                                                                                      |
| Vitest unit                                  | 7 tests geslaagd                                                                                                |
| Vitest Supabase-integratie                   | 12 tests geslaagd                                                                                               |
| Playwright Chromium desktop                  | 4 tests geslaagd                                                                                                |
| Playwright mobiel Chromium                   | 4 tests geslaagd, ook in productiemodus, browserflows op 390 × 844                                                                     |
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
