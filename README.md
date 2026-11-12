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
| `clubConfig` | Hvilke årgange kører Talentmærket | Hele klubben |
| `deletionRequests` | Anmodninger om sletning | Admin og familien selv |

De samlinger, hele klubben må læse, rummer med vilje hverken navne (bortset fra
ranglisten) eller bruger-id'er.

## Backup

Der er ingen automatisk backup. Under Indstillinger kan en træner eller admin hente en
JSON-fil med alt, vedkommende har adgang til. Videolinks er udeladt. Der er ingen
gendan-knap; filen er en læsbar kopi.
