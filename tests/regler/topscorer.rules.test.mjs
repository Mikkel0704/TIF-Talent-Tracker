// Månedens topscorer: samme regler som Månedens spiller (maaned.rules.test.mjs). Posten må
// kun OPRETTES - af admin eller en træner, der ser hele årgangen, og først når måneden er
// afgjort. Admin må kun fjerne vindere (når et barn slettes). Ingen må slette posten - heller
// ikke admin. Alle aktive logins læser, også som en list-forespørgsel på hele samlingen, for
// det er sådan appen lytter. Emulatorens ur er det rigtige ur, så "afgjort" testes med en
// måned langt tilbage (2025-01) og én langt fremme (2099-01).
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
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
  lukketAdmin: {uid:'u-lukadm', doc:{email:'la@x.invalid', role:'admin', years:['2017'], active:false}},
  spiller:  {uid:'u-sp',    doc:{email:'s@x.invalid', role:'player', playerId:'p1', years:['2017'], active:true}},
  demo:     {uid:'u-demo',  doc:{email:'demo@x.invalid', role:'player', playerId:'p9', years:['2017'], demo:true, active:true}},
};
await env.withSecurityRulesDisabled(async c => { for(const b of Object.values(BRUGERE)) await setDoc(doc(c.firestore(),'users',b.uid), b.doc); });
const db = k => env.authenticatedContext(BRUGERE[k].uid).firestore();
const S = 'maanedensTopscorer';
// Præcis den form, appen (og serveren) skriver.
const vinder = (id, point = 120) => ({id, navn:'Navn ' + id, point, oevelser: 30, svaer: 4, mellem: 3, let: 2, starter: 1});
const post = (maaned, aargang = '2017', ekstra = {}) => ({maaned, aargang, vindere: [vinder('p1')], beregnet: serverTimestamp(), ...ekstra});
const gem = (k, maaned, aargang = '2017', ekstra, id) => setDoc(doc(db(k), S, id || `${maaned}_${aargang}`), post(maaned, aargang, ekstra));
// En topscorer kaares lige efter Maanedens spiller for samme maaned og aargang. Her er
// Maanedens spiller p5 i alle maaneder i 2025 (2017 og 2016) - ikke p1, der er topscorer.
await env.withSecurityRulesDisabled(async c => {
  for(let m = 1; m <= 12; m++) for(const aar of ['2017', '2016']){
    const maaned = '2025-' + String(m).padStart(2, '0');
    await setDoc(doc(c.firestore(), 'maanedensSpiller', `${maaned}_${aar}`), {maaned, aargang: aar, beregnet: new Date(),
      vindere: [{id:'p5', navn:'Navn p5', dage: 10, minutter: 15, oevelser: 10, point: 20}]});
  }
});

console.log('\n--- Hvem må gemme en topscorer ---');
await proev('admin gemmer en afgjort måned', 'ALLOW', ()=>gem('admin', '2025-01'));
await proev('en træner uden kønsopdeling gemmer', 'ALLOW', ()=>gem('hel', '2025-02'));
await proev('en træner med "begge" gemmer', 'ALLOW', ()=>gem('begge', '2025-03'));
await proev('en træner, der kun ser drengene, kan ikke', 'DENY', ()=>gem('drenge', '2025-04'));
await proev('en træner fra en anden årgang kan ikke', 'DENY', ()=>gem('anden', '2025-05'));
await proev('en deaktiveret træner kan ikke', 'DENY', ()=>gem('lukket', '2025-06'));
await proev('en deaktiveret admin kan ikke', 'DENY', ()=>gem('lukketAdmin', '2025-06'));
await proev('en spiller kan ikke', 'DENY', ()=>gem('spiller', '2025-07'));
await proev('demo-loginnet kan ikke', 'DENY', ()=>gem('demo', '2025-07'));
await proev('uden login kan man ikke', 'DENY', ()=>setDoc(doc(env.unauthenticatedContext().firestore(), S, '2025-08_2017'), post('2025-08')));

console.log('\n--- Kun når måneden er afgjort ---');
await proev('en måned, der ikke er afgjort, kan ikke kåres - heller ikke af admin', 'DENY', ()=>gem('admin', '2099-01'));
await proev('den indeværende måned kan ikke kåres', 'DENY', ()=>gem('admin', new Date().toISOString().slice(0, 7)));

