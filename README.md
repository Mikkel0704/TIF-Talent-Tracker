# TIF Talent Tracker

Gratis GitHub Pages webapp til iPhone.

## Brug
Upload `index.html` til et GitHub repository og aktiver GitHub Pages.

## Gamification til spillere (v15.0)

Ud over trænerdelen har appen nu en spillerdel: spillere kan logge ind
selv, se og træne øvelser derhjemme, uploade video af sig selv, optjene
point og rang (avatar-niveau), og udfordre holdkammerater i de enkelte
øvelser. Trænere godkender/afviser hver video manuelt under fanen
"Godkendelser" — der er ingen automatisk AI-bedømmelse i denne version.

**Opsætning i Firebase:**
1. **Storage er aktiveret** på Blaze-planen (pay-as-you-go), med bucket
   `tif-talent-tracker.firebasestorage.app` i US-WEST1 (no-cost region —
   forventet forbrug for en enkelt klub ligger inden for den gratis
   kvote).
2. **Sikkerhedsregler**: `firestore.rules` og `storage.rules` i dette
   repo er deployet til det live projekt. Hvis I ændrer dem her, skal I
   deploye igen manuelt (Firebase console → Firestore Database → Rules
   / Storage → Rules, eller `firebase deploy` med Firebase CLI) — de
   opdateres ikke automatisk bare fordi filerne i repoet ændres.
3. **Videoopbevaring**: når en træner har godkendt eller afvist en
   video, sletter appen automatisk selve videofilen fra Storage —
   point og bestået-status gemmes permanent på spilleren, men
   optagelsen bliver ikke liggende bagefter.
4. **Opret spillerlogin**: som admin, gå til Admin → "Opret
   spillerlogin", vælg en eksisterende spiller, og opret en e-mail +
   midlertidig adgangskode til dem. Spilleren bør selv skifte
   adgangskode under Indstillinger efter første login.
