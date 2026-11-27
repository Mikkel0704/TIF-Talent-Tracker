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
// Alle trick-id'er, som de staar i index.html - saa testen foelger listen, hvis den vokser.
const TRICK_IDER = [...(/\nconst JUGGLE_TRICKS = \[([\s\S]*?)\n\];/.exec(fs.readFileSync(new URL("../../index.html", import.meta.url),'utf8'))?.[1] || "").matchAll(/id:"([^"]+)"/g)].map(m=>m[1]);
if(TRICK_IDER.length !== 14) throw new Error("ventede 14 tricks i index.html, fandt " + TRICK_IDER.length);
// Den fulde liste fra pointreglerne 2026-11-23 (16 id'er, fire af dem udgaaet 2026-11-28). Den
// kan staa gemt hos et barn - loftet paa 16 er uaendret, saa den skal stadig kunne staa der.
const GAMLE_IDER = ["oploft","vrist","skiftefod","inderside5","yderside5","laarfod","hoved","gribfod","inderside10","yderside10","haelbagom3","jordenrundt","hoved10","inderside20","yderside20","haelbagom5"];
const SYTTEN = Array.from({length:17}, (_, i)=>'t' + i);
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
await proev('alle 14 tricks kan gemmes','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, tricks:TRICK_IDER}, {merge:true}));
await proev('en gammel fuld liste med 16 id\'er (2026-11-23) går stadig igennem - loftet er uændret','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, tricks:GAMLE_IDER}, {merge:true}));
await proev('og appens næste skrivning (kun de 14 nye id\'er) erstatter den','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {tricks:TRICK_IDER, year:'2017', gender:'dreng', updatedAt:new Date()}, {merge:true}));
await proev('et 7. trick kan gemmes (loftet var 6 før 2026-11-23)','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, tricks:TRICK_IDER.slice(0,7)}, {merge:true}));
await proev('alle 14 igen, nu med kun de felter appen sender ved et trick','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {tricks:TRICK_IDER, year:'2017', gender:'dreng', updatedAt:new Date()}, {merge:true}));
ok('og de 14 tricks står der bagefter', JSON.stringify((await getDoc(doc(db('spiller'),'juggleLadder','p1'))).data()?.tricks) === JSON.stringify(TRICK_IDER));
await proev('16 tricks er stadig loftet','ALLOW',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, tricks:SYTTEN.slice(0,16)}, {merge:true}));
await proev('mere end 16 tricks afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, tricks:SYTTEN}, {merge:true}));
await proev('den gamle liste + de to nye id\'er (18) afvises - derfor skriver appen kun de nye','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, tricks:[...GAMLE_IDER, 'inderside3', 'yderside3']}, {merge:true}));
await proev('28 tricks (alle to gange) afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, tricks:[...TRICK_IDER, ...TRICK_IDER]}, {merge:true}));
await proev('tricks som tekst afvises','DENY',()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...FREM, tricks:'inderside5'}, {merge:true}));
await proev('træneren kan give alle 14 tricks','ALLOW',()=>setDoc(doc(db('traener'),'juggleLadder','p1'), {...FREM, tricks:TRICK_IDER}, {merge:true}));
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