console.log('\n--- Den oprettes én gang ---');
await proev('en topscorer kan ikke skrives igen - heller ikke af admin', 'DENY', ()=>gem('admin', '2025-01'));
await proev('heller ikke af træneren, der gemte den', 'DENY', ()=>gem('hel', '2025-02'));
await proev('heller ikke med en flettet skrivning af én ny vinder', 'DENY',
  ()=>setDoc(doc(db('hel'), S, '2025-02_2017'), {vindere:[vinder('p2')]}, {merge:true}));

console.log('\n--- Formen ---');
await proev('postens id skal passe til måned og årgang', 'DENY', ()=>gem('admin', '2025-09', '2017', {}, '2025-10_2017'));
await proev('en måned skrevet forkert afvises', 'DENY', ()=>gem('admin', '2025-13', '2017', {}, '2025-13_2017'));
await proev('ekstra felter afvises', 'DENY', ()=>gem('admin', '2025-09', '2017', {snyd: true}));
await proev('"rettet" ved oprettelsen afvises', 'DENY', ()=>gem('admin', '2025-09', '2017', {rettet: serverTimestamp()}));
await proev('årgangen skal være en tekst', 'DENY', ()=>setDoc(doc(db('admin'), S, '2025-09_2017'), {maaned:'2025-09', aargang:2017, vindere:[], beregnet: serverTimestamp()}));
await proev('vindere skal være en liste', 'DENY', ()=>gem('admin', '2025-09', '2017', {vindere: {p1: true}}));
await proev('højst 30 vindere', 'DENY', ()=>gem('admin', '2025-09', '2017', {vindere: Array.from({length: 31}, (_, i)=>vinder('p' + i, 5))}));
// En klient maa hoejst gemme 3 delte topscorere (reglerne sammenligner hvert par med
// Maanedens spillers vindere); flere kaarer serveren.
await proev('en klient kan ikke gemme 4 delte topscorere (det goer serveren)', 'DENY', ()=>gem('admin', '2025-09', '2017', {vindere: ['p1','p2','p3','p4'].map(id=>vinder(id, 5))}));
await proev('3 delte topscorere er en gyldig post', 'ALLOW', ()=>gem('admin', '2025-09', '2017', {vindere: ['p1','p2','p3'].map(id=>vinder(id, 5))}));
await proev('ingen topscorer er en gyldig kåring', 'ALLOW', ()=>setDoc(doc(db('admin'), S, '2025-11_2017'), {maaned:'2025-11', aargang:'2017', vindere:[], beregnet: serverTimestamp()}));

console.log('\n--- Kun efter Månedens spiller, og ikke til en af dens vindere ---');
await env.withSecurityRulesDisabled(async c => {
  await setDoc(doc(c.firestore(), 'maanedensSpiller', '2024-05_2017'), {maaned:'2024-05', aargang:'2017', beregnet:new Date(),
    vindere:[{id:'p1', navn:'Navn p1', dage:9, minutter:9, oevelser:9, point:9}, {id:'p7', navn:'Navn p7', dage:9, minutter:9, oevelser:9, point:9}]});
  await setDoc(doc(c.firestore(), 'maanedensSpiller', '2024-06_2017'), {maaned:'2024-06', aargang:'2017', beregnet:new Date(),
    vindere:['p1','p2','p3','p4'].map(id=>({id, navn:'Navn '+id, dage:1, minutter:1, oevelser:1, point:1}))});
});
await proev('uden Månedens spiller for samme måned og årgang: nej - heller ikke admin', 'DENY', ()=>gem('admin', '2024-04'));
await proev('Månedens spiller for en anden årgang tæller ikke', 'DENY', ()=>gem('admin', '2025-01', '2015'));
await proev('topscoreren er Månedens spiller (p1 delte prisen): nej', 'DENY', ()=>gem('admin', '2024-05'));
await proev('heller ikke når p1 står som nr. 2 af tre delte topscorere', 'DENY', ()=>gem('admin', '2024-05', '2017', {vindere:[vinder('p3'), vinder('p1'), vinder('p4')]}));
await proev('heller ikke Månedens spillers anden vinder (p7) som nr. 3', 'DENY', ()=>gem('admin', '2024-05', '2017', {vindere:[vinder('p3'), vinder('p4'), vinder('p7')]}));
await proev('en træner kan heller ikke', 'DENY', ()=>gem('hel', '2024-05'));
await proev('tre andre end Månedens spillers vindere: ja', 'ALLOW', ()=>gem('admin', '2024-05', '2017', {vindere:[vinder('p3'), vinder('p4'), vinder('p8')]}));
await proev('Månedens spiller med 4 delte vindere: en klient kan ikke kåre topscoreren (det gør serveren)', 'DENY', ()=>gem('admin', '2024-06', '2017', {vindere:[vinder('p8')]}));
await proev('Månedens spiller og en tom topscorer i samme batch: ja (reglen ser Månedens spiller efter skrivningen)', 'ALLOW', ()=>{
  const f = db('admin'), b = writeBatch(f);
  b.set(doc(f, 'maanedensSpiller', '2024-07_2017'), {maaned:'2024-07', aargang:'2017', vindere:[{id:'p1', navn:'Navn p1', dage:1, minutter:1, oevelser:1, point:1}], beregnet: serverTimestamp()});
  b.set(doc(f, S, '2024-07_2017'), {maaned:'2024-07', aargang:'2017', vindere:[], beregnet: serverTimestamp()});
  return b.commit();
});
await proev('men ikke med Månedens spillers vinder som topscorer i samme batch', 'DENY', ()=>{
  const f = db('admin'), b = writeBatch(f);
  b.set(doc(f, 'maanedensSpiller', '2024-08_2017'), {maaned:'2024-08', aargang:'2017', vindere:[{id:'p1', navn:'Navn p1', dage:1, minutter:1, oevelser:1, point:1}], beregnet: serverTimestamp()});
  b.set(doc(f, S, '2024-08_2017'), post('2024-08'));
  return b.commit();
});

