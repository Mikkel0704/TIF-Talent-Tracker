// Oprydningen efter sikkerhedsgennemgangen, koert mod Firestore-emulatoren med admin-adgang -
// praecis som vaerktoejet koerer mod den rigtige database. Boetten er en stedfortraeder.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8890';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { fjernEmails, sletOriginaler } = require('../vaerktoej/oprydning-logik.cjs');

const app = initializeApp({ projectId: 'tif-talent-tracker' }, 'oprydning');
const db = getFirestore(app);
const r = []; const t = (n, b, d) => { r.push([n, b]); console.log((b ? 'PASS' : 'FAIL') + ' - ' + n + (d !== undefined ? ' :: ' + JSON.stringify(d) : '')); };
async function toem(){ for (const c of ['submissions', 'clubConfig']) for (const d of (await db.collection(c).get()).docs) await d.ref.delete(); }
const hent = async sti => (await db.doc(sti).get()).data();
// En boette i hukommelsen med de faa kald, vaerktoejet bruger.
function boette(navne){
  const filer = new Set(navne);
  const fil = navn => ({ name: navn, exists: async () => [filer.has(navn)], delete: async () => { filer.delete(navn); } });
  return { filer, file: fil, getFiles: async ({ prefix }) => [[...filer].filter(n => n.startsWith(prefix)).map(fil)] };
}

console.log('\n--- Forældre-e-mails på indsendelser ---');
await toem();
await db.doc('submissions/med').set({ playerId: 'p1', playerName: 'TEST', year: '2017', status: 'approved', pointsAwarded: 25, submittedBy: 'foraelder@x.invalid', reviewedBy: 't@x.invalid' });
await db.doc('submissions/tom').set({ playerId: 'p1', year: '2017', status: 'pending', submittedBy: '' });
await db.doc('submissions/uden').set({ playerId: 'p2', year: '2017', status: 'pending' });
let e = await fjernEmails(db, { udfoer: false, FieldValue });
t('tørkørslen melder de to med feltet og den ene uden', e.fjernet.sort().join() === 'med,tom' && e.uden === 1, e);
t('og ændrer ingenting', (await hent('submissions/med')).submittedBy === 'foraelder@x.invalid');
e = await fjernEmails(db, { udfoer: true, FieldValue });
const med = await hent('submissions/med');
t('feltet er væk', !('submittedBy' in med) && !('submittedBy' in await hent('submissions/tom')));
t('og alt andet på indsendelsen er urørt', med.playerName === 'TEST' && med.status === 'approved' && med.pointsAwarded === 25 && med.reviewedBy === 't@x.invalid', med);
e = await fjernEmails(db, { udfoer: true, FieldValue });
t('en ny kørsel finder intet at gøre', e.fjernet.length === 0 && e.uden === 3, e);

console.log('\n--- Originaler af instruktionsvideoer ---');
const saet = async () => { await db.doc('clubConfig/guideVideos').set({
  f_t: { url: 'https://x.invalid/t', sti: 'guides/f_t/2_slort.mp4', slort: true, original: 'originaler/guides/f_t/1_IMG.mov', lagt: 'x' },
  f_s: { url: 'https://x.invalid/s', sti: 'guides/f_s/2_slort.mp4', slort: true, original: 'originaler/guides/f_s/1_IMG.mov' },
  f_e: { url: 'https://x.invalid/e', sti: 'guides/f_e/9_ny.mp4' } });           // lagt op senere, aldrig sløret
  await db.doc('clubConfig/modules').set({ talentmaerke: { '2014': false } }); };
const nyBoette = () => boette(['guides/f_t/2_slort.mp4', 'guides/f_e/9_ny.mp4',                          // f_s' slørede fil MANGLER
  'originaler/guides/f_t/1_IMG.mov', 'originaler/guides/f_s/1_IMG.mov', 'originaler/guides/f_q/0_gammel.mov',
  'submissions/u1/1_klip.mp4']);
await saet(); let b = nyBoette();
let o = await sletOriginaler(db, b, { udfoer: false, FieldValue });
t('tørkørslen: én original slettes, én beholdes, én fil uden henvisning slettes',
  o.slettet.join() === 'originaler/guides/f_t/1_IMG.mov' && o.beholdt.map(x => x.plads).join() === 'f_s' && o.foraeldreloese.join() === 'originaler/guides/f_q/0_gammel.mov', o);
t('og ændrer ingenting', b.filer.size === 6 && (await hent('clubConfig/guideVideos')).f_t.original === 'originaler/guides/f_t/1_IMG.mov');
o = await sletOriginaler(db, b, { udfoer: true, FieldValue });
const gv = await hent('clubConfig/guideVideos');
t('originalen er slettet, og henvisningen til den er fjernet', !b.filer.has('originaler/guides/f_t/1_IMG.mov') && !('original' in gv.f_t));
t('videoen, appen viser, er urørt - fil, adresse og dato', b.filer.has('guides/f_t/2_slort.mp4') && gv.f_t.url === 'https://x.invalid/t' && gv.f_t.sti === 'guides/f_t/2_slort.mp4' && gv.f_t.lagt === 'x' && gv.f_t.slort === true, gv.f_t);
t('en original beholdes, når den slørede fil ikke findes', b.filer.has('originaler/guides/f_s/1_IMG.mov') && gv.f_s.original === 'originaler/guides/f_s/1_IMG.mov');
t('en original uden henvisning slettes', !b.filer.has('originaler/guides/f_q/0_gammel.mov'));
t('en video uden original røres ikke', gv.f_e.sti === 'guides/f_e/9_ny.mp4' && b.filer.has('guides/f_e/9_ny.mp4'));
t('indsendte videoer og andre indstillinger røres ikke', b.filer.has('submissions/u1/1_klip.mp4') && (await hent('clubConfig/modules')).talentmaerke['2014'] === false);
t('ingen fejl undervejs', o.fejl.length === 0, o.fejl);
o = await sletOriginaler(db, b, { udfoer: true, FieldValue });
t('en ny kørsel sletter ikke mere', o.slettet.length === 0 && o.foraeldreloese.length === 0 && o.beholdt.length === 1, o);

await toem();
console.log(`\n${r.filter(x => x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x => x[1]) ? 0 : 1);
