# TIF Talent Tracker

Webapp til talentarbejdet i Tjørring IF: medaljeforløbet (Talentmærket), hjemmetræning
(Daglig fodteknik og Jongleringsstigen), dueller mellem holdkammerater og en rangliste.
Trænere registrerer og godkender; spillere og forældre træner hjemme og følger med.

Live: https://mikkel0704.github.io/TIF-Talent-Tracker/

## Sådan hænger det sammen

| Del | Hvor |
|---|---|
| Selve appen | `index.html` - én fil, ingen build. GitHub Pages viser `main`. |
| Login | Firebase Authentication (email + adgangskode). Logins oprettes og slettes af serveren - se "Logins oprettes af serveren". |
| Data | Cloud Firestore, projekt `tif-talent-tracker`, EU (eur3) |
| Videoer | Cloud Storage, bøtte `tif-talent-tracker`, Belgien (europe-west1). Mapperne hedder `submissions/{login-id}/`, kan ikke listes fra appen, og tømmes af en slettefrist på 8 dage. |
| Adgangsregler | `firestore.rules` og `storage.rules` |
| Værn mod fremmede klienter | App Check med reCAPTCHA Enterprise, håndhævet på Firestore og Storage |
| Ranglisten, logins og sletning | Cloud Functions i `functions/`, Belgien (europe-west1). Regner hvert barns point ud og skriver én linje pr. barn - se "Ranglisten regnes på serveren". Opretter og sletter logins - se "Logins oprettes af serveren". Sletter alt om et barn - se "Slet alt om et barn". |
| Tests | `tests/` - se `tests/README.md` |

Serveren gør fire ting: den regner ranglisten ud, den kårer Månedens spiller og Månedens
topscorer, den opretter og sletter logins, og den sletter alt om et barn. Alt andet, der skal håndhæves, håndhæves i
reglerne; resten er brugerflade.

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

## Logins oprettes af serveren

En administrator opretter trænere og spillerlogins under Admin, og sletter dem med "Slet".
Appen kalder to kaldbare Cloud Functions i europe-west1, `opretLogin` og `sletLogin`
(`functions/logins.js`). Browseren opretter ingen logins selv.

- **Kun en aktiv administrator.** Serveren læser kalderens `users`-dokument (rolle `admin`,
  `active` ikke `false` - samme regel som `isAdmin()` i `firestore.rules`). Custom claims og
  det, klienten sender, tæller ikke. Alle andre får `permission-denied`.
- **App Check håndhæves** på begge funktioner, som på Firestore og Storage: et kald, der
  ikke kommer fra appens egen side, afvises, før koden kører.
- **Det samme dokument som før.** Serveren skriver `users`-dokumentet, som appen gjorde:
  rolle, `mustChangePassword` (ikke for demo), årgange og køn, `active`, `demo`,
  administratorens lukkede årgange på en ny træner, `createdBy` (kalderens e-mail) og
  serverens tidsstempler. For et spillerlogin læser serveren selv spillerens årgang og køn
  og sætter `hasActiveLogin` (ikke for demo).
