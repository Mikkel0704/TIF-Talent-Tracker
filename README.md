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
| Ranglisten | Cloud Functions i `functions/`, Belgien (europe-west1). Regner hvert barns point ud og skriver én linje pr. barn - se "Ranglisten regnes på serveren". |
| Tests | `tests/` - se `tests/README.md` |

Serveren gør to ting: den regner ranglisten ud, og den kårer Månedens spiller. Alt andet,
der skal håndhæves, håndhæves i reglerne; resten er brugerflade.

## Udrulning

**Appen:** et push til `main` ruller ud af sig selv via GitHub Pages. Det tager et minuts
tid, og browseren kan holde på den gamle udgave lidt endnu - versionsnummeret står i
statuslinjen øverst.

**Reglerne rulles ikke ud af sig selv.** En ændring i `firestore.rules` gør ingenting, før
den er rullet ud. Kør regeltestene først, og brug `tests/vaerktoej/udrul-regler.cjs`, som
læser reglerne tilbage og sammenligner dem med filen. Rækkefølgen betyder noget: kræver ny
kode en ny regel, skal reglen ud først - ellers får familierne "missing or insufficient
permissions".

**Funktionerne rulles heller ikke ud af sig selv.** `tests/vaerktoej/udrul-funktioner.cjs`
laver pointkoden forfra ud fra `index.html`, ruller ud og læser tilbage, hvilke funktioner
der ligger live. Kør derefter `tests/vaerktoej/genberegn-rangliste.cjs`. **Ændres en
pointregel i `index.html`, skal `POINTREGLER` hæves, funktionerne rulles ud og ranglisten
genberegnes** - ellers regner serveren videre med de gamle regler. Admin-siden viser en
advarsel, når det er tilfældet ("Ranglisten på serveren").

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

## Adgangsreglerne i korte træk

- **Et login uden for klubben kan ingenting.** Alle kan oprette en Auth-konto i projektet,
  fordi logins oprettes fra browseren. Derfor kræver hver regel et aktivt `users`-dokument;
  `signedIn()` alene giver aldrig adgang. `!isPlayerRole()` betyder "ikke en aktiv spiller"
  og er også sand for fremmede og deaktiverede - brug det aldrig uden `isActive()`.
- **En træner rører kun det, der allerede ligger i trænerens egne årgange.** En rettelse
  kræver adgang til både det eksisterende dokument og det nye indhold; ellers kunne en
  træner flette sin egen årgang ind på et andet barns dokument og dermed overtage det.
- **Spillere læser kun deres egne logge** (`footworkLog`, `juggleLog`), hvor joker-
  begrundelser og bruger-id'er står.
- **En spiller henter kun det om andre børn, som ranglisten viser.** Eget spillerdokument,
  egne registreringer, årgangens linjer i `rangliste`, `klubRangliste/top`,
  `maanedensSpiller` og indsendelser og dueller, barnet selv er part i. Ikke andre børns
  spillerdokumenter, træningsdage, stige eller indsendelser. Appens forespørgsler er formet
  præcis, som reglerne kan bevise dem - en bredere forespørgsel afvises som helhed.
- **Ingen klient skriver i `rangliste` eller `klubRangliste`** - heller ikke admin.
- **Et læsetjek må ikke give `null` som standard for køn.** I en forespørgsel uden
  køns-klausul giver `.get("gender", null)` netop `null`, og så slipper en træner med kun
  drenge ind til hele årgangen. Derfor læses `resource.data.gender` uden standardværdi.
- Reglerne må højst regne 1000 udtryk pr. forespørgsel. `traenerAdgang()` slår derfor
  brugeren op én gang; regeltestene må ikke give advarslen "maximum of 1000 expressions".

## Service-nøgler

En service-nøgle går uden om alle regler og kan læse og slette alt om alle børn.

- Lav en frisk nøgle, hver gang der skal rulles regler ud.
- Slet filen bagefter, **og slet selve nøglen** i Google Cloud Console
  (IAM → Service Accounts → Keys). En slettet fil er ikke en slettet nøgle.
- Læg den aldrig i repoet. `tests/.gitignore` holder den ude, men det er et sikkerhedsnet,
  ikke en plan.

## Ranglisten regnes på serveren

En spiller må ikke kunne hente andre børns registreringer, men ranglisten skal vise deres
point. Derfor regner en Cloud Function pointene ud og skriver én linje pr. barn:

- `rangliste/{spiller-id}`: navn, årgang, køn, om barnet kan udfordres, point i alt, og
  point denne uge og denne måned med den dato, perioden begynder (`uge.fra`, `maaned.fra`).
- `klubRangliste/top`: klubbens top 10 med navn, årgang og point i alt.

**Samme kode, ikke en kopi.** `functions/byg.mjs` skærer pointkoden ud af `index.html` og
skriver `functions/genereret/pointkode.js`, som ikke ligger i repoet. Den laves forfra før
hver test og hver udrulning og stopper med en fejl, hvis noget, den skal bruge, mangler.
`tests/funktioner/paritet.test.mjs` åbner den rigtige side og sammenligner tallene barn for
barn med serverens linje.

