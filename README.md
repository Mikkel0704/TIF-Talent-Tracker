# TIF Talent Tracker

Webapp til talentarbejdet i Tjørring IF: medaljeforløbet (Talentmærket), hjemmetræning
(Daglig fodteknik og Jongleringsstigen), dueller mellem holdkammerater og en rangliste.
Trænere registrerer og godkender; spillere og forældre træner hjemme og følger med.

Live: https://mikkel0704.github.io/TIF-Talent-Tracker/

## Sådan hænger det sammen

| Del | Hvor |
|---|---|
| Selve appen | `index.html` - én fil, ingen build. GitHub Pages viser `main`. |
| Login | Firebase Authentication (email + adgangskode) |
| Data | Cloud Firestore, projekt `tif-talent-tracker`, EU (eur3) |
| Videoer | Cloud Storage, bøtte `tif-talent-tracker`, Belgien (europe-west1). Mapperne hedder `submissions/{login-id}/`, kan ikke listes, og tømmes af en slettefrist på 8 dage. |
| Adgangsregler | `firestore.rules` og `storage.rules` |
| Værn mod fremmede klienter | App Check med reCAPTCHA Enterprise, håndhævet på Firestore og Storage |
| Tests | `tests/` - se `tests/README.md` |

Der er ingen server og ingen Cloud Functions. Alt, der skal håndhæves, håndhæves i
reglerne; alt andet er brugerflade.

## Udrulning

**Appen:** et push til `main` ruller ud af sig selv via GitHub Pages. Det tager et minuts
tid, og browseren kan holde på den gamle udgave lidt endnu - versionsnummeret står i
statuslinjen øverst.

**Reglerne rulles ikke ud af sig selv.** En ændring i `firestore.rules` gør ingenting, før
den er rullet ud. Kør regeltestene først, og brug `tests/vaerktoej/udrul-regler.cjs`, som
læser reglerne tilbage og sammenligner dem med filen. Rækkefølgen betyder noget: kræver ny
kode en ny regel, skal reglen ud først - ellers får familierne "missing or insufficient
permissions".

`storage.rules` rulles ud for sig med `tests/vaerktoej/udrul-lager.cjs`, som også sætter
bøttens slettefrist: alt under `submissions/` slettes af Google efter 8 dage, uanset hvad
appen gør.

## Instruktionsvideoer

En administrator kan lægge én kort video op pr. øvelse under Admin → Instruktionsvideoer.
Spillerne får en "Se video"-knap på øvelsen under Fodteknik, Jonglering og Guides.

- **Filen** ligger under `guides/{plads}/` i samme lager. Mappen er uden for
  `submissions/`, så slettefristen rammer den ikke - en instruktionsvideo bliver liggende,
  til en administrator skifter den ud eller sletter den.
- **Adressen** står i ét dokument, `clubConfig/guideVideos`, med et felt pr. plads
  (`f_` + fodteknik-kode, `t_` + trick-id, `m_` + nummeret på Talentmærkets øvelse). Alle
  aktive logins læser det; kun en administrator kan skrive.
- **Upload kræver et mærke på loginnet.** Lagerreglerne kan ikke slå roller op i
  Firestore, så mappen åbnes af mærket `admin` på selve loginnet (custom claim). Det sættes
  med `tests/vaerktoej/saet-admin-maerke.cjs`, som giver det til aktive administratorer og
  tager det fra alle andre. Kør værktøjet, **hver gang en administrator kommer til eller
  holder op** - indtil da kan en ny administrator alt andet, men ikke uploade en video.
  Mærket styrer kun, hvem der kan lægge filer i mappen; hvilken video appen viser, følger
  rollen i appen.
- **Forældreløse filer.** Slår sletningen af en udskiftet fil fejl, bliver filen liggende
  i `guides/` uden at blive vist nogen steder. Appen siger det, når det sker.

## Service-nøgler

En service-nøgle går uden om alle regler og kan læse og slette alt om alle børn.

- Lav en frisk nøgle, hver gang der skal rulles regler ud.
- Slet filen bagefter, **og slet selve nøglen** i Google Cloud Console
  (IAM → Service Accounts → Keys). En slettet fil er ikke en slettet nøgle.
