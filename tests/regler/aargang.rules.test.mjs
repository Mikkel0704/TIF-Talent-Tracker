// En træner skriver kun om børn i sine egne årgange - også når træneren selv bestemmer,
// hvilken årgang der står i det, der skrives. Fundet i gennemgangen før v15.81:
//  - en træner med kun 2017 kunne flytte en 2017-indsendelse over på et 2012-barn med 999
//    point (submissions: kun det EKSISTERENDE dokument blev tjekket, ikke det nye indhold,
//    og playerId kunne skiftes ud)
//  - en træner med kun 2017 kunne oprette juggleLadder/{et 2012-barn} med year 2017 og give
//    barnet trin og point på ranglisten (stige, log, fodteknik og note tjekkede kun den
//    årgang, træneren selv skrev - ikke barnet i stien)
// Skrivningerne har samme form som index.html. Spillerens egne skrivninger og admin er
// uændrede.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp, deleteField } from 'firebase/firestore';
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
  admin:   {uid:'u-admin',  doc:{email:'a@x.invalid', role:'admin', years:['2017'], active:true}},
  t2017:   {uid:'u-t2017',  doc:{email:'t@x.invalid', role:'coach', years:['2017'], active:true}},
  drenge:  {uid:'u-drenge', doc:{email:'d@x.invalid', role:'coach', years:['2017'], yearGenders:{'2017':'dreng'}, active:true}},
  t2012:   {uid:'u-t2012',  doc:{email:'u@x.invalid', role:'coach', years:['2012'], active:true}},
  spillerA:{uid:'u-a',      doc:{email:'s@x.invalid', role:'player', playerId:'kidA', years:['2017'], yearGenders:{'2017':'dreng'}, active:true}},
};
const A = {year:'2017', gender:'dreng'}, PIGE = {year:'2017', gender:'pige'}, B12 = {year:'2012', gender:'pige'};
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  for(const b of Object.values(B)) await setDoc(doc(db,'users',b.uid), b.doc);
  await setDoc(doc(db,'players','kidA'), {name:'Kid A', ...A, points:25, passed:{}});
  await setDoc(doc(db,'players','kidP'), {name:'Kid Pige', ...PIGE, points:0, passed:{}});
  await setDoc(doc(db,'players','kidB'), {name:'Kid B', ...B12, points:0, passed:{}});
  await setDoc(doc(db,'submissions','s1'), {playerId:'kidA', playerName:'Kid A', ...A, exercise:'Jonglering', stepIndex:0, level:1, medal:'Bronze',
    status:'pending', challengeId:null, challengerId:null, opponentId:null, submittedAt:new Date().toISOString()});
  // Et dokument, der allerede er "parkeret" i 2017, men hører til 2012-barnet.
  await setDoc(doc(db,'juggleLadder','kidB'), {...B12, year:'2017', mainStep:1});
  for(const s of ['juggleLadder','juggleLog','footwork','footworkLog','playerNotes']) await setDoc(doc(db, s, 'kidA-gammel'), {...A});
});
const db = k => env.authenticatedContext(B[k].uid).firestore();
const ts = () => serverTimestamp();

console.log('\n--- Indsendelser: det nye indhold og barnet ---');
await proev('træner 2017: godkender en indsendelse i 2017 (som reviewSubmission)', 'ALLOW',
  ()=>setDoc(doc(db('t2017'),'submissions','s1'), {status:'approved', reviewedBy:'t@x.invalid', reviewedAt:ts(), pointsAwarded:25}, {merge:true}));
await proev('træner 2017: kan ikke flytte indsendelsen til et 2012-barn med 999 point', 'DENY',
  ()=>setDoc(doc(db('t2017'),'submissions','s1'), {playerId:'kidB', ...B12, pointsAwarded:999}, {merge:true}));
await proev('træner 2017: kan ikke skifte barnet ud, heller ikke inden for 2017', 'DENY',
  ()=>setDoc(doc(db('t2017'),'submissions','s1'), {playerId:'kidP', pointsAwarded:999}, {merge:true}));
await proev('træner 2017: kan ikke flytte indsendelsen til 2012 (samme barn)', 'DENY',
  ()=>setDoc(doc(db('t2017'),'submissions','s1'), {year:'2012'}, {merge:true}));
await proev('drengetræner: kan ikke gøre en drengs indsendelse til en piges', 'DENY',
  ()=>setDoc(doc(db('drenge'),'submissions','s1'), {gender:'pige'}, {merge:true}));
await proev('træner 2012: kan ikke røre en 2017-indsendelse', 'DENY',
  ()=>setDoc(doc(db('t2012'),'submissions','s1'), {year:'2012', pointsAwarded:999}, {merge:true}));
