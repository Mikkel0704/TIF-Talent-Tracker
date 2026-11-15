// Genberegner hele den serverberegnede rangliste (rangliste/{id} og klubRangliste/top) med
// den samme kode som Cloud Functions - fx foerste gang, efter en udrulning med nye
// pointregler (POINTREGLER), eller hvis en linje er kommet ud af takt.
//
//   node vaerktoej/genberegn-rangliste.cjs            toerkoersel: viser hvad der ville ske
//   node vaerktoej/genberegn-rangliste.cjs --udfoer   goer det, og laeser tilbage
//
// Der skrives ingen navne ud - kun antal og dokument-id'er.
// Kraever tests/service-account.json (se README om noegler) og laver pointkoden forfra
// ud fra index.html (functions/byg.mjs), foer den regner.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { genberegn, resume } = require('./genberegn-rangliste-logik.cjs');

const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const app = initializeApp({ credential: cert(require(noegle)) });
const udfoer = process.argv.includes('--udfoer');

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'functions', 'byg.mjs')], { stdio: 'inherit' });
  console.log(udfoer ? '=== UDFOERER ===' : '=== TOERKOERSEL - intet aendres. Koer med --udfoer for at goere det. ===');
  const db = getFirestore(app);
  const r = await genberegn(db, { udfoer, FieldValue });
  console.log('\n' + resume(r, udfoer));
  if (udfoer) {
    // Laes tilbage: det er serverens svar, der taeller.
    const igen = await genberegn(db, { udfoer: false, FieldValue });
    const rest = igen.oprettes.length + igen.aendres.length + igen.slettes.length;
    console.log(`\nSkrevet: ${r.skrevet} dokumenter. Laest tilbage: ${igen.uaendret} af ${igen.spillere} linjer stemmer · ${rest} afviger · top 10 ${igen.topAendres ? 'AFVIGER' : 'stemmer'}`);
    // Skriver et barn noget lige nu, kan Cloud Functions have aendret en linje imellem - koer igen.
    if (rest || igen.topAendres) process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
