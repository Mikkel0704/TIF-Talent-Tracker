// Flytter de gamle videolinks og rydder foraeldreloese filer. Koeres ÉN gang, efter at
// de nye regler og den nye app er rullet ud.
//
//   node vaerktoej/flyt-videoer.cjs            toerkoersel: viser hvad der ville ske
//   node vaerktoej/flyt-videoer.cjs --udfoer   goer det
//
// Kraever tests/service-account.json (se README om noegler).
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { flytVideoer, rydForaeldreloese } = require('./flyt-videoer-logik.cjs');

const BOETTE = 'tif-talent-tracker';
const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const app = initializeApp({ credential: cert(require(noegle)) });
const udfoer = process.argv.includes('--udfoer');

(async () => {
  console.log(udfoer ? '=== UDFOERER ===' : '=== TOERKOERSEL - intet aendres. Koer med --udfoer for at goere det. ===');
  const db = getFirestore(app);

  const flyt = await flytVideoer(db, { udfoer, FieldValue });
  console.log(`\nLinks: ${flyt.flyttet.length} flyttes til submissionVideos · ${flyt.ryddet.length} tomme felter ryddes · ${flyt.fandtesAllerede.length} fandtes allerede · ${flyt.sprunget.length} sprunget over`);
  flyt.sprunget.forEach(x => console.log('  sprunget over:', x.id, '-', x.grund));

  try {
    const ryd = await rydForaeldreloese(db, getStorage(app).bucket(BOETTE), { udfoer });
    console.log(`\nFiler under submissions/: ${ryd.iAlt} i alt · ${ryd.beholdt.length} hoerer til en indsendelse · ${ryd.slettet.length} foraeldreloese ${udfoer ? 'slettet' : 'ville blive slettet'} · ${ryd.forNye.length} under et doegn gamle (roeres ikke)`);
    ryd.slettet.forEach(f => console.log('  foraeldreloes:', f));
    ryd.fejl.forEach(x => console.log('  FEJL:', x.fil, '-', x.fejl));
  } catch (e) {
    console.log('\nKunne ikke laese boetten:', e.message);
    console.log('Linkene er behandlet som vist ovenfor. Foraeldreloese filer fjernes under alle omstaendigheder af slettefristen paa boetten.');
  }
  process.exit(0);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
