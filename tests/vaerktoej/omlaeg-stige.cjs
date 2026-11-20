// Omlaegger Jongleringsstigen til de nye stiger (16 trin + 12 trin, pointreglerne 2026-11-20).
// Engangsvaerktoej: se omlaeg-stige-logik.cjs for hvorfor og hvordan.
//
//   node vaerktoej/omlaeg-stige.cjs            toerkoersel: viser hvad der ville ske
//   node vaerktoej/omlaeg-stige.cjs --udfoer   goer det, og laeser tilbage
//
// Raekkefoelgen ved udrulning (README, "Jongleringsstigen faar nye trin"): funktionerne ud ->
// dette vaerktoej (toerkoersel, saa --udfoer) -> appen ud -> genberegn-rangliste.cjs.
// Der skrives ingen navne ud - kun dokument-id'er og tal.
// Kraever tests/service-account.json (se README om noegler).
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { omlaeg, resume, tjekIndex, KOERSEL } = require('./omlaeg-stige-logik.cjs');

const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const indexFejl = tjekIndex(fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8'));
if (indexFejl.length) { console.error('Vaerktoejet passer ikke til index.html:\n  ' + indexFejl.join('\n  ')); process.exit(1); }
const app = initializeApp({ credential: cert(require(noegle)) });
const udfoer = process.argv.includes('--udfoer');

(async () => {
  console.log(udfoer ? '=== UDFOERER ===' : '=== TOERKOERSEL - intet aendres. Koer med --udfoer for at goere det. ===');
  const db = getFirestore(app);
  const r = await omlaeg(db, { udfoer, FieldValue });
  console.log('\n' + resume(r, udfoer));
  if (udfoer && !r.alleredeKoert) {
    // Laes tilbage: det er serverens svar, der taeller.
    let afviger = 0;
    for (const x of r.stigeAendres) {
      const s = (await db.collection('juggleLadder').doc(x.id).get()).data() || {};
      const f = (await db.collection('juggleLog').doc(x.id).get()).get('stigeFoer');
      const godt = (!x.mainStep || s.mainStep === x.mainStep[1]) && (!x.weakStep || s.weakStep === x.weakStep[1])
        && f && (!x.mainStep || f.mainStep === x.mainStep[0]) && (!x.weakStep || f.weakStep === x.weakStep[0]);
      if (!godt) { afviger++; console.log('  AFVIGER: stige ' + x.id); }
    }
    for (const x of r.logAendres) {
      const l = (await db.collection('juggleLog').doc(x.id).get()).data() || {};
      if (!Array.isArray(l.entriesFoer) || l.entriesFoer.length !== x.poster) { afviger++; console.log('  AFVIGER: log ' + x.id); }
    }
    const k = await db.collection(KOERSEL[0]).doc(KOERSEL[1]).get();
    console.log(`\nSkrevet: ${r.skrevet} dokumenter. Laest tilbage: ${r.stigeAendres.length + r.logAendres.length - afviger} af ${r.stigeAendres.length + r.logAendres.length} stemmer · ${KOERSEL.join('/')} ${k.exists ? 'findes' : 'MANGLER'}`);
    if (afviger || !k.exists) process.exit(1);
    console.log('Naeste skridt: rul appen ud, og koer genberegn-rangliste.cjs.');
  }
  process.exit(0);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