console.log('\n--- Admin må kun fjerne vindere (når et barn slettes) ---');
await env.withSecurityRulesDisabled(async c => {
  await setDoc(doc(c.firestore(), S, '2025-12_2017'), {maaned:'2025-12', aargang:'2017', beregnet: new Date(), vindere:[vinder('p1'), vinder('p2'), vinder('p3')]});
});
const M = '2025-12_2017';
const gemt = async () => { let d; await env.withSecurityRulesDisabled(async c => { d = (await getDoc(doc(c.firestore(), S, M))).data(); }); return d; };
await proev('admin: fjerner én vinder (som appen: setDoc med merge, vindere + rettet)', 'ALLOW',
  ()=>setDoc(doc(db('admin'), S, M), {vindere:[vinder('p1'), vinder('p3')], rettet: serverTimestamp()}, {merge:true}));
const efter = await gemt();
ok('listen er nu to lang, og måned, årgang og beregnet er urørt', efter?.vindere?.length === 2 && efter?.maaned === '2025-12' && efter?.aargang === '2017' && !!efter?.beregnet);
await proev('admin: fjerner én til (som serveren: update)', 'ALLOW', ()=>updateDoc(doc(db('admin'), S, M), {vindere:[vinder('p1')], rettet: serverTimestamp()}));
await proev('admin: kan ikke gøre listen længere', 'DENY',
  ()=>setDoc(doc(db('admin'), S, M), {vindere:[vinder('p1'), vinder('p2')], rettet: serverTimestamp()}, {merge:true}));
await proev('admin: kan ikke bytte en vinder ud (samme længde)', 'DENY',
  ()=>setDoc(doc(db('admin'), S, M), {vindere:[vinder('p2')], rettet: serverTimestamp()}, {merge:true}));
await proev('admin: kan ikke ændre måneden', 'DENY',
  ()=>setDoc(doc(db('admin'), S, M), {vindere:[], maaned:'2025-02', rettet: serverTimestamp()}, {merge:true}));
await proev('admin: kan ikke ændre årgangen', 'DENY',
  ()=>setDoc(doc(db('admin'), S, M), {vindere:[], aargang:'2016', rettet: serverTimestamp()}, {merge:true}));
await proev('admin: kan ikke ændre beregnet', 'DENY',
  ()=>setDoc(doc(db('admin'), S, M), {vindere:[], beregnet: serverTimestamp()}, {merge:true}));
await proev('admin: vindere skal være en liste', 'DENY',
  ()=>setDoc(doc(db('admin'), S, M), {vindere:null, rettet: serverTimestamp()}, {merge:true}));
