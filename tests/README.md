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
npm run alt
```

| Mappe | Hvad den dækker |
|---|---|
| `logik/` | Ren beregning. `udtraek.mjs` henter fodteknik-koden ud af `index.html`. |
| `visning/` | Tegner de rigtige sider med opdigtede data og tjekker, hvad der står. |
| `visning/helapp.mjs` | Starter **hele** `index.html` uændret mod en efterlignet Firebase i hukommelsen og klikker rundt som spiller, demo, træner og admin. Den eneste test, hvor alle delene mødes. |
| `regler/` | Sender rigtige forespørgsler mod reglerne i emulatoren - uden App Check og uden produktion. |
| `vaerktoej/` | `udrul-regler.cjs` ruller reglerne ud og læser dem tilbage. |

## To ting, testene har lært os på den hårde måde

**Send det, klienten sender.** En regeltest, der opretter et dokument med alle felter på én
gang, beviser ingenting, hvis appen sender ét felt ad gangen. Præcis dén forskel spærrede
for hver spillers første registrering på Jongleringsstigen. Regeltestene skal være formet
som kalderen, ikke som reglen.

**Et felt, der ikke findes, nægter alt.** Læser en regel `data.felt`, og feltet mangler,
fejler hele udtrykket, og skrivningen afvises. Tjek altid med `"felt" in data` først - og
hav en test med et dokument, der mangler feltet.

## Regeludrulning

Reglerne rulles **ikke** ud af sig selv, når filen ændres i repoet.

```
# læg en FRISK service-nøgle i tests/service-account.json
node vaerktoej/udrul-regler.cjs --tjek   # er live = repo?
node vaerktoej/udrul-regler.cjs          # rul ud, læs tilbage
rm service-account.json                  # og slet nøglen i Google Cloud Console
```

Kør altid `npm run regler` først.
