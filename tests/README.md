# Tests

Testene kører mod **den rigtige kode** i `../index.html` og **de rigtige regler** i
`../firestore.rules`. De henter funktionerne ud af filen, hver gang de kører, så en test
ikke langsomt kan komme til at teste en kopi, der er blevet til noget andet.

```
cd tests
npm install
npx playwright install chromium   # kun første gang

npm run logik     # point, kombier, streaks, stigen, rangtrin
npm run visning   # de rigtige visninger i en rigtig browser, telefonbredde
npm run regler    # firestore.rules i Firestore-emulatoren (kræver Java)
npm run funktioner  # serveren: ranglisten, Månedens spiller og logins (kræver Java)
npm run alt       # logik, visning og regler (funktioner køres for sig)
```

| Mappe | Hvad den dækker |
|---|---|
| `logik/` | Ren beregning. `udtraek.mjs` henter fodteknik-koden ud af `index.html`. |
| `visning/` | Tegner de rigtige sider med opdigtede data og tjekker, hvad der står. |
| `visning/logins.mjs` | Hele appen som admin: formularerne kalder `opretLogin`/`sletLogin` med det, serveren forventer, serverens danske beskeder vises, som de er, og intet i siden opretter logins i browseren. |
| `visning/helapp.mjs` | Starter **hele** `index.html` uændret mod en efterlignet Firebase i hukommelsen og klikker rundt som spiller, demo, træner og admin. Den eneste test, hvor alle delene mødes. |
| `regler/` | Sender rigtige forespørgsler mod `firestore.rules` og `storage.rules` i emulatorerne - uden App Check og uden produktion. `flytning.test.mjs` prøver flytteværktøjet mod emulatoren. |
| `funktioner/` | Cloud Functions i `../functions`. `logik.test.mjs` prøver beregningen af en linje og at `byg.mjs` stopper, hvis `index.html` mangler noget. `paritet.test.mjs` åbner den rigtige side som admin og sammenligner hvert barns tal med serverens linje på fem tidspunkter. `emulator.test.mjs` kører de rigtige triggere i emulatoren. `logins.test.mjs` kalder `opretLogin` og `sletLogin` over HTTP, som appen gør, med rigtige ID-beviser fra Auth-emulatoren: hvem der må, hvad der skrives, danske fejlbeskeder, og at et halvt oprettet login rulles tilbage. `selvoprettelse.test.mjs` og `fremmede-konti.test.mjs` prøver de to login-værktøjer mod Auth- og Firestore-emulatoren (Auth-emulatoren gemmer indstillingen, der lukker for selvoprettelse, men håndhæver den ikke - testen bruger netop det til at vise, at værktøjet opdager en oprettelse, der lykkes, og sletter den igen). `kaaring.test.mjs` og `kaaring-paritet.test.mjs` gør det samme for Månedens spiller: reglerne én for én, og den rigtige sides egen kåring sammenlignet med serverens. Testene kører bevidst i forskellige tidszoner - koden skal selv sætte dansk tid. Emulatoren har sine egne porte (`funktioner/firebase.json`; Auth på 9199) og et opdigtet projekt, så den hverken kan støde sammen med regeltestene eller nå produktion. |
| `vaerktoej/` | `udrul-funktioner.cjs` (Cloud Functions), `genberegn-rangliste.cjs` (regner alle ranglistens linjer forfra), `tjek-foer-rangliste.cjs` (læser kun: er de rigtige data klar til de strammede regler?), `udrul-regler.cjs` (Firestore-regler), `udrul-lager.cjs` (lagerregler og slettefrist), `flyt-videoer.cjs` (engangsflytning af gamle videolinks) og `saet-admin-maerke.cjs` (giver aktive administratorer lov til at uploade instruktionsvideoer) og `oprydning.cjs` (fjerner forældre-e-mails fra indsendelser og sletter originalerne af de slørede instruktionsvideoer), `luk-selvoprettelse.cjs` (lukker for, at enhver kan oprette en konto i Firebase Authentication, og beviser det udefra; `--tjek` læser kun) og `fremmede-konti.cjs` (logins uden `users`-dokument og omvendt; `--slet` sletter de første). Skriver aldrig en hel e-mailadresse ud. Alle læser tilbage, hvad de har gjort, og alle på nær den første har en tørkørsel. |

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
