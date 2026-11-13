// Skifter instruktionsvideoen paa én plads ud med den sloerede version.
//   node bytt.cjs <plads> <ny-fil.mp4>
// Raekkefoelgen er valgt, saa appen aldrig peger paa en fil, der ikke findes:
//   1. den nye fil laegges op under guides/<plads>/
//   2. originalen KOPIERES til originaler/guides/<plads>/... (ingen regel daekker den mappe,
//      saa ingen i appen kan se eller hente den - kun en noegle)
//   3. henvisningen i clubConfig/guideVideos skiftes til den nye fil
//   4. originalen slettes fra guides/
//   5. alt laeses tilbage
const T = '/home/user/TIF-Talent-Tracker/tests/';
const kr = require('module').createRequire(T + 'package.json');
const { initializeApp, cert } = kr('firebase-admin/app');
const { getFirestore } = kr('firebase-admin/firestore');
const { getStorage, getDownloadURL } = kr('firebase-admin/storage');
const fs = require('fs');
const app = initializeApp({ credential: cert(require(T + 'service-account.json')) });
const [plads, fil] = process.argv.slice(2);
(async () => {
  if (!/^f_[a-z]$/.test(plads) || !fs.existsSync(fil)) throw new Error('brug: bytt.cjs f_x fil.mp4');
  const db = getFirestore(app), bucket = getStorage(app).bucket('tif-talent-tracker');
  const ref = db.collection('clubConfig').doc('guideVideos');
  const gammel = ((await ref.get()).data() || {})[plads];
  if (!gammel || !gammel.sti) throw new Error('ingen video paa ' + plads);
  if (gammel.slort) { console.log(plads, 'er allerede sloeret - springes over'); process.exit(0); }

  const sti = `guides/${plads}/${Date.now()}_slort.mp4`;
  await bucket.upload(fil, { destination: sti, metadata: { contentType: 'video/mp4' } });
  const ny = bucket.file(sti);
  const url = await getDownloadURL(ny);

  const originalSti = 'originaler/' + gammel.sti;
  const [findes] = await bucket.file(originalSti).exists();
  if (!findes) await bucket.file(gammel.sti).copy(bucket.file(originalSti));

  await ref.set({ [plads]: { url, sti, lagt: new Date().toISOString(), slort: true, original: originalSti } }, { merge: true });
  await bucket.file(gammel.sti).delete({ ignoreNotFound: true });

  // Laes tilbage: det er serverens svar, der taeller.
  const nu = ((await ref.get()).data() || {})[plads];
  const [md] = await ny.getMetadata();
  const [origOk] = await bucket.file(originalSti).exists();
  const [gamlOk] = await bucket.file(gammel.sti).exists();
  const ok = nu.sti === sti && nu.url === url && /^https:\/\//.test(url) && Number(md.size) === fs.statSync(fil).size
    && md.contentType === 'video/mp4' && origOk && !gamlOk;
  console.log(`${plads}: ${ok ? 'OK' : 'AFVIGER'} | ny ${sti} (${(md.size / 1048576).toFixed(1)} MB) | original gemt: ${origOk} | gammel fjernet: ${!gamlOk}`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
