# Tests

Testene kører mod **den rigtige kode** i `../index.html` og **de rigtige regler** i
`../firestore.rules`. De henter funktionerne ud af filen, hver gang de kører, så en test
ikke langsomt kan komme til at teste en kopi, der er blevet til noget andet.

```
cd tests
npm install
npx playwright install chromium   # kun første gang

npm run logik     # point, kombier, streaks, stigen, rangtrin, Månedens spiller og topscorer
npm run visning   # de rigtige visninger i en rigtig browser, telefonbredde
npm run regler    # firestore.rules i Firestore-emulatoren (kræver Java)
npm run funktioner  # serveren: ranglisten, Månedens spiller og topscorer, logins og sletning (kræver Java)
npm run alt       # logik, visning og regler (funktioner køres for sig)
```

| Mappe | Hvad den dækker |
|---|---|
| `logik/` | Ren beregning. `udtraek.mjs` henter fodteknik-koden ud af `index.html`. `topscorer.test.mjs` prøver Månedens topscorer på den kode, serveren regner med: `npm run logik` lader `../functions/byg.mjs` skrive `logik/pointkode.mjs` først. Point i måneden (medaljer efter godkendelsesdato, stigens trin efter loggens dato, fodteknik med kombi og streak - og at tallet er det, "Denne måned" viste), hvert trin i den lige stilling (øvelser, svære, mellem, lette, starter, delt pris), grundtræning og version 1's jongleringstræning som svær, version 1- og 2-dage i samme måned, godkendte jokere, Månedens spiller udelukket (også en delt), ingen andre med point, samme topscorer to måneder i træk, drenge og piger sammen. |
| `visning/` | Tegner de rigtige sider med opdigtede data og tjekker, hvad der står. |
| `visning/logins.mjs` | Hele appen som admin: formularerne kalder `opretLogin`/`sletLogin` med det, serveren forventer, serverens danske beskeder vises, som de er, og intet i siden opretter logins i browseren. |
| `visning/maaned-visning.mjs` og `visning/maaned-kaaring.mjs` | Månedens spiller og Månedens topscorer på skærmen og i appens reserve-kåring: kortet med begge priser (pokalen og bolden, tallene, tomme tilstande, forklaringerne), profilen med alle priser nyeste først, emblemerne ved navnene (aria-labels, unikke id'er pr. SVG, bolden mindre end pokalen), og at siden kårer topscoreren lige efter Månedens spiller for samme måned og årgang - på den gemte Månedens spiller, hvis den findes. `visning/rangliste.mjs` har pokal og bold ved navnene i årgangslisten og klubbens top 10. |
| `visning/sletning.mjs` | "Slet alt" som admin: dialogen viser `sletSpiller`'s opgørelse (tal og e-mails), navnet skal skrives, der sendes først `kunOpgoer` og så `navn`, slutbeskeden med og uden fejl - og siden slår intet op og sletter intet selv. |
| `visning/stigevisning.mjs` og `visning/stigetraener.mjs` | Jongleringsstigen for spilleren og i trænerens blok: point pr. trin, de 16 tricks under Let/Mellem/Svær med point, låste tricks i serierne (Inderside 5 → 10 → 20, Yderside 5 → 10 → 20, Hælen bagom 3 → 5) med grunden, at serien registreres i rækkefølge, fortryd-dialogen, der nævner de tricks, der ruller med, trænerens rettelse, der holder serien hel - og ingen vandret scroll ved 390 px. `logik/stige.test.mjs` prøver det samme i ren beregning. |
| `visning/helapp.mjs` | Starter **hele** `index.html` uændret mod en efterlignet Firebase i hukommelsen og klikker rundt som spiller, demo, træner og admin. Den eneste test, hvor alle delene mødes. |
| `regler/` | Sender rigtige forespørgsler mod `firestore.rules` og `storage.rules` i emulatorerne - uden App Check og uden produktion. `flytning.test.mjs` prøver flytteværktøjet mod emulatoren. `topscorer.rules.test.mjs` er `maaned.rules.test.mjs` for `maanedensTopscorer`: hvem må oprette, kun når måneden er afgjort, kun én gang, formen (højst 30 vindere), admin må kun gøre vinderlisten kortere, ingen må slette, og list-forespørgsler for alle roller. |
| `funktioner/` | Cloud Functions i `../functions`. `logik.test.mjs` prøver beregningen af en linje og at `byg.mjs` stopper, hvis `index.html` mangler noget. `paritet.test.mjs` åbner den rigtige side som admin og sammenligner hvert barns tal med serverens linje på fem tidspunkter. `emulator.test.mjs` kører de rigtige triggere i emulatoren. `logins.test.mjs` kalder `opretLogin` og `sletLogin` over HTTP, som appen gør, med rigtige ID-beviser fra Auth-emulatoren: hvem der må, hvad der skrives, danske fejlbeskeder, og at et halvt oprettet login rulles tilbage. `sletning.test.mjs` kalder `sletSpiller` på samme måde mod et barn med alt (to logins, videofiler med og uden sti i databasen, dueller, kåringer, ranglistelinje): opgørelsen er præcis og skriver intet, forkert navn og forkerte kaldere sletter intet, alt forsvinder - også login'ene i Auth-emulatoren og filerne i Storage-emulatoren - mens et andet barn i årgangen står urørt, en kørsel mere har intet at gøre, ranglistetriggerne genskaber ikke linjen, og en fejl på én fil meldes og klares af en ny kørsel. `selvoprettelse.test.mjs` og `fremmede-konti.test.mjs` prøver de to login-værktøjer mod Auth- og Firestore-emulatoren (Auth-emulatoren gemmer indstillingen, der lukker for selvoprettelse, men håndhæver den ikke - testen bruger netop det til at vise, at værktøjet opdager en oprettelse, der lykkes, og sletter den igen). `omlaeg-stige.test.mjs` kører omlægningen af Jongleringsstigen (2026-11-20) mod emulatoren med de rigtige ranglistetriggere: barnet på gammelt trin 13/10 med log, fortryd og rettelser, børn hvis trin ikke ændrer sig, tørkørsel uden skrivninger, en kørsel mere uden skrivninger og serverens linje bagefter. `kaaring.test.mjs` og `kaaring-paritet.test.mjs` gør det samme for Månedens spiller og Månedens topscorer: reglerne én for én (rækkefølgen, de gemte poster, create der støder på en post, der findes), og den rigtige sides egen kåring sammenlignet med serverens felt for felt og i rækkefølge på fem tidspunkter - med tilfældige medaljer, stiger og logge. `emulator.test.mjs` kører kåringen af begge priser mod Firestore-emulatoren: create overskriver aldrig (heller ikke en topscorer, browseren nåede først), en kørsel mere skriver intet, og den planlagte funktions handler. `sletning.test.mjs` fjerner også barnet fra topscorer-posterne (delt og alene) uden at slette posterne. Testene kører bevidst i forskellige tidszoner - koden skal selv sætte dansk tid. Emulatoren har sine egne porte (`funktioner/firebase.json`; Auth på 9199, Storage på 9299) og et opdigtet projekt, så den hverken kan støde sammen med regeltestene eller nå produktion. |
| `vaerktoej/` | `udrul-funktioner.cjs` (Cloud Functions), `genberegn-rangliste.cjs` (regner alle ranglistens linjer forfra), `omlaeg-stige.cjs` (engangsomlægning af stigens gemte trinnumre til de nye stiger 2026-11-20; originalerne gemmes på `juggleLog`), `tjek-foer-rangliste.cjs` (læser kun: er de rigtige data klar til de strammede regler?), `udrul-regler.cjs` (Firestore-regler), `udrul-lager.cjs` (lagerregler og slettefrist), `flyt-videoer.cjs` (engangsflytning af gamle videolinks) og `saet-admin-maerke.cjs` (giver aktive administratorer lov til at uploade instruktionsvideoer) og `oprydning.cjs` (fjerner forældre-e-mails fra indsendelser og sletter originalerne af de slørede instruktionsvideoer), `luk-selvoprettelse.cjs` (lukker for, at enhver kan oprette en konto i Firebase Authentication, og beviser det udefra; `--tjek` læser kun) og `fremmede-konti.cjs` (logins uden `users`-dokument og omvendt; `--slet` sletter de første). Skriver aldrig en hel e-mailadresse ud. Alle læser tilbage, hvad de har gjort, og alle på nær den første har en tørkørsel. |

## To ting, testene har lært os på den hårde måde

**Send det, klienten sender.** En regeltest, der opretter et dokument med alle felter på én
gang, beviser ingenting, hvis appen sender ét felt ad gangen. Præcis dén forskel spærrede
for hver spillers første registrering på Jongleringsstigen. Regeltestene skal være formet
som kalderen, ikke som reglen.

**Et felt, der ikke findes, nægter alt.** Læser en regel `data.felt`, og feltet mangler,
fejler hele udtrykket, og skrivningen afvises. Tjek altid med `"felt" in data` først - og
hav en test med et dokument, der mangler feltet.

**En standardværdi kan åbne en dør.** `.get("gender", null)` redder en regel fra et
manglende felt, men i en forespørgsel uden køns-klausul bliver værdien også `null` - og en
regel, der siger "køn er ligegyldigt, hvis det er null", lukker så en træner med kun drenge
ind til pigerne. Det fangede `regler/rangliste.rules.test.mjs`, fordi testen spurgte præcis,
som appen spørger.

## Regeludrulning

Reglerne rulles **ikke** ud af sig selv, når filen ændres i repoet.

```
# læg en FRISK service-nøgle i tests/service-account.json
node vaerktoej/udrul-regler.cjs --tjek   # er live = repo?
node vaerktoej/udrul-regler.cjs          # rul ud, læs tilbage
rm service-account.json                  # og slet nøglen i Google Cloud Console
```

Kør altid `npm run regler` først.
