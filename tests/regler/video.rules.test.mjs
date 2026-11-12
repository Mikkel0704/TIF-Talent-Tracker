// Videolinket ligger ikke laengere paa indsendelsen. Testene sender det, appen sender:
// samme felter, samme merge-skrivninger og - vigtigst - samme FORESPOERGSLER, for en
// lytter, reglerne ikke kan bevise er lovlig, bliver afvist som helhed.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'tif-talent-tracker',
  firestore: { host: '127.0.0.1', port: 8890, rules: fs.readFileSync(new URL("../../firestore.rules", import.meta.url), 'utf8') }
});
await env.clearFirestore();
const r = []; const ok = (n,b,d)=>{ r.push([n,b]); console.log((b?'PASS':'FAIL')+' - '+n+(d?' :: '+d:'')); };
const proev = async (n, forvent, fn) => {
  try { forvent==='ALLOW' ? await assertSucceeds(fn()) : await assertFails(fn()); ok(n,true); }
  catch(e){ ok(n,false,(e.message||'').split('\n')[0].slice(0,120)); }
};

const B = {
  ejer:     {uid:'u-ejer',     doc:{email:'e@x.invalid', role:'player', playerId:'p-ejer', years:['2017'], active:true, demo:false}},
  modpart:  {uid:'u-modpart',  doc:{email:'m@x.invalid', role:'player', playerId:'p-modpart', years:['2017'], active:true}},        // intet demo-felt
  kammerat: {uid:'u-kammerat', doc:{email:'k@x.invalid', role:'player', playerId:'p-kammerat', years:['2017'], active:true, demo:false}},
  demo:     {uid:'u-demo',     doc:{email:'d@x.invalid', role:'player', playerId:'p-demo', years:['2017'], active:true, demo:true}},
  traener:  {uid:'u-traener',  doc:{email:'t@x.invalid', role:'coach', years:['2017'], active:true}},
  fremmed:  {uid:'u-fremmed',  doc:{email:'f@x.invalid', role:'coach', years:['2011'], active:true}},
  admin:    {uid:'u-admin',    doc:{email:'a@x.invalid', role:'admin', years:['2017'], active:true}},
};
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  for(const b of Object.values(B)) await setDoc(doc(db,'users',b.uid), b.doc);
});
const db = k => env.authenticatedContext(B[k].uid).firestore();
// Praecis det, uploadSubmission() skriver.
const video = (over={}) => ({ playerId:'p-ejer', year:'2017', gender:'dreng',
  videoURL:'https://eksempel.invalid/link', videoPath:'submissions/u-ejer/1_x.mp4',
  challengeId:null, challengerId:null, opponentId:null, decided:false,
  submittedAt:new Date().toISOString(), createdAt:serverTimestamp(), ...over });
const duel = { challengeId:'c1', challengerId:'p-ejer', opponentId:'p-modpart' };
const V = 'submissionVideos';

console.log('\n--- Oprettelse ---');
await proev('barnet opretter linket til sin egen træningsvideo','ALLOW', ()=>setDoc(doc(db('ejer'),V,'s-traening'), video()));
await proev('og til sin duel-video','ALLOW', ()=>setDoc(doc(db('ejer'),V,'s-duel'), video(duel)));
await proev('et login uden demo-felt kan også','ALLOW', ()=>setDoc(doc(db('modpart'),V,'s-modpart'),
  video({playerId:'p-modpart', videoPath:'submissions/u-modpart/1_y.mp4', ...duel})));
await proev('man kan ikke oprette et link i en andens navn','DENY', ()=>setDoc(doc(db('kammerat'),V,'s-falsk'), video()));
await proev('man kan ikke oprette det som allerede afgjort','DENY', ()=>setDoc(doc(db('kammerat'),V,'s-snyd'),
  video({playerId:'p-kammerat', decided:true})));
await proev('ekstra felter kan ikke smugles med','DENY', ()=>setDoc(doc(db('kammerat'),V,'s-ekstra'),
  video({playerId:'p-kammerat', points:999})));
await proev('demo-loginnet kan ikke oprette','DENY', ()=>setDoc(doc(db('demo'),V,'s-demo'), video({playerId:'p-demo'})));

console.log('\n--- Hvem kan hente linket til en TRÆNINGSVIDEO ---');
await proev('træneren i årgangen','ALLOW', ()=>getDoc(doc(db('traener'),V,'s-traening')));
await proev('barnet selv','ALLOW', ()=>getDoc(doc(db('ejer'),V,'s-traening')));
await proev('en holdkammerat i SAMME årgang kan ikke','DENY', ()=>getDoc(doc(db('kammerat'),V,'s-traening')));
await proev('demo-loginnet i samme årgang kan ikke','DENY', ()=>getDoc(doc(db('demo'),V,'s-traening')));
await proev('en træner fra en anden årgang kan ikke','DENY', ()=>getDoc(doc(db('fremmed'),V,'s-traening')));