await proev('en deaktiveret admin kan ikke fjerne en vinder', 'DENY',
  ()=>setDoc(doc(db('lukketAdmin'), S, M), {vindere:[], rettet: serverTimestamp()}, {merge:true}));
await proev('træner med hele årgangen: kan ikke fjerne en vinder', 'DENY',
  ()=>setDoc(doc(db('hel'), S, M), {vindere:[], rettet: serverTimestamp()}, {merge:true}));
await proev('spiller: kan ikke fjerne en vinder', 'DENY',
  ()=>setDoc(doc(db('spiller'), S, M), {vindere:[], rettet: serverTimestamp()}, {merge:true}));
await proev('admin: fjerner den sidste vinder - posten står tilbage uden vinder', 'ALLOW',
  ()=>setDoc(doc(db('admin'), S, M), {vindere:[], rettet: serverTimestamp()}, {merge:true}));
ok('posten findes stadig med en tom liste', JSON.stringify((await gemt())?.vindere) === '[]');

console.log('\n--- Ingen må slette en topscorer ---');
await proev('admin kan ikke slette den', 'DENY', ()=>deleteDoc(doc(db('admin'), S, '2025-01_2017')));
await proev('en træner kan ikke slette den', 'DENY', ()=>deleteDoc(doc(db('hel'), S, '2025-01_2017')));
await proev('en spiller kan ikke slette den', 'DENY', ()=>deleteDoc(doc(db('spiller'), S, '2025-01_2017')));
await proev('admin kan heller ikke "slette" en post, der ikke findes', 'DENY', ()=>deleteDoc(doc(db('admin'), S, '2024-01_2017')));

console.log('\n--- Hvem må læse ---');
await proev('en spiller kan læse topscorerne', 'ALLOW', ()=>getDoc(doc(db('spiller'), S, '2025-01_2017')));
await proev('en træner fra en anden årgang kan læse dem', 'ALLOW', ()=>getDoc(doc(db('anden'), S, '2025-01_2017')));
await proev('et deaktiveret login kan ikke', 'DENY', ()=>getDoc(doc(db('lukket'), S, '2025-01_2017')));
await proev('uden login kan man ikke', 'DENY', ()=>getDoc(doc(env.unauthenticatedContext().firestore(), S, '2025-01_2017')));

console.log('\n--- Appen lytter på HELE samlingen (en list-forespørgsel), ikke på enkelte poster ---');
const alle = k => getDocs(collection(db(k), S));
await proev('admin må lytte på hele samlingen', 'ALLOW', ()=>alle('admin'));
await proev('en træner må', 'ALLOW', ()=>alle('hel'));
await proev('en træner med "begge" må', 'ALLOW', ()=>alle('begge'));
await proev('en træner, der kun ser drengene, må', 'ALLOW', ()=>alle('drenge'));
await proev('en træner fra en anden årgang må', 'ALLOW', ()=>alle('anden'));
await proev('en spiller må', 'ALLOW', ()=>alle('spiller'));
await proev('demo-loginnet må', 'ALLOW', ()=>alle('demo'));
await proev('et deaktiveret login må ikke', 'DENY', ()=>alle('lukket'));
await proev('en deaktiveret admin må ikke', 'DENY', ()=>alle('lukketAdmin'));
await proev('uden login må man ikke', 'DENY', ()=>getDocs(collection(env.unauthenticatedContext().firestore(), S)));

console.log('\n--- Månedens spiller er uændret (de deler nu reglernes funktioner) ---');
await proev('Månedens spiller: admin gemmer stadig', 'ALLOW', ()=>setDoc(doc(db('admin'), 'maanedensSpiller', '2025-01_2015'),
  {maaned:'2025-01', aargang:'2015', vindere:[{id:'p1', navn:'Oscar', dage: 12, minutter: 30, oevelser: 20, point: 60}], beregnet: serverTimestamp()}));
await proev('Månedens spiller: en træner, der kun ser drengene, kan stadig ikke', 'DENY', ()=>setDoc(doc(db('drenge'), 'maanedensSpiller', '2025-02_2017'),
  {maaned:'2025-02', aargang:'2017', vindere:[], beregnet: serverTimestamp()}));
await proev('Månedens spiller: admin kan stadig slette en fejl', 'ALLOW', ()=>deleteDoc(doc(db('admin'), 'maanedensSpiller', '2025-01_2015')));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