- Læg den aldrig i repoet. `tests/.gitignore` holder den ude, men det er et sikkerhedsnet,
  ikke en plan.

## Point gemmes ikke

Point fra Daglig fodteknik og Jongleringsstigen står ingen steder i databasen. Der gemmes
kun registreringerne, og point regnes ud af dem, hver gang de vises. Derfor kan en
rettelse, en sletning eller en bagudregistrering aldrig efterlade et forkert tal et andet
sted - og derfor kan en spiller ikke skrive point til sig selv: der er intet pointfelt at
skrive i. Medaljepoint står på spilleren og kan kun skrives af en træner.

## Fodteknik: regler med dato

Fodteknikkens kategorier, point, tider og kombier ligger i versioner med en dato
(`FOOTWORK_V1` og `FOOTWORK_KATEGORIER` i `index.html`). Hver dag regnes efter den
version, der gjaldt den dag, så en dag aldrig skifter point bagud, når en øvelse flyttes
eller får nye point.

- **Version 1** er reglerne fra før november 2026: Let 2, Mellem 3, Svær 4,
  jongleringstræning 8, og kombier på tre gennemførelser. Den er frosset.
- **Version 2** gælder fra `FOOTWORK_V2_FRA`, som er sat til **2026-11-14**: Starter 2, Let 3, Mellem 4, Svær 5,
  Grundtræning 5. Kombierne er "samme øvelse 3 gange" (+5) og "én fra hvert niveau" (+7).

**Skiftedatoen** sættes ved at rette én linje i `index.html`:
`const FOOTWORK_V2_FRA = "ÅÅÅÅ-MM-DD";`. Den må aldrig sættes til en dag før i dag,
og den må aldrig ændres, når dagen er passeret - begge dele ville give dage, der allerede
er registreret, nye point. Står den i 2099, gælder version 1 stadig.

Skal noget flyttes igen, laves en version 3 med sin egen dato. Version 1 og 2 røres ikke.

**Koderne skifter aldrig betydning.** En dag gemmes som `{kode: antal}`, og koden bærer
historikken og instruktionsvideoen. En øvelse omdøbes derfor ved at ændre navnet, ikke
koden - "V-rul" hedder nu "V-rul yderside" (kode `v`), "V+L rul" hedder "L+V-rul" (kode `k`).
`tests/logik/fodteknik-v1-reference.mjs` er en frossen kopi af beregningen fra før
ændringen; migreringstesten kræver, at gamle dage giver præcis samme point som den.

## Samlinger i Firestore

| Samling | Indhold | Hvem må læse |
|---|---|---|
| `users` | Login, rolle, årgange | Brugeren selv og admin |
| `players` | Navn, årgang, medaljer, medaljepoint, historik | Egen årgang |
| `playerNotes` | Trænerens note | Kun trænere |
| `submissions` | Indsendelser: øvelse, status og point - **ikke** videolinket | Egen årgang |
| `submissionVideos` | Link og sti til videoen, samme id som indsendelsen | Træneren, barnet selv, og duel-modparten efter afgørelsen |
| `challenges` | Dueller | Egen årgang |
| `juggleLadder` / `footwork` | Fremdrift og registreringer - kun tal og datoer | Hele klubben |
| `juggleLog` / `footworkLog` | Hvem registrerede hvad; joker-begrundelser | Egen årgang |
| `clubRanking` | Navn, årgang og medaljepoint til klub-top-10 | Hele klubben |
| `clubConfig` | Hvilke årgange kører Talentmærket (`modules`); adresserne på instruktionsvideoerne (`guideVideos`) | Hele klubben |
| `deletionRequests` | Anmodninger om sletning | Admin og familien selv |

De samlinger, hele klubben må læse, rummer med vilje hverken navne (bortset fra
ranglisten) eller bruger-id'er.

## Backup

Der er ingen automatisk backup. Under Indstillinger kan en træner eller admin hente en
JSON-fil med alt, vedkommende har adgang til. Links til spillernes indsendte videoer er
udeladt; adresserne på instruktionsvideoerne er med. Der er ingen
gendan-knap; filen er en læsbar kopi.
