// Kører de RIGTIGE firestore.rules mod rigtige forespørgsler i emulatoren.
// Her er det fodteknik-modulet - og især det, reglerne IKKE kan se: at et spillerlogin
// ikke må kunne godkende sin egen joker.
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
  catch(e){ ok(n,false,(e.message||'').split('\n')[0].slice(0,120)); }
};

const BRUGERE = {
  spiller: {uid:'u-spiller', doc:{email:'a@x.invalid', role:'player', playerId:'p1', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:false}},
  demo:    {uid:'u-demo',    doc:{email:'d@x.invalid', role:'player', playerId:'p9', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:true}},
  gammel:  {uid:'u-gammel',  doc:{email:'g@x.invalid', role:'player', playerId:'p3', years:['2017'], yearGenders:{'2017':'dreng'}}},  // intet demo-felt
  spaerret:{uid:'u-spaerret',doc:{email:'s@x.invalid', role:'player', playerId:'p4', years:['2017'], yearGenders:{'2017':'dreng'}, active:false}},
  traener: {uid:'u-traener', doc:{email:'t@x.invalid', role:'coach',  years:['2017'], yearGenders:{'2017':'begge'}, active:true}},
  stor1:   {uid:'u-stor1',   doc:{email:'s1@x.invalid', role:'player', playerId:'p5', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:false}},
  stor2:   {uid:'u-stor2',   doc:{email:'s2@x.invalid', role:'player', playerId:'p6', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:false}},
  fremmed: {uid:'u-fremmed', doc:{email:'f@x.invalid', role:'coach',  years:['2011'], yearGenders:{'2011':'begge'}, active:true}},
};
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  for(const b of Object.values(BRUGERE)) await setDoc(doc(db,'users',b.uid), b.doc);
  for(const pid of ['p1','p2','p3','p4','p5','p6','p9']) await setDoc(doc(db,'players',pid), {name:'TEST '+pid, year:'2017', gender:'dreng', points:0});
});
const db = k => env.authenticatedContext(BRUGERE[k].uid).firestore();
const AARG = {year:'2017', gender:'dreng', updatedAt:new Date()};
const DAG = '2026-11-07';

// ---------- familiens registrering ----------
await proev('spilleren opretter sit EGET fodteknik-dokument (allerførste gang)','ALLOW',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...AARG, days:{[DAG]:{t:1}}}));
await proev('spilleren tæller op på en dag','ALLOW',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...AARG, days:{[DAG]:{t:2}}}, {merge:true}));
await proev('et login UDEN demo-felt (som Rune) kan også registrere','ALLOW',
  ()=>setDoc(doc(db('gammel'),'footwork','p3'), {...AARG, days:{[DAG]:{t:1}}}));
await proev('spilleren kan IKKE skrive en andens fodteknik','DENY',
  ()=>setDoc(doc(db('spiller'),'footwork','p2'), {...AARG, days:{[DAG]:{t:1}}}));
await proev('demo-login kan IKKE registrere','DENY',
  ()=>setDoc(doc(db('demo'),'footwork','p9'), {...AARG, days:{[DAG]:{t:1}}}));
await proev('et deaktiveret login kan IKKE registrere','DENY',
  ()=>setDoc(doc(db('spaerret'),'footwork','p4'), {...AARG, days:{[DAG]:{t:1}}}));

// ---------- jokeren: anmodning vs. afgørelse ----------
await proev('spilleren må ANMODE om en joker','ALLOW',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...AARG, jokerRequests:{'2026-11-05':true}}, {merge:true}));
await proev('spilleren kan IKKE godkende sin egen joker','DENY',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...AARG, jokers:{'2026-11-05':'approved'}}, {merge:true}));
await proev('spilleren kan heller ikke AFVISE en joker','DENY',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...AARG, jokers:{'2026-11-05':'rejected'}}, {merge:true}));
await proev('træneren afgør jokeren','ALLOW',
  ()=>setDoc(doc(db('traener'),'footwork','p1'), {...AARG, jokers:{'2026-11-05':'approved'}}, {merge:true}));
await proev('og bagefter kan spilleren STADIG registrere (uden at røre afgørelsen)','ALLOW',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...AARG, days:{[DAG]:{t:3}}}, {merge:true}));
await proev('men spilleren kan ikke ændre trænerens afgørelse bagefter','DENY',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...AARG, jokers:{'2026-11-05':'rejected'}}, {merge:true}));