**Ranglisten har ingen planlagt kørsel.** Linjen regnes ud, hver gang barnets spillerdokument, stige,
stigelog, fodteknik eller indsendelser ændres. Står der en gammel dato i `uge.fra` eller
`maaned.fra`, læser appen periodens point som 0 - det er rigtigt, fordi der så ikke er
skrevet noget siden perioden skiftede. Der er ingen trigger på `rangliste` eller
`klubRangliste`, så funktionen kan aldrig udløse sig selv.

**Tid.** Pointkoden bruger lokal tid, og i browseren er det dansk tid. Serveren sætter
derfor tidszonen til Europe/Copenhagen, før noget andet køres (`functions/tid.js`).

**Trænere og admin** regner stadig årgangens liste ud af de rå data, som de alligevel
henter. Admin-siden sammenligner serverens linjer med appens egen beregning.

## Månedens spiller kåres af serveren

`maanedensKaaring` kører hver morgen kl. 05.00 dansk tid (Cloud Scheduler). Den finder de
måneder, der er afgjort (den 5. i måneden efter), og opretter den kåring, der mangler, for
hver årgang med spillere - med appens egen kode, skåret ud af `index.html` ligesom
pointkoden. De fleste dage finder den ingenting og skriver ingenting.

- **Daglig med vilje:** kørslen kan gentages uden skade, så en fejlet kørsel den 5. bliver
  indhentet næste morgen.
- **En kåring oprettes én gang** (`create()`), og findes den allerede, stopper serveren for
  den årgang. Appens egen kåring (`kaarMaanedensSpiller`) er reserven: åbner admin appen,
  før serveren har kåret, opretter appen posten, og serveren lader den stå.
- **Registreringer til og med den 4. tæller med.** Det, der først skrives ind i løbet af
  den 5., kommer ikke med.
- `tests/funktioner/kaaring-paritet.test.mjs` lader den rigtige side kåre og sammenligner
  det, siden skriver, felt for felt med serverens.

## Point gemmes ikke

Point fra Daglig fodteknik og Jongleringsstigen står ingen steder i databasen. Der gemmes
kun registreringerne, og point regnes ud af dem, hver gang de vises. Derfor kan en
rettelse, en sletning eller en bagudregistrering aldrig efterlade et forkert tal et andet
sted - og derfor kan en spiller ikke skrive point til sig selv: der er intet pointfelt at
skrive i. Medaljepoint står på spilleren og kan kun skrives af en træner.

Ranglistens linjer er ikke en undtagelse: de er et udregnet spejl, som kun serveren
skriver, og som kan regnes forfra af registreringerne når som helst
(`tests/vaerktoej/genberegn-rangliste.cjs`).

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
| `players` | Navn, årgang, medaljer, medaljepoint, historik | Barnet selv; trænere i årgangen |
| `playerNotes` | Trænerens note | Kun trænere |
| `submissions` | Indsendelser: øvelse, status og point - **ikke** videolinket | Barnet selv og modparten i en duel; trænere i årgangen |
| `submissionVideos` | Link og sti til videoen, samme id som indsendelsen | Træneren, barnet selv, og duel-modparten efter afgørelsen |
| `challenges` | Dueller | De to parter; trænere i årgangen |
| `juggleLadder` / `footwork` | Fremdrift og registreringer - kun tal og datoer | Barnet selv; trænere i årgangen |
| `juggleLog` / `footworkLog` | Hvem registrerede hvad; joker-begrundelser | Barnet selv; trænere i årgangen |
| `rangliste` | Én linje pr. barn, skrevet af serveren: navn, årgang, køn, point | Egen årgang - og kun eget køn, når login'et er begrænset til ét køn (det er spillerlogins) |
| `klubRangliste` | `top`: klubbens top 10, skrevet af serveren | Hele klubben |
| `clubRanking` | Gammelt spejl af medaljepoint. Skrives stadig af trænere, læses ikke længere af appens rangliste | Trænere i årgangen og admin |
| `clubConfig` | Hvilke årgange kører Talentmærket (`modules`); adresserne på instruktionsvideoerne (`guideVideos`) | Hele klubben |
| `maanedensSpiller` | Månedens spiller pr. måned og årgang: vinder(e) med navn og de tal, der afgjorde det. Oprettes én gang, ændres aldrig | Hele klubben |
| `deletionRequests` | Anmodninger om sletning | Admin og familien selv |

De samlinger, hele klubben må læse, rummer med vilje hverken bruger-id'er eller andet om
et barn end navn, årgang og de tal, der står på en rangliste eller en kåring.

## Backup

Der er ingen automatisk backup. Under Indstillinger kan en træner eller admin hente en
JSON-fil med alt, vedkommende har adgang til. Links til spillernes indsendte videoer er
udeladt; adresserne på instruktionsvideoerne er med. Der er ingen
gendan-knap; filen er en læsbar kopi.
