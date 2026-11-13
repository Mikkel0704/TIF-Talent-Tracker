# Sløring af instruktionsvideoer

Slører baggrund og omgivelser, så spiller og bold står skarpt, fjerner lyden og lægger
videoen op i stedet for den gamle. Brugt første gang på de 12 fodteknik-videoer.

Alt kører lokalt. Videoerne sendes ikke til nogen tjeneste - kun til klubbens eget lager.

## Sådan

```sh
cd tests/vaerktoej/sloer
python3 -m venv venv && ./venv/bin/pip install mediapipe==0.10.14 opencv-python-headless numpy
# frisk service-nøgle i tests/service-account.json
mkdir -p original ud stills
node hent.cjs f_t original       # henter videoen på pladsen (f_ + øvelsens kode)
./ark.sh f_t                     # stills/ark_f_t.png: spiller rød, bold grøn - SE PÅ DET
./en.sh f_t                      # renderer, kontrollerer og lægger op
node tjek.cjs                    # læser alle pladser tilbage
```

Slet nøglen og mapperne `original`, `ud` og `stills` bagefter - der er børn i videoerne.

## Hvordan

- **Spilleren** findes med MediaPipes personmodel i hvert billede.
- **Bolden** findes som det, der afviger fra gulvets farve i den nederste del af billedet,
  og hele dens cirkel holdes skarp. Mister den bolden et øjeblik, beholdes den sidste
  cirkel i op til 10 billeder.
- Masken må ikke hoppe fra billede til billede, så den falder langsomt ud.

## Når arket ser forkert ud

Sættes som miljøvariabel foran `ark.sh`/`en.sh`:

| Variabel | Bruges når | Brugt på |
|---|---|---|
| `HELE=1` | bolden er oppe i luften: søg i hele billedet, udeluk personen, kort hukommelse | Jongleringstræning |
| `GRAENSE=0.5` | kameraet står højt, så gulvet begynder højere oppe (standard 0.62) | Croqueta |
| `EN=1` | personmodellen tager en ting på gulvet for en del af personen | Square |
| `SPRING=1` | (kun `en.sh`) videoen er allerede renderet - kontrollér og læg op | |

Boldfinderen er lavet til en flerfarvet bold på et træ-/lyst gulv. En ensfarvet hvid bold
eller et stærkt farvet gulv kræver, at den laves om.

## Upload

`bytt.cjs` lægger den nye fil op, **kopierer** originalen til `originaler/` (ingen regel
dækker den mappe, så ingen i appen kan se den), skifter henvisningen i
`clubConfig/guideVideos` og sletter først derefter den gamle fil. Den springer en plads
over, der allerede er sløret (`slort: true`). Originalen står i feltet `original`.
