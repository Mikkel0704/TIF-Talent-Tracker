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

**Opsætning i Firebase, før funktionen virker:**
1. **Storage skal være aktiveret** for projektet (Firebase console →
   Build → Storage → Kom i gang). Video-upload kræver typisk at
   projektet er på Blaze-planen (pay-as-you-go), men forventet forbrug
   for en enkelt klub ligger normalt inden for den gratis kvote.
2. **Sikkerhedsregler**: `firestore.rules` og `storage.rules` i dette
   repo er en *reference*, ikke noget der bliver deployet automatisk —
   de skal indsættes manuelt i Firebase console (Firestore Database →
   Rules, og Storage → Rules), eller deployes med `firebase deploy`
   hvis I bruger Firebase CLI lokalt. De nuværende, aktive regler er
   ikke en del af dette repo, så sammenlign og test i "Rules
   Playground" før I går i produktion.
3. **Opret spillerlogin**: som admin, gå til Admin → "Opret
   spillerlogin", vælg en eksisterende spiller, og opret en e-mail +
   midlertidig adgangskode til dem. Spilleren bør selv skifte
   adgangskode under Indstillinger efter første login.
