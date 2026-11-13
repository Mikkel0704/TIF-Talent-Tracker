// Henter ÉN instruktionsvideo (plads som argument) til en given mappe. Laeser kun.
const path = require('path');
const T = '/home/user/TIF-Talent-Tracker/tests/';
const kr = require('module').createRequire(T + 'package.json');
const { initializeApp, cert } = kr('firebase-admin/app');
const { getFirestore } = kr('firebase-admin/firestore');
const { getStorage } = kr('firebase-admin/storage');
const app = initializeApp({ credential: cert(require(T + 'service-account.json')) });
const [plads, mappe] = process.argv.slice(2);
(async () => {
  const d = (await getFirestore(app).collection('clubConfig').doc('guideVideos').get()).data() || {};
  console.log('pladser med video:', Object.keys(d).sort().join(' '));
  const v = d[plads];
  if (!v) { console.log('ingen video paa', plads); process.exit(1); }
  const mal = path.join(mappe, plads + path.extname(v.sti || '.mp4'));
  await getStorage(app).bucket('tif-talent-tracker').file(v.sti).download({ destination: mal });
  console.log('hentet', v.sti, '->', mal, '| lagt', v.lagt);
  process.exit(0);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
