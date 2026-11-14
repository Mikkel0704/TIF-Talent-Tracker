// Månedens spiller: posten må kun OPRETTES - aldrig ændres - af admin eller en træner, der
// ser hele årgangen, og først når måneden er afgjort. Emulatorens ur er det rigtige ur,
// så "afgjort" testes med en måned langt tilbage (2025-01) og én langt fremme (2099-01).
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'tif-talent-tracker',
  firestore: { host: '127.0.0.1', port: 8890, rules: fs.readFileSync(new URL("../../firestore.rules", import.meta.url),'utf8') }
});
await env.clearFirestore();
const r = []; const ok = (n,b,d)=>{ r.push([n,b]); console.log((b?'PASS':'FAIL')+' - '+n+(d?' :: '+d:'')); };
const proev = async (n, forvent, fn) => {
  try { forvent==='ALLOW' ? await assertSucceeds(fn()) : await assertFails(fn()); ok(n,true); }
  catch(e){ ok(n,false,(e.message||'').split('\n')[0].slice(0,120)); }
};
const BRUGERE = {
  admin:    {uid:'u-admin', doc:{email:'a@x.invalid', role:'admin', years:['2017'], active:true}},
  hel:      {uid:'u-hel',   doc:{email:'h@x.invalid', role:'coach', years:['2017'], active:true}},                                // ingen kønsopdeling
  begge:    {uid:'u-begge', doc:{email:'b@x.invalid', role:'coach', years:['2017'], yearGenders:{'2017':'begge'}, active:true}},
  drenge:   {uid:'u-dr',    doc:{email:'d@x.invalid', role:'coach', years:['2017'], yearGenders:{'2017':'dreng'}, active:true}},
  anden:    {uid:'u-anden', doc:{email:'x@x.invalid', role:'coach', years:['2016'], active:true}},
  lukket:   {uid:'u-luk',   doc:{email:'l@x.invalid', role:'coach', years:['2017'], active:false}},
  spiller:  {uid:'u-sp',    doc:{email:'s@x.invalid', role:'player', playerId:'p1', years:['2017'], active:true}},
};
await env.withSecurityRulesDisabled(async c => { for(const b of Object.values(BRUGERE)) await setDoc(doc(c.firestore(),'users',b.uid), b.doc); });
const db = k => env.authenticatedContext(BRUGERE[k].uid).firestore();
// Præcis den form, appen skriver.
const post = (maaned, aargang = '2017', ekstra = {}) => ({maaned, aargang,
  vindere: [{id:'p1', navn:'Oscar', dage: 12, minutter: 30, oevelser: 20, point: 60}], beregnet: serverTimestamp(), ...ekstra});
const gem = (k, maaned, aargang = '2017', ekstra, id) => setDoc(doc(db(k), 'maanedensSpiller', id || `${maaned}_${aargang}`), post(maaned, aargang, ekstra));

console.log('\n--- Hvem må gemme en kåring ---');
await proev('admin gemmer en afgjort måned', 'ALLOW', ()=>gem('admin', '2025-01'));
await proev('en træner uden kønsopdeling gemmer', 'ALLOW', ()=>gem('hel', '2025-02'));
await proev('en træner med "begge" gemmer', 'ALLOW', ()=>gem('begge', '2025-03'));
await proev('en træner, der kun ser drengene, kan ikke', 'DENY', ()=>gem('drenge', '2025-04'));
await proev('en træner fra en anden årgang kan ikke', 'DENY', ()=>gem('anden', '2025-05'));
await proev('en deaktiveret træner kan ikke', 'DENY', ()=>gem('lukket', '2025-06'));
await proev('en spiller kan ikke', 'DENY', ()=>gem('spiller', '2025-07'));
await proev('uden login kan man ikke', 'DENY', ()=>setDoc(doc(env.unauthenticatedContext().firestore(), 'maanedensSpiller', '2025-08_2017'), post('2025-08')));

console.log('\n--- Kun når måneden er afgjort ---');
await proev('en måned, der ikke er afgjort, kan ikke kåres - heller ikke af admin', 'DENY', ()=>gem('admin', '2099-01'));
await proev('den indeværende måned kan ikke kåres', 'DENY', ()=>gem('admin', new Date().toISOString().slice(0, 7)));

console.log('\n--- Den ligger fast ---');
await proev('en kåring kan ikke ændres - heller ikke af admin', 'DENY', ()=>gem('admin', '2025-01'));
await proev('heller ikke af træneren, der gemte den', 'DENY', ()=>gem('hel', '2025-02'));
await proev('en spiller kan ikke slette den', 'DENY', ()=>deleteDoc(doc(db('spiller'), 'maanedensSpiller', '2025-01_2017')));
await proev('en træner kan ikke slette den', 'DENY', ()=>deleteDoc(doc(db('hel'), 'maanedensSpiller', '2025-01_2017')));
await proev('admin kan slette en fejl', 'ALLOW', ()=>deleteDoc(doc(db('admin'), 'maanedensSpiller', '2025-03_2017')));

console.log('\n--- Formen ---');
await proev('postens id skal passe til måned og årgang', 'DENY', ()=>gem('admin', '2025-09', '2017', {}, '2025-10_2017'));
await proev('en måned skrevet forkert afvises', 'DENY', ()=>gem('admin', '2025-13', '2017', {}, '2025-13_2017'));
await proev('ekstra felter afvises', 'DENY', ()=>gem('admin', '2025-09', '2017', {snyd: true}));
await proev('ingen vinder er en gyldig kåring', 'ALLOW', ()=>setDoc(doc(db('admin'), 'maanedensSpiller', '2025-11_2017'), {maaned:'2025-11', aargang:'2017', vindere:[], beregnet: serverTimestamp()}));

console.log('\n--- Hvem må læse ---');
await proev('en spiller kan læse kåringerne', 'ALLOW', ()=>getDoc(doc(db('spiller'), 'maanedensSpiller', '2025-01_2017')));
await proev('en træner fra en anden årgang kan læse dem', 'ALLOW', ()=>getDoc(doc(db('anden'), 'maanedensSpiller', '2025-01_2017')));
await proev('et deaktiveret login kan ikke', 'DENY', ()=>getDoc(doc(db('lukket'), 'maanedensSpiller', '2025-01_2017')));

console.log('\n--- Appen lytter på HELE samlingen (en list-forespørgsel), ikke på enkelte poster ---');
await env.withSecurityRulesDisabled(async c => {
  await setDoc(doc(c.firestore(),'users','u-demo'), {email:'demo@x.invalid', role:'player', playerId:'p9', years:['2017'], demo:true, active:true});
});
const alle = k => getDocs(collection(env.authenticatedContext(k).firestore(), 'maanedensSpiller'));
await proev('admin må lytte på hele samlingen', 'ALLOW', ()=>alle(BRUGERE.admin.uid));
await proev('en træner må', 'ALLOW', ()=>alle(BRUGERE.hel.uid));
await proev('en træner, der kun ser drengene, må', 'ALLOW', ()=>alle(BRUGERE.drenge.uid));
await proev('en træner fra en anden årgang må', 'ALLOW', ()=>alle(BRUGERE.anden.uid));
await proev('en spiller må', 'ALLOW', ()=>alle(BRUGERE.spiller.uid));
await proev('demo-loginnet må', 'ALLOW', ()=>alle('u-demo'));
await proev('et deaktiveret login må ikke', 'DENY', ()=>alle(BRUGERE.lukket.uid));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
