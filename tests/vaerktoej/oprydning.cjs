// Oprydning efter sikkerhedsgennemgangen: fjerner foraeldre-e-mails fra indsendelserne og
// sletter originalerne af de sloerede instruktionsvideoer.
//
//   node vaerktoej/oprydning.cjs            toerkoersel: viser hvad der ville ske
//   node vaerktoej/oprydning.cjs --udfoer   goer det, og laeser tilbage
//
// Der skrives ingen e-mailadresser ud - kun antal og dokument-id'er.
// Kraever tests/service-account.json (se README om noegler).
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { fjernEmails, sletOriginaler } = require('./oprydning-logik.cjs');

const BOETTE = 'tif-talent-tracker';
const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const app = initializeApp({ credential: cert(require(noegle)) });
const udfoer = process.argv.includes('--udfoer');

(async () => {
  console.log(udfoer ? '=== UDFOERER ===' : '=== TOERKOERSEL - intet aendres. Koer med --udfoer for at goere det. ===');
  const db = getFirestore(app), bucket = getStorage(app).bucket(BOETTE);

  const e = await fjernEmails(db, { udfoer, FieldValue });
  console.log(`\nIndsendelser: ${e.fjernet.length} har en e-mail i submittedBy, som ${udfoer ? 'er fjernet' : 'ville blive fjernet'} · ${e.uden} har ingen`);

  const o = await sletOriginaler(db, bucket, { udfoer, FieldValue });
  console.log(`\nOriginaler af instruktionsvideoer: ${o.slettet.length} ${udfoer ? 'slettet' : 'ville blive slettet'} · ${o.foraeldreloese.length} uden henvisning ${udfoer ? 'slettet' : 'ville blive slettet'} · ${o.beholdt.length} beholdt`);
  o.slettet.forEach(f => console.log('  original:', f));
  o.foraeldreloese.forEach(f => console.log('  uden henvisning:', f));
  o.beholdt.forEach(b => console.log('  BEHOLDT:', b.plads, '-', b.grund));
  o.fejl.forEach(x => console.log('  FEJL:', x.fil, '-', x.fejl));

  if (udfoer) {
    // Laes tilbage: det er serverens svar, der taeller.
    const igen = await fjernEmails(db, { udfoer: false, FieldValue });
    const [rest] = await bucket.getFiles({ prefix: 'originaler/' });
    const data = (await db.collection('clubConfig').doc('guideVideos').get()).data() || {};
    const henv = Object.values(data).filter(v => v && v.original).length;
    const [vist] = await bucket.getFiles({ prefix: 'guides/' });
    console.log(`\nLaest tilbage: indsendelser med e-mail: ${igen.fjernet.length} · filer under originaler/: ${rest.length} · pladser med henvisning til en original: ${henv} · instruktionsvideoer i appen: ${vist.length}`);
    if (igen.fjernet.length || rest.length - o.beholdt.length > 0 || o.fejl.length) process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
