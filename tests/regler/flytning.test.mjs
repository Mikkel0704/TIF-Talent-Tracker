// Flytningen af de gamle videolinks, koert mod Firestore-emulatoren med admin-adgang -
// praecis som vaerktoejet koerer mod den rigtige database. Boetten er en stedfortraeder.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8890';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { flytVideoer, rydForaeldreloese } = require('../vaerktoej/flyt-videoer-logik.cjs');

const app = initializeApp({ projectId: 'tif-talent-tracker' }, 'flytning');
const db = getFirestore(app);
const r = []; const t = (n, b, d) => { r.push([n, b]); console.log((b ? 'PASS' : 'FAIL') + ' - ' + n + (d ? ' :: ' + d : '')); };
async function toem(){ for (const c of ['submissions', 'submissionVideos']) for (const d of (await db.collection(c).get()).docs) await d.ref.delete(); }
const sub = (over = {}) => ({ playerId: 'p1', playerName: 'TEST', year: '2017', gender: 'dreng', exercise: 'Finter', stepIndex: 0,
  status: 'pending', challengeId: null, challengerId: null, opponentId: null, submittedAt: '2026-11-10T10:00:00.000Z', ...over });
async function saet(){
  await toem();
  await db.doc('submissions/ventende').set(sub({ videoURL: 'https://x.invalid/a', videoPath: 'submissions/p1/1_a.mp4' }));
  await db.doc('submissions/duel-afgjort').set(sub({ status: 'approved', challengeId: 'c1', challengerId: 'p1', opponentId: 'p2',
    videoURL: 'https://x.invalid/b', videoPath: 'submissions/p1/2_b.mp4', viewedAt: 'set' }));
  await db.doc('submissions/slettet').set(sub({ status: 'approved', videoURL: null, videoPath: 'submissions/p1/3_c.mp4', pointsAwarded: 25 }));
  await db.doc('submissions/ny-form').set(sub({ status: 'pending' }));
  await db.doc('submissionVideos/ny-form').set({ playerId: 'p1', year: '2017', videoURL: 'https://x.invalid/d', videoPath: 'submissions/u1/4_d.mp4', decided: false });
}
const hent = async sti => (await db.doc(sti).get()).data();

console.log('\n--- Tørkørsel ---');
await saet();
let rap = await flytVideoer(db, { udfoer: false, FieldValue });
t('melder to links, der skal flyttes', rap.flyttet.sort().join() === 'duel-afgjort,ventende');
t('og ét sæt tomme felter, der skal ryddes', rap.ryddet.join() === 'slettet');
t('rører ikke indsendelser, der allerede har den nye form', !rap.flyttet.includes('ny-form') && !rap.ryddet.includes('ny-form'));
t('ændrer INTET i databasen', (await hent('submissions/ventende')).videoURL === 'https://x.invalid/a'
  && !(await db.doc('submissionVideos/ventende').get()).exists);

console.log('\n--- Udførelse ---');
rap = await flytVideoer(db, { udfoer: true, FieldValue });
let v = await hent('submissionVideos/ventende');
t('linket ligger nu i submissionVideos', v?.videoURL === 'https://x.invalid/a' && v?.videoPath === 'submissions/p1/1_a.mp4');
t('med de felter, reglerne læser adgang ud fra', v?.playerId === 'p1' && v?.year === '2017' && v?.gender === 'dreng');
t('en ventende video er ikke afgjort', v?.decided === false);
let s = await hent('submissions/ventende');
t('og er væk fra indsendelsen', !('videoURL' in s) && !('videoPath' in s));
t('resten af indsendelsen er urørt', s.status === 'pending' && s.exercise === 'Finter' && s.playerId === 'p1');
v = await hent('submissionVideos/duel-afgjort');
t('en afgjort duel bliver frigivet til modparten, som den var før', v?.decided === true && v?.opponentId === 'p2' && v?.challengerId === 'p1');
t('og husker, at den er set', v?.viewedAt === 'set');
s = await hent('submissions/slettet');
t('en allerede slettet video får bare felterne fjernet', !('videoURL' in s) && !('videoPath' in s) && !(await db.doc('submissionVideos/slettet').get()).exists);
t('og beholder sine point', s.pointsAwarded === 25);
t('den nye form er uændret', (await hent('submissionVideos/ny-form')).videoURL === 'https://x.invalid/d');

console.log('\n--- Kørt en gang til ---');
rap = await flytVideoer(db, { udfoer: true, FieldValue });
t('anden kørsel finder intet at gøre', rap.flyttet.length === 0 && rap.ryddet.length === 0);
t('og ødelægger ingenting', (await hent('submissionVideos/ventende')).videoURL === 'https://x.invalid/a');

console.log('\n--- Forældreløse filer ---');
const nu = Date.parse('2026-11-12T12:00:00Z');
const slettet = [];
const fil = (name, timeCreated) => ({ name, metadata: { timeCreated }, delete: async () => { slettet.push(name); } });
const boette = { getFiles: async () => [[
  fil('submissions/p1/1_a.mp4', '2026-11-10T10:00:00Z'),          // hoerer til "ventende"
  fil('submissions/u1/4_d.mp4', '2026-11-11T10:00:00Z'),          // hoerer til "ny-form"
  fil('submissions/p3/9_foraeldreloes.mp4', '2026-10-20T10:00:00Z'),
  fil('submissions/u9/8_midt-i-upload.mp4', '2026-11-12T11:55:00Z')
]] };
let ryd = await rydForaeldreloese(db, boette, { udfoer: false, nu });
t('tørkørsel udpeger den forældreløse fil', ryd.slettet.join() === 'submissions/p3/9_foraeldreloes.mp4');
t('men sletter den ikke', slettet.length === 0);
ryd = await rydForaeldreloese(db, boette, { udfoer: true, nu });
t('udførelse sletter netop den', slettet.join() === 'submissions/p3/9_foraeldreloes.mp4');
t('filer, der hører til en indsendelse, bliver liggende', ryd.beholdt.length === 2);
t('en fil under et døgn gammel røres ikke - den kan være midt i en upload', ryd.forNye.join() === 'submissions/u9/8_midt-i-upload.mp4');

await toem();
console.log(`\n${r.filter(x => x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x => x[1]) ? 0 : 1);