console.log('\n--- Lytterne, som appen stiller dem ---');
await proev('træner: alle links i årgangen','ALLOW', ()=>getDocs(query(collection(db('traener'),V), where('year','==','2017'))));
await proev('admin: hele samlingen','ALLOW', ()=>getDocs(collection(db('admin'),V)));
await proev('spiller: egne links','ALLOW', ()=>getDocs(query(collection(db('ejer'),V), where('playerId','==','p-ejer'))));
await proev('spiller: afgjorte dueller, hvor man er udfordret','ALLOW',
  ()=>getDocs(query(collection(db('modpart'),V), where('opponentId','==','p-modpart'), where('decided','==',true))));
await proev('spiller: afgjorte dueller, man selv har udfordret til','ALLOW',
  ()=>getDocs(query(collection(db('ejer'),V), where('challengerId','==','p-ejer'), where('decided','==',true))));
await proev('en spiller kan IKKE liste hele årgangens links','DENY', ()=>getDocs(query(collection(db('kammerat'),V), where('year','==','2017'))));
await proev('og ikke hele samlingen','DENY', ()=>getDocs(collection(db('kammerat'),V)));
await proev('og ikke en andens links','DENY', ()=>getDocs(query(collection(db('kammerat'),V), where('playerId','==','p-ejer'))));
await proev('og ikke uafgjorte dueller, selv som part','DENY',
  ()=>getDocs(query(collection(db('modpart'),V), where('opponentId','==','p-modpart'))));

console.log('\n--- Duel: modparten først efter afgørelsen ---');
await proev('før afgørelsen kan modparten ikke hente linket','DENY', ()=>getDoc(doc(db('modpart'),V,'s-duel')));
await proev('modparten kan ikke selv sætte den som afgjort','DENY', ()=>setDoc(doc(db('modpart'),V,'s-duel'), {decided:true}, {merge:true}));
await proev('barnet kan heller ikke selv afgøre sin egen','DENY', ()=>setDoc(doc(db('ejer'),V,'s-duel'), {decided:true}, {merge:true}));
await proev('træneren afgør','ALLOW', ()=>setDoc(doc(db('traener'),V,'s-duel'), {decided:true}, {merge:true}));
await proev('nu kan modparten hente linket','ALLOW', ()=>getDoc(doc(db('modpart'),V,'s-duel')));
await proev('en tredje spiller kan stadig ikke','DENY', ()=>getDoc(doc(db('kammerat'),V,'s-duel')));
await proev('modparten markerer videoen som set','ALLOW', ()=>setDoc(doc(db('modpart'),V,'s-duel'), {viewedAt:serverTimestamp()}, {merge:true}));
await proev('modparten kan ikke bytte linket ud med et andet','DENY',
  ()=>setDoc(doc(db('modpart'),V,'s-duel'), {videoURL:'https://ondt.invalid/x'}, {merge:true}));
await proev('modparten kan ikke flytte stien','DENY', ()=>setDoc(doc(db('modpart'),V,'s-duel'), {videoPath:'submissions/andet'}, {merge:true}));
await proev('modparten fjerner linket, når videoen er set','ALLOW',
  ()=>setDoc(doc(db('modpart'),V,'s-duel'), {videoURL:null, videoDeletedAt:serverTimestamp()}, {merge:true}));

console.log('\n--- Oprydning ---');
await proev('barnet fjerner sit eget udløbne link','ALLOW',
  ()=>setDoc(doc(db('ejer'),V,'s-traening'), {videoURL:null, videoDeletedAt:serverTimestamp()}, {merge:true}));
await proev('barnet kan ikke sætte et nyt link bagefter','DENY',
  ()=>setDoc(doc(db('ejer'),V,'s-traening'), {videoURL:'https://nyt.invalid/x'}, {merge:true}));
await proev('træneren kan ikke flytte et link til en anden spiller','DENY',
  ()=>setDoc(doc(db('traener'),V,'s-traening'), {playerId:'p-kammerat'}, {merge:true}));
await proev('en spiller kan ikke slette dokumentet','DENY', ()=>deleteDoc(doc(db('ejer'),V,'s-traening')));
await proev('en fremmed træner kan ikke slette det','DENY', ()=>deleteDoc(doc(db('fremmed'),V,'s-traening')));
await proev('træneren sletter det efter behandling','ALLOW', ()=>deleteDoc(doc(db('traener'),V,'s-traening')));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