- **Intet halvt.** Kan `users`-dokumentet ikke skrives, slettes det nye login igen.
- **Slet sletter helt:** `users`-dokumentet, spillerens `hasActiveLogin` og selve login'et i
  Authentication. Samme e-mail kan bruges igen med det samme. (Slettes et barn med "Slet
  alt", går barnets logins med - se "Slet alt om et barn".)
- Serveren logger kun login-id'er og antal, aldrig e-mails eller navne.

**Selvoprettelsen lukkes for sig.** Før kunne enhver med den offentlige API-nøgle i
`index.html` oprette en konto i projektet, fordi appen oprettede logins fra browseren.
`tests/vaerktoej/luk-selvoprettelse.cjs` lukker for det og beviser det bagefter udefra: en
oprettelse med den offentlige nøgle skal afvises med `ADMIN_ONLY_OPERATION`. Indstillingen
hører til Identity Platform; er projektet ikke opgraderet, stopper værktøjet og ændrer intet.
`tests/vaerktoej/fremmede-konti.cjs` viser (og med `--slet` sletter) de konti, der ikke har
et `users`-dokument.

**Rækkefølgen ved udrulning:** funktionerne først (`udrul-funktioner.cjs`), så appen (push
til `main`), prøv at oprette og slette et login fra appen - og først derefter
`luk-selvoprettelse.cjs` og `fremmede-konti.cjs`. Lukkes der, før appen kalder serveren,
kan ingen oprette logins.

## Slet alt om et barn

"Slet alt" under Spillere (og "Godkend og slet alt" på en sletteanmodning) kalder den
kaldbare funktion `sletSpiller` i europe-west1 (`functions/sletning.js`). Samme valg og samme
administratortjek som `opretLogin`/`sletLogin`: kun en aktiv administrator (læst i kalderens
`users`-dokument på serveren), og App Check håndhæves.

- **Først en opgørelse.** `{playerId, kunOpgoer: true}` læser kun og svarer med navn, årgang,
  antal indsendelser, dueller, videolinks, videofiler og kåringer, barnets logins med e-mail,
  og om note, stige, fodteknik, logge, klub-rangliste, ranglistelinje og sletteanmodning
  findes. Appens bekræftelse bygges af svaret; browseren slår intet op selv.
- **Så sletningen.** `{playerId, navn}`: serveren tjekker igen, at navnet (trimmet) er barnets,
  ellers `failed-precondition`, og intet slettes. Er et af barnets logins kalderens eget,
  afvises kaldet.
- **Alt går med:** videofilerne (de stier, databasen kender, og alt under
  `submissions/{login-id}/` for barnets logins - serveren kan liste mapperne, appen kan ikke),
  `submissionVideos`, `submissions`, dueller som udfordrer og som udfordret, noten, stigen,
  fodteknikken og loggene, `clubRanking`, ranglistelinjen, sletteanmodningen, spilleren,
  `users`-dokumenterne og **selve login'ene i Authentication**. I Månedens spiller og
  Månedens topscorer fjernes kun barnet fra `vindere`, og `rettet` sættes; posten bliver
  stående. Opgørelsen tæller de to slags hver for sig (`kaaringer`, `topscorerKaaringer`). En sti i databasen,
  der ikke ligger under `submissions/`, røres aldrig.
- **Rækkefølgen** gør det sikkert at køre igen: adgangen lukkes først (`users`-dokumenterne
  sættes til `active: false`), så filer og dokumenter, så login'ene i Authentication. Kun hvis
  intet fejlede, slettes `users`-dokumenterne og til sidst spilleren, linjen og anmodningen i
  ét hug, og klubbens top 10 regnes om. Fejler noget, svarer serveren med listen (art og id),
  barnet bliver stående i appen med lukket adgang, og "Slet alt" igen gør resten. Det, der
  allerede er væk, er ikke en fejl.
- **Ranglisten kan ikke komme igen:** sletningerne undervejs udløser ranglistetriggerne, men
  spilleren slettes sidst, sammen med linjen. En trigger, der kører bagefter, finder ingen
  spiller og skriver intet.
- Serveren logger kun id'er og antal - aldrig navne, e-mails eller filnavne.

**Udrulning:** funktionerne først (`udrul-funktioner.cjs`), så appen. Funktionernes konto
skal kunne læse og skrive Firestore, slette brugere i Authentication og liste, læse og
slette filer i bøtten `tif-talent-tracker`.

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

- **Et login uden for klubben kan ingenting.** Logins oprettes af serveren, og
  selvoprettelsen i Firebase Authentication lukkes (se "Logins oprettes af serveren"). Der
  findes alligevel Auth-konti uden `users`-dokument - konti fra før selvoprettelsen blev
  lukket, og logins efter børn, der blev slettet i appen før v15.78 (dengang kunne browseren
  ikke slette selve login'et). Derfor kræver hver regel stadig
  et aktivt `users`-dokument; `signedIn()` alene giver aldrig adgang. `!isPlayerRole()` betyder "ikke en aktiv spiller"
  og er også sand for fremmede og deaktiverede - brug det aldrig uden `isActive()`.
- **En træner rører kun det, der allerede ligger i trænerens egne årgange.** En rettelse
  kræver adgang til både det eksisterende dokument og det nye indhold; ellers kunne en
  træner flette sin egen årgang ind på et andet barns dokument og dermed overtage det.
- **Spillere læser kun deres egne logge** (`footworkLog`, `juggleLog`), hvor joker-
  begrundelser og bruger-id'er står.
- **En spiller henter kun det om andre børn, som ranglisten viser.** Eget spillerdokument,
  egne registreringer, årgangens linjer i `rangliste`, `klubRangliste/top`,
  `maanedensSpiller`, `maanedensTopscorer` og indsendelser og dueller, barnet selv er part i. Ikke andre børns
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
  det, siden skriver, felt for felt med serverens - begge priser, i samme rækkefølge.

## Månedens topscorer

Den anden månedspris, kåret i samme kørsel som Månedens spiller (`maanedensKaaring`, den 5.
kl. 05.00, første gang for november 2026) og med appens egen kode (`maanedTopscorerStat`,
`maanedensTopscorerRangering` i `index.html`, skåret ud af `byg.mjs`).

- **Flest point i måneden** i årgangen, drenge og piger sammen. Alle point tæller, som
  "Denne måned" talte dem: medaljepoint i den måned, træneren godkendte dem (`reviewedAt`),
  stigens trin efter datoen i loggen og fodteknikkens dage med kombi og streak-milepæle.
  Måneden regnes som vinduet fra månedens start minus vinduet fra næste måneds start, med
  appens egne vinduesfunktioner. En dag med en godkendt joker giver 0.
- **Lige point** afgøres af, i rækkefølge: flest øvelser (fodteknik-gennemførelser på dage
  i måneden uden godkendt joker + trin på stigen - hovedstige og dårligt ben - registreret i
  måneden og stadig en del af fremdriften, hvert trin én gang; tricks tæller ikke), flest
  svære (Grundtræning og version 1's jongleringstræning tæller som svær), flest mellem,
  flest lette, flest starter. Stadig lige: prisen deles.
- **Én pris pr. barn:** Månedens spiller for samme måned og årgang kan ikke også være
  topscorer; prisen går til den bedste af resten. Findes Månedens spiller for måneden ikke
  endnu, venter topscoreren. Har ingen andre point, gemmes en post uden vinder. Man må godt
  være topscorer flere måneder i træk.
- `maanedensTopscorer/{maaned}_{aargang}`: `{maaned, aargang, vindere: [{id, navn, point,
  oevelser, svaer, mellem, let, starter}], beregnet}`. Oprettes én gang med `create()`,
  lige efter Månedens spiller for samme måned og årgang; findes den, stopper serveren
  årgangen (begge priser), som for Månedens spiller. Appens `kaarMaanedensSpiller` er også
  her reserven og skriver i samme rækkefølge.
- Serveren henter først alle børns indsendelser, stige og stigelog (og fodteknik), når der
  er noget at kåre.
- **Regler:** som `maanedensSpiller` - alle aktive logins læser; admin eller en træner, der
  ser hele årgangen, opretter én gang, når måneden er afgjort; admin må kun fjerne vindere
  (`vindere` kortere + `rettet`). Forskellen: en topscorer kan ikke slettes, heller ikke af
  admin.
- **Emblemerne:** Månedens spiller er nu en guldpokal (før en medalje), topscoreren en
  sort-hvid bold i fart - tegnet i koden (`maanedensEmblem`, `topscorerEmblem`), og bolden
  bevidst mindre end pokalen i hver størrelse.

**Udrulning:** reglerne først (ellers kan appens reserve ikke oprette topscorer-poster og
lytteren på samlingen afvises), så funktionerne (`udrul-funktioner.cjs`), så appen (v15.80).

## Point gemmes ikke

Point fra Daglig fodteknik og Jongleringsstigen står ingen steder i databasen. Der gemmes
kun registreringerne, og point regnes ud af dem, hver gang de vises. Derfor kan en
rettelse, en sletning eller en bagudregistrering aldrig efterlade et forkert tal et andet
sted - og derfor kan en spiller ikke skrive point til sig selv: der er intet pointfelt at
skrive i. Medaljepoint står på spilleren og kan kun skrives af en træner.

Ranglistens linjer er ikke en undtagelse: de er et udregnet spejl, som kun serveren
skriver, og som kan regnes forfra af registreringerne når som helst
(`tests/vaerktoej/genberegn-rangliste.cjs`).

## Jongleringsstigen: point og trin

Stigens point står ét sted: `JUGGLE_MAIN_POINT` og `JUGGLE_WEAK_POINT` i `index.html`
(`juggleMainPoints`/`juggleWeakPoints`). Fra pointreglerne **2026-11-20**:

- **Hovedstigen**, 16 trin med fire i hver fase: Find kontakten (3, 5, 7, 10) 5 point pr.
  trin, Rytme (15, 20, 30, 40) 10, Kontrol (50, 75, 100, 125) 15 og Udholdenhed
  (150, 200, 250, 300) 20 - i alt 200.
- **Dårligt ben**, 12 trin med tre i hver fase: (2, 3, 5) 5, (7, 10, 15) 10,
  (20, 30, 40) 15 og (50, 75, 100) 20 - i alt 150.
- **Tricks** 10 eller 15 - i alt 75. Hele stigen giver 425.

Før gav et trin lige så mange point som jongleringer (dårligt ben dobbelt). Stigen
registreres på tillid uden video, og et barn tog hele stigen på 36 minutter for 690 point -
mere end uger med fodteknik. Nu er et trin mindre værd end en medalje (25-80) og omtrent en
god dag med fodteknik. Pointene gemmes ikke, så de nye gælder også trin, der er taget før.

**Trinnene er gemt som numre, ikke som antal jongleringer** (`mainStep`/`weakStep` og
`v`/`fra`/`til` i `juggleLog`). Da stigerne fik nye tal, skulle de gemte numre derfor
lægges om: et barn får de nye trin, hvis antal er højst det, barnet havde nået (gammel 100
på hovedstigen → trin 11 = 100; gammel 30 på dårligt ben → trin 8 = 30).
`tests/vaerktoej/omlaeg-stige.cjs` gør det én gang og gemmer originalerne på barnets
`juggleLog` (`stigeFoer`, `entriesFoer`) - ikke på `juggleLadder`, hvor reglerne kun tillader
appens egne felter. `stigeOmlaegning/koersel` markerer, at det er gjort; en ny kørsel rører
så intet.

**Udrulning af ændringen (i denne rækkefølge, uden pause mellem trin 2 og 3):**

1. `firestore.rules`: lofterne for spillerens egen skrivning (`mainStep <= 15`,
   `weakStep <= 10`) skal hæves til 16 og 12 - ellers kan intet barn registrere de nye
   øverste trin. Kør regeltestene, og rul reglerne ud.
2. Funktionerne: `node vaerktoej/udrul-funktioner.cjs` (pointreglerne 2026-11-20).
3. `node vaerktoej/omlaeg-stige.cjs` (tørkørsel), så `node vaerktoej/omlaeg-stige.cjs --udfoer`.
4. Appen (`index.html`, v15.79). Mellem trin 3 og 4 viser den gamle app de omlagte numre
   med de gamle tal, og et barn, der registrerer i det vindue, får et forkert trin.
5. `node vaerktoej/genberegn-rangliste.cjs --udfoer`.

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
| `maanedensTopscorer` | Månedens topscorer pr. måned og årgang: vinder(e) med navn, point, antal øvelser og antal svære, mellem, lette og starter. Oprettes én gang; kun admin kan fjerne en vinder (sletning af et barn); kan ikke slettes | Hele klubben |
| `deletionRequests` | Anmodninger om sletning | Admin og familien selv |
| `stigeOmlaegning` | `koersel`: dato og antal for omlægningen af stigen 2026-11-20 - ingen data om børn | Ingen (kun Admin SDK) |

De samlinger, hele klubben må læse, rummer med vilje hverken bruger-id'er eller andet om
et barn end navn, årgang og de tal, der står på en rangliste eller en kåring.

## Backup

Der er ingen automatisk backup. Under Indstillinger kan en træner eller admin hente en
JSON-fil med alt, vedkommende har adgang til. Links til spillernes indsendte videoer er
udeladt; adresserne på instruktionsvideoerne er med. Der er ingen
gendan-knap; filen er en læsbar kopi.
