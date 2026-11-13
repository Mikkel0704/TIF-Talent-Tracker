const T = '/home/user/TIF-Talent-Tracker/tests/';
const kr = require('module').createRequire(T + 'package.json');
const { initializeApp, cert } = kr('firebase-admin/app');
const { getFirestore } = kr('firebase-admin/firestore');
const { getStorage } = kr('firebase-admin/storage');
const app = initializeApp({ credential: cert(require(T + 'service-account.json')) });
(async () => {
  const d = (await getFirestore(app).collection('clubConfig').doc('guideVideos').get()).data() || {};
  const bucket = getStorage(app).bucket('tif-talent-tracker');
  const [guides] = await bucket.getFiles({ prefix: 'guides/' });
  const [orig] = await bucket.getFiles({ prefix: 'originaler/' });
  const filer = new Set(guides.map(f => f.name)), originaler = new Set(orig.map(f => f.name));
  let fejl = 0;
  for (const k of Object.keys(d).sort()) {
    const v = d[k];
    const ok = v.slort === true && /^https:\/\//.test(v.url) && filer.has(v.sti) && originaler.has(v.original) && /\.mp4$/.test(v.sti);
    if (!ok) fejl++;
    console.log(`${k}: ${ok ? 'ok ' : 'FEJL'} ${v.sti}`);
  }
  const henvist = new Set(Object.values(d).map(v => v.sti));
  const tilovers = guides.map(f => f.name).filter(n => !henvist.has(n));
  console.log(`\npladser: ${Object.keys(d).length} | filer under guides/: ${guides.length} | originaler gemt: ${orig.length} | filer uden henvisning: ${tilovers.length}`);
  tilovers.forEach(n => console.log('  tilovers:', n));
  process.exit(fejl || tilovers.length ? 1 : 0);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
