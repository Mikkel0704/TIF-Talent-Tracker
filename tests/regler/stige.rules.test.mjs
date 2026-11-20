// Kører de RIGTIGE firestore.rules mod rigtige forespørgsler i emulatoren.
// Ingen App Check, ingen nøgle, ingen produktion - men ægte regelevaluering.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'tif-talent-tracker',
  firestore: { host: '127.0.0.1', port: 8890, rules: fs.readFileSync(new URL("../../firestore.rules", import.meta.url),'utf8') }
});
// Emulatoren husker data mellem koersler. Uden en rydning ville en skrivning, der
// SKAL afvises, kunne slippe igennem som en ren no-op mod et dokument fra sidste gang.
await env.clearFirestore();

const r = []; const ok = (n,b,d)=>{ r.push([n,b]); console.log((b?'PASS':'FAIL')+' - '+n+(d?' :: '+d:'')); };
const proev = async (n, forvent, fn) => {
  try { forvent==='ALLOW' ? await assertSucceeds(fn()) : await assertFails(fn()); ok(n,true); }
  catch(e){ ok(n,false,(e.message||'').split('\n')[0].slice(0,110)); }
};

const BRUGERE = {
  spiller: {uid:'u-spiller', doc:{email:'a@x.invalid', role:'player', playerId:'p1', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:false}},
  demo:    {uid:'u-demo',    doc:{email:'d@x.invalid', role:'player', playerId:'p9', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:true}},
  gammel:  {uid:'u-gammel',  doc:{email:'g@x.invalid', role:'player', playerId:'p3', years:['2017'], yearGenders:{'2017':'dreng'}}},   // som Rune: intet demo-felt
  traener: {uid:'u-traener', doc:{email:'t@x.invalid', role:'coach',  years:['2017'], yearGenders:{'2017':'begge'}, active:true}},
  fremmed: {uid:'u-fremmed', doc:{email:'f@x.invalid', role:'coach',  years:['2011'], yearGenders:{'2011':'begge'}, active:true}},
};
// Seed brugerdokumenter og en spiller uden om reglerne.
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  for(const b of Object.values(BRUGERE)) await setDoc(doc(db,'users',b.uid), b.doc);
  for(const pid of ['p1','p2','p3','p9']) await setDoc(doc(db,'players',pid), {name:'TEST '+pid, year:'2017', gender:'dreng', points:0});
});
const db = k => env.authenticatedContext(BRUGERE[k].uid).firestore();
const FREM = {mainStep:1, weakStep:0, tricks:[], year:'2017', gender:'dreng', updatedAt:new Date()};

// ---------- fremdrift ----------
await proev('spilleren opretter sin EGEN stige (allerførste registrering)','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), FREM));
await proev('spilleren tager næste trin','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, mainStep:2}, {merge:true}));
await proev('et login UDEN demo-felt (som Rune) kan også registrere','ALLOW',()=>setDoc(doc(db('gammel'),'juggleLadder','p3'), {...FREM}));
await proev('spilleren kan IKKE skrive en andens stige','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p2'), FREM));
await proev('demo-login kan IKKE registrere','DENY',()=>setDoc(doc(db('demo'),'juggleLadder','p9'), FREM));
await proev('træneren kan rette inden for sin årgang','ALLOW',()=>setDoc(doc(db('traener'),'juggleLadder','p1'), {...FREM, mainStep:7}, {merge:true}));
await proev('en træner uden adgang til årgangen kan IKKE rette','DENY',()=>setDoc(doc(db('fremmed'),'juggleLadder','p1'), {...FREM, mainStep:9}, {merge:true}));

// ---------- loftet ----------
await proev('det øverste trin på hovedstigen (16 = 300 jongleringer) kan registreres','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, mainStep:16}, {merge:true}));
await proev('mainStep over 16 afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, mainStep:17}, {merge:true}));
await proev('mainStep langt over afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, mainStep:99}, {merge:true}));
await proev('det øverste trin for dårligt ben (12 = 100 berøringer) kan registreres','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, weakStep:12}, {merge:true}));
await proev('weakStep over 12 afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, weakStep:13}, {merge:true}));
await proev('weakStep langt over afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, weakStep:99}, {merge:true}));
await proev('negativt trin afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, mainStep:-5}, {merge:true}));
await proev('mere end 6 tricks afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, tricks:['a','b','c','d','e','f','g']}, {merge:true}));
await proev('et point-felt kan IKKE smugles med','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, points:99999}, {merge:true}));
await proev('trin som tekst i stedet for tal afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, mainStep:'15'}, {merge:true}));

// ---------- læsning ----------
// Foer kunne alle aktive logins laese og liste fremdriften (klub-top-10 blev regnet i
// hver browser). Nu regner serveren ranglisten: kun barnet selv og aargangens traener.
await proev('en træner fra en anden årgang kan IKKE læse fremdriften','DENY',()=>getDoc(doc(db('fremmed'),'juggleLadder','p1')));
await proev('årgangens træner må læse fremdriften','ALLOW',()=>getDoc(doc(db('traener'),'juggleLadder','p1')));
await proev('spilleren må læse sin egen fremdrift','ALLOW',()=>getDoc(doc(db('spiller'),'juggleLadder','p1')));
await proev('en spiller kan IKKE liste hele fremdriftssamlingen','DENY',()=>getDocs(collection(db('spiller'),'juggleLadder')));
await proev('en spiller kan IKKE læse en holdkammerats fremdrift','DENY',()=>getDoc(doc(db('spiller'),'juggleLadder','p3')));

// ---------- loggen ----------
await proev('spilleren må skrive sin egen log','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLog','p1'), {year:'2017', gender:'dreng', entries:[]}));
await proev('spilleren må læse sin årgangs log','ALLOW',()=>getDoc(doc(db('spiller'),'juggleLog','p1')));
await proev('en fremmed årgang kan IKKE læse loggen','DENY',()=>getDoc(doc(db('fremmed'),'juggleLog','p1')));
await proev('demo-login kan IKKE skrive i loggen','DENY',()=>setDoc(doc(db('demo'),'juggleLog','p9'), {year:'2017', gender:'dreng', entries:[]}));

// ---------- medaljeforløbet skal være urørt ----------
await proev('spilleren kan STADIG ikke skrive på sit spillerdokument','DENY',()=>setDoc(doc(db('spiller'),'players','p1'), {points:9999}, {merge:true}));
await proev('spilleren kan stadig ikke læse en anden årgangs spiller','DENY',()=>getDoc(doc(db('spiller'),'players','px')));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