// ---------- smuglegods ----------
await proev('et point-felt kan IKKE smugles med','DENY',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...AARG, points:99999}, {merge:true}));
await proev('spilleren kan ikke flytte sig til en anden årgang','DENY',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...AARG, year:'2011'}, {merge:true}));
// Loftet paa antal dage. Hvert tilfaelde paa sit eget tomme dokument, saa det er
// stoerrelsen der afgoer udfaldet - ikke hvad en tidligere test efterlod.
const mangeDage = n => Object.fromEntries(Array.from({length:n},(_,i)=>['2020-01-' + String(i).padStart(5,'0'), {t:1}]));
await proev('1500 dage er stadig tilladt (over fire års daglig træning)','ALLOW',
  ()=>setDoc(doc(db('stor1'),'footwork','p5'), {...AARG, days: mangeDage(1500)}));
await proev('mere end 1500 dage afvises','DENY',
  ()=>setDoc(doc(db('stor2'),'footwork','p6'), {...AARG, days: mangeDage(1501)}));

// ---------- trænerens rettelse ----------
await proev('træneren retter inden for sin årgang','ALLOW',
  ()=>setDoc(doc(db('traener'),'footwork','p1'), {...AARG, days:{[DAG]:{t:1}}}, {merge:true}));
await proev('en træner uden adgang til årgangen kan IKKE rette','DENY',
  ()=>setDoc(doc(db('fremmed'),'footwork','p1'), {...AARG, days:{[DAG]:{t:9}}}, {merge:true}));
await proev('en spiller kan IKKE slette dokumentet','DENY',
  ()=>setDoc(doc(db('spiller'),'footwork','p1'), {}, {merge:false}));

// ---------- læsning ----------
await proev('enhver aktiv bruger må læse tallene (klub-top-10)','ALLOW',()=>getDoc(doc(db('fremmed'),'footwork','p1')));
await proev('en spiller må liste hele samlingen','ALLOW',()=>getDocs(collection(db('spiller'),'footwork')));

// ---------- loggen og joker-begrundelsen ----------
await proev('spilleren må skrive sin egen log og begrundelse','ALLOW',
  ()=>setDoc(doc(db('spiller'),'footworkLog','p1'), {...AARG, entries:[], reasons:{'2026-11-05':{tekst:'syg'}}}));
await proev('spilleren må læse sin egen begrundelse','ALLOW',()=>getDoc(doc(db('spiller'),'footworkLog','p1')));
await proev('træneren må læse begrundelsen','ALLOW',()=>getDoc(doc(db('traener'),'footworkLog','p1')));
await proev('en FREMMED årgang kan IKKE læse begrundelsen','DENY',()=>getDoc(doc(db('fremmed'),'footworkLog','p1')));
await proev('en fremmed årgang kan ikke liste begrundelserne','DENY',()=>getDocs(collection(db('fremmed'),'footworkLog')));
await proev('demo-login kan IKKE skrive i loggen','DENY',
  ()=>setDoc(doc(db('demo'),'footworkLog','p9'), {...AARG, entries:[]}));
await proev('spilleren kan ikke skrive i en ANDENS log','DENY',
  ()=>setDoc(doc(db('spiller'),'footworkLog','p2'), {...AARG, entries:[]}));

// ---------- stigens nye datoliste ----------
const FREM = {mainStep:1, weakStep:0, tricks:[], year:'2017', gender:'dreng', updatedAt:new Date()};
await proev('stigen: spilleren må skrive datolisten','ALLOW',
  ()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, days:[DAG]}));
await proev('stigen: mere end 400 datoer afvises','DENY',
  ()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, days:Array.from({length:401},(_,i)=>'d'+i)}, {merge:true}));
await proev('stigen: et point-felt kan stadig ikke smugles med','DENY',
  ()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, points:1}, {merge:true}));
await proev('stigen: fremdriften må stadig læses klub-bredt','ALLOW',()=>getDoc(doc(db('fremmed'),'juggleLadder','p1')));

// ---------- medaljeforløbet skal være urørt ----------
await proev('spilleren kan STADIG ikke skrive på sit spillerdokument','DENY',
  ()=>setDoc(doc(db('spiller'),'players','p1'), {points:9999}, {merge:true}));
await proev('spilleren kan stadig ikke læse en anden årgangs spiller','DENY',()=>getDoc(doc(db('spiller'),'players','px')));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