await proev('admin: kan stadig rette en indsendelse', 'ALLOW', ()=>setDoc(doc(db('admin'),'submissions','s1'), {pointsAwarded:30}, {merge:true}));

console.log('\n--- Stige, logge, fodteknik og note: barnet i stien skal være i trænerens årgang ---');
const D = '2026-11-07';
const skriv = {
  juggleLadder: (k, id, aar) => setDoc(doc(db(k),'juggleLadder',id), {...aar, updatedAt:ts(), mainStep:16}, {merge:true}),
  juggleLog:    (k, id, aar) => setDoc(doc(db(k),'juggleLog',id), {...aar, updatedAt:ts(), entries:[{t:'correct', stige:'main', fra:0, til:16, at:new Date().toISOString(), by:'u', af:'t@x.invalid'}]}, {merge:true}),
  footwork:     (k, id, aar) => setDoc(doc(db(k),'footwork',id), {...aar, updatedAt:ts(), days:{[D]:{t:10}}}, {merge:true}),
  footworkLog:  (k, id, aar) => setDoc(doc(db(k),'footworkLog',id), {...aar, updatedAt:ts(), entries:[]}, {merge:true}),
  playerNotes:  (k, id, aar) => setDoc(doc(db(k),'playerNotes',id), {note:'x', ...aar, updatedAt:ts(), updatedBy:'t@x.invalid'}),
};
for(const [s, f] of Object.entries(skriv)){
  if(s !== 'juggleLadder') await proev(`træner 2017: kan ikke oprette ${s}/kidB (2012) med year 2017`, 'DENY', ()=>f('t2017', 'kidB', A));
  await proev(`træner 2017: opretter ${s}/kidA (2017) som før`, 'ALLOW', ()=>f('t2017', 'kidA', A));
  await proev(`træner 2017: retter ${s}/kidA som før`, 'ALLOW', ()=>f('t2017', 'kidA', A));
  await proev(`træner 2017: kan ikke oprette ${s} for et barn, der ikke findes`, 'DENY', ()=>f('t2017', 'findes-ikke', A));
  await proev(`drengetræner: kan ikke skrive ${s} for en pige i 2017 ved at skrive "dreng"`, 'DENY', ()=>f('drenge', 'kidP', A));
  await proev(`drengetræner: skriver ${s} for en dreng`, 'ALLOW', ()=>f('drenge', 'kidA', A));
  await proev(`træner 2012: kan ikke skrive ${s}/kidA ved at skrive 2017 - heller ikke 2012`, 'DENY', ()=>f('t2012', 'kidA', B12));
  await proev(`admin: opretter ${s}/kidB som før`, 'ALLOW', ()=>f('admin', 'kidB', B12));
  await proev(`admin: kan stadig skrive ${s} for et barn uden spillerdokument`, 'ALLOW', ()=>f('admin', 'kidA-gammel', A));
}
await proev('træner 2017: kan ikke rette juggleLadder/kidB, selv om dokumentet står i 2017', 'DENY', ()=>skriv.juggleLadder('t2017', 'kidB', A));
await proev('træner 2017: kan heller ikke overskrive juggleLadder/kidB (2012) helt med year 2017', 'DENY',
  ()=>setDoc(doc(db('t2017'),'juggleLadder','kidB'), {...A, updatedAt:ts(), mainStep:16}));
await proev('træner 2017: rydder en joker-begrundelse for sit eget barn (som sweepFootworkJokerReasons)', 'ALLOW',
  ()=>setDoc(doc(db('t2017'),'footworkLog','kidA'), {reasons:{[D]:{tekst:deleteField()}}, updatedAt:ts()}, {merge:true}));

console.log('\n--- Spillerens egne skrivninger er uændrede ---');
await proev('spilleren registrerer et trin på sin egen stige', 'ALLOW', ()=>setDoc(doc(db('spillerA'),'juggleLadder','kidA'), {...A, updatedAt:ts(), mainStep:2, days:[D]}, {merge:true}));
await proev('og skriver sin egen log', 'ALLOW', ()=>setDoc(doc(db('spillerA'),'juggleLog','kidA'), {...A, updatedAt:ts(), entries:[]}, {merge:true}));
await proev('og sin egen fodteknik', 'ALLOW', ()=>setDoc(doc(db('spillerA'),'footwork','kidA'), {...A, updatedAt:ts(), days:{[D]:{t:1}}}, {merge:true}));
await proev('spilleren kan stadig ikke skrive et andet barns stige', 'DENY', ()=>setDoc(doc(db('spillerA'),'juggleLadder','kidP'), {...A, updatedAt:ts(), mainStep:2}, {merge:true}));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
