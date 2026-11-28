// Den serverberegnede rangliste: en spiller henter om de ANDRE boern kun det, ranglisten
// viser (rangliste/ i egen aargang og klubRangliste/top). Alt andet - spillerdokumenter,
// fodteknik, stigen, indsendelser og dueller - laeser spilleren kun for sig selv (og for
// indsendelser/dueller ogsaa dem i egne dueller).
//
// Testene er formet som kalderen: praecis de forespoergsler, kontrakten skriver op for
// appen - enkeltdokumenter paa id for egne dokumenter, where-forespoergsler som skrevet.
// Skrivningerne, en spiller kan i dag, proeves bagefter med samme form som index.html.
//
// Rollerne:
//   spiller (p1, 2017 dreng), kammerat (p2, 2017 dreng), ny (p-ny, har endnu ingen
//   fodteknik og ingen stige), elleve (p11, 2011), demo (p9), udenId (spillerlogin uden
//   playerId), traener (2017 begge), drenge (2017 kun drenge), anden (2011), admin,
//   lukket (deaktiveret spiller p1), lukketTraener, fremmed (ingen users-dokument), ude
//   (ikke logget ind), foerLinje (spillerlogin til p-ingen, som endnu ingen linje har).
//
// Kun boern med login (v15.86): p4 (2017 dreng) har intet login, og p9 er barnet bag
// demo-loginnet - begges linjer har kanUdfordres false, ligesom p-ny's (endnu ikke sat).
// En spiller ser andre boerns linjer kun med kanUdfordres == true, men altid sin egen.
//
// Gemte data laeses KUN gennem withSecurityRulesDisabled - aldrig med en bar getDoc
// gennem et regelstyret login uden for assertSucceeds/assertFails.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, addDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
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
  admin:         {uid:'u-admin',    doc:{email:'a@x.invalid', role:'admin', years:['2017'], active:true}},
  traener:       {uid:'u-traener',  doc:{email:'t@x.invalid', role:'coach', years:['2017'], yearGenders:{'2017':'begge'}, active:true}},
  drenge:        {uid:'u-drenge',   doc:{email:'dr@x.invalid', role:'coach', years:['2017'], yearGenders:{'2017':'dreng'}, active:true}},
  anden:         {uid:'u-anden',    doc:{email:'x@x.invalid', role:'coach', years:['2011'], active:true}},
  lukketTraener: {uid:'u-lukT',     doc:{email:'lt@x.invalid', role:'coach', years:['2017'], active:false}},
  spiller:       {uid:'u-spiller',  doc:{email:'s@x.invalid', role:'player', playerId:'p1', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:false}},
  kammerat:      {uid:'u-kammerat', doc:{email:'k@x.invalid', role:'player', playerId:'p2', years:['2017'], yearGenders:{'2017':'dreng'}, active:true}},   // intet demo-felt
  ny:            {uid:'u-ny',       doc:{email:'n@x.invalid', role:'player', playerId:'p-ny', years:['2017'], yearGenders:{'2017':'dreng'}, active:true}},
  elleve:        {uid:'u-elleve',   doc:{email:'e@x.invalid', role:'player', playerId:'p11', years:['2011'], active:true, demo:false}},
  demo:          {uid:'u-demo',     doc:{email:'d@x.invalid', role:'player', playerId:'p9', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:true}},
  udenId:        {uid:'u-udenId',   doc:{email:'ui@x.invalid', role:'player', years:['2017'], active:true}},
  lukket:        {uid:'u-lukket',   doc:{email:'l@x.invalid', role:'player', playerId:'p1', years:['2017'], yearGenders:{'2017':'dreng'}, active:false, demo:false}},
  foerLinje:     {uid:'u-foerLinje', doc:{email:'fl@x.invalid', role:'player', playerId:'p-ingen', years:['2017'], yearGenders:{'2017':'dreng'}, active:true}},
};
const FREMMED_UID = 'u-fremmed';   // ingen users-dokument

const D = '2026-11-07';
const nu = () => new Date().toISOString();
const BOERN = {p1:['2017','dreng'], p2:['2017','dreng'], p3:['2017','pige'], p4:['2017','dreng'], p9:['2017','dreng'], 'p-ny':['2017','dreng'], p11:['2011','dreng']};
// Boern uden et aktivt spillerlogin: deres linje har kanUdfordres false.
const UDEN_LOGIN = new Set(['p4', 'p9', 'p-ny']);
// Praecis den linje, serveren skriver (se kontrakten).
const linje = (pid, year, gender, total, kanUdfordres = !UDEN_LOGIN.has(pid)) => ({name:'TEST '+pid, year, gender, kanUdfordres, total,
  uge:{fra:'2026-11-09', point:5}, maaned:{fra:'2026-11-01', point:10}, regler:'2026-11-15', opdateret:new Date()});
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  for(const b of Object.values(B)) await setDoc(doc(db,'users',b.uid), b.doc);
  for(const [pid,[year,gender]] of Object.entries(BOERN)){
    await setDoc(doc(db,'players',pid), {name:'TEST '+pid, year, gender, points:0, passed:{}, medals:{}, history:[]});
    await setDoc(doc(db,'rangliste',pid), linje(pid, year, gender, 10));
    await setDoc(doc(db,'clubRanking',pid), {name:'TEST '+pid, year, points:10, updatedAt:new Date()});
    if(pid === 'p-ny') continue;   // p-ny har endnu intet registreret
    await setDoc(doc(db,'footwork',pid), {year, gender, updatedAt:new Date(), days:{'2026-11-01':{t:1}}});
    await setDoc(doc(db,'juggleLadder',pid), {year, gender, updatedAt:new Date(), mainStep:2, days:['2026-11-01']});
  }
  // Et gammelt dokument fra foer koen blev denormaliseret.
  await setDoc(doc(db,'footwork','p-gammel'), {year:'2017', updatedAt:new Date(), days:{}});
  await setDoc(doc(db,'juggleLadder','p-gammel'), {year:'2017', updatedAt:new Date(), mainStep:1});
  await setDoc(doc(db,'klubRangliste','top'), {top:[{id:'p1', name:'TEST p1', year:'2017', total:10}], regler:'2026-11-15', opdateret:new Date()});
  const sub = (o) => ({playerName:'TEST', year:'2017', gender:'dreng', exercise:'Finter', stepIndex:0, level:1, medal:'Bronze',
    status:'pending', challengeId:null, challengerId:null, opponentId:null, submittedAt:nu(), createdAt:new Date(), ...o});
  await setDoc(doc(db,'submissions','s-p1'), sub({playerId:'p1'}));
  // En gammel indsendelse UDEN duel-felterne overhovedet - den manglende-felt-faelde.
  const gammel = sub({playerId:'p1'}); delete gammel.challengeId; delete gammel.challengerId; delete gammel.opponentId;
  await setDoc(doc(db,'submissions','s-p1-gammel'), gammel);
  await setDoc(doc(db,'submissions','s-p2'), sub({playerId:'p2'}));
  const gammel2 = sub({playerId:'p2'}); delete gammel2.challengeId; delete gammel2.challengerId; delete gammel2.opponentId;
  await setDoc(doc(db,'submissions','s-p2-gammel'), gammel2);
  // p2's video i duellen mod p1 (p1 udfordrede p2), og en duel mellem to ANDRE boern.
  await setDoc(doc(db,'submissions','s-p2-duel'), sub({playerId:'p2', exercise:'Flest jongleringer', stepIndex:null, level:null, medal:null,
    challengeId:'c12', challengerId:'p1', opponentId:'p2', status:'approved', reviewedAt:new Date(), pointsAwarded:0}));
  await setDoc(doc(db,'submissions','s-p3-duel'), sub({playerId:'p3', gender:'pige', exercise:'Flest jongleringer', stepIndex:null, level:null, medal:null,
    challengeId:'c23', challengerId:'p2', opponentId:'p3', status:'approved'}));
  await setDoc(doc(db,'submissions','s-p11'), sub({playerId:'p11', year:'2011'}));
  await setDoc(doc(db,'challenges','c12'), {type:'freestyle', title:'Flest jongleringer', challengerId:'p1', challengerName:'TEST p1',
    opponentId:'p2', opponentName:'TEST p2', year:'2017', gender:'dreng', status:'active', createdAt:new Date()});
  await setDoc(doc(db,'challenges','c21'), {type:'freestyle', title:'Fedeste trick', challengerId:'p2', challengerName:'TEST p2',
    opponentId:'p1', opponentName:'TEST p1', year:'2017', gender:'dreng', status:'pending', createdAt:new Date()});
  await setDoc(doc(db,'challenges','c23'), {type:'freestyle', title:'Flest jongleringer', challengerId:'p2', challengerName:'TEST p2',
    opponentId:'p3', opponentName:'TEST p3', year:'2017', gender:'dreng', status:'active', createdAt:new Date()});
});
const db = k => k === 'fremmed' ? env.authenticatedContext(FREMMED_UID).firestore()
  : k === 'ude' ? env.unauthenticatedContext().firestore()
  : env.authenticatedContext(B[k].uid).firestore();
const aar = (k, s, y) => getDocs(query(collection(db(k), s), where('year','==',y)));
const aarKoen = (k, s, y, g) => getDocs(query(collection(db(k), s), where('year','==',y), where('gender','==',g)));
// Spillerens forespoergsel paa ranglisten fra v15.86: kun boern med login.
const aarLogin = (k, y, kan = true) => getDocs(query(collection(db(k), 'rangliste'), where('year','==',y), where('kanUdfordres','==',kan)));
const aarKoenLogin = (k, y, g, kan = true) => getDocs(query(collection(db(k), 'rangliste'), where('year','==',y), where('gender','==',g), where('kanUdfordres','==',kan)));
const felt = (k, s, f, v) => getDocs(query(collection(db(k), s), where(f,'==',v)));
const hent = (k, s, id) => getDoc(doc(db(k), s, id));

// =====================================================================================
console.log('\n--- rangliste/: spilleren læser sin egen årgang - kun børn med login ---');
await proev('spiller (drenge-login): lytter på drengene med login i sin årgang (year + køn + kanUdfordres, som appen spørger)', 'ALLOW', ()=>aarKoenLogin('spiller','2017','dreng'));
await proev('spiller (drenge-login): uden kanUdfordres-klausulen afvises forespørgslen (year + køn, som før v15.86)', 'DENY', ()=>aarKoen('spiller','rangliste','2017','dreng'));
await proev('spiller (drenge-login): kan IKKE lytte på børnene UDEN login (kanUdfordres == false)', 'DENY', ()=>aarKoenLogin('spiller','2017','dreng', false));
await proev('spiller (drenge-login): kan IKKE lytte på hele årgangen uden køn', 'DENY', ()=>aar('spiller','rangliste','2017'));
await proev('spiller (drenge-login): heller ikke med kanUdfordres, men uden køn', 'DENY', ()=>aarLogin('spiller','2017'));
await proev('spiller (drenge-login): kan IKKE lytte på pigerne i årgangen', 'DENY', ()=>aarKoenLogin('spiller','2017','pige'));
await proev('spiller: kan IKKE lytte på en anden årgangs rangliste', 'DENY', ()=>aarLogin('spiller','2011'));
await proev('spiller: kan IKKE liste ranglisten uden where-klausul', 'DENY', ()=>getDocs(collection(db('spiller'),'rangliste')));
await proev('spiller: kan IKKE liste ranglisten med kun kanUdfordres', 'DENY', ()=>getDocs(query(collection(db('spiller'),'rangliste'), where('kanUdfordres','==',true))));
await proev('spiller: henter en holdkammerats linje i sin årgang (kammeraten har login)', 'ALLOW', ()=>hent('spiller','rangliste','p2'));
await proev('spiller: kan IKKE hente linjen for et barn uden login i sin årgang', 'DENY', ()=>hent('spiller','rangliste','p4'));
await proev('spiller: kan IKKE hente linjen for barnet bag demo-loginnet', 'DENY', ()=>hent('spiller','rangliste','p9'));
await proev('spiller: henter sin egen linje (enkeltdokument, som appen lytter)', 'ALLOW', ()=>hent('spiller','rangliste','p1'));
await proev('spiller (drenge-login): kan IKKE hente en piges linje i årgangen', 'DENY', ()=>hent('spiller','rangliste','p3'));
await proev('spiller: kan IKKE hente en linje fra en anden årgang', 'DENY', ()=>hent('spiller','rangliste','p11'));
await proev('ny spiller: henter sin egen linje, selvom den siger kanUdfordres false', 'ALLOW', ()=>hent('ny','rangliste','p-ny'));
await proev('spiller uden linje endnu: lytter på sin egen linje, før den findes', 'ALLOW', ()=>hent('foerLinje','rangliste','p-ingen'));
await proev('spiller uden linje endnu: men ikke på et andet barns', 'DENY', ()=>hent('foerLinje','rangliste','p4'));
await proev('2011-spiller (login uden kønsgrænse): lytter på børnene med login i hele sin årgang', 'ALLOW', ()=>aarLogin('elleve','2011'));
await proev('2011-spiller: uden kanUdfordres-klausulen afvises forespørgslen', 'DENY', ()=>aar('elleve','rangliste','2011'));
await proev('2011-spiller: kan IKKE lytte på 2017', 'DENY', ()=>aarLogin('elleve','2017'));
await proev('demo (drenge-login): lytter på drengene med login i sin årgang', 'ALLOW', ()=>aarKoenLogin('demo','2017','dreng'));
await proev('demo (drenge-login): uden kanUdfordres-klausulen afvises forespørgslen', 'DENY', ()=>aarKoen('demo','rangliste','2017','dreng'));
await proev('demo (drenge-login): kan IKKE lytte på hele årgangen uden køn', 'DENY', ()=>aarLogin('demo','2017'));
await proev('demo: kan IKKE lytte på en anden årgang', 'DENY', ()=>aarLogin('demo','2011'));
await proev('demo: henter sin egen linje, selvom barnet ikke har et rigtigt login (kanUdfordres false)', 'ALLOW', ()=>hent('demo','rangliste','p9'));
await proev('demo: henter en holdkammerat med login', 'ALLOW', ()=>hent('demo','rangliste','p1'));
await proev('demo: kan IKKE hente et barn uden login', 'DENY', ()=>hent('demo','rangliste','p4'));
await proev('spillerlogin uden playerId: lytter på børnene med login i årgangen', 'ALLOW', ()=>aarLogin('udenId','2017'));
await proev('spillerlogin uden playerId: kan IKKE hente et barn uden login', 'DENY', ()=>hent('udenId','rangliste','p4'));
{
  // Det, forespørgslen faktisk giver: kun drengene med login - ikke Carl uden login (p4),
  // ikke barnet bag demo-loginnet (p9), ikke p-ny og ikke pigen (p3).
  let ider = null;
  await proev('spiller: forespørgslen giver kun drengene med login', 'ALLOW', async ()=>{ ider = (await aarKoenLogin('spiller','2017','dreng')).docs.map(d=>d.id).sort(); });
  ok('  ... netop p1 og p2', JSON.stringify(ider) === '["p1","p2"]', JSON.stringify(ider));
}

console.log('\n--- rangliste/: trænere og admin ---');
await proev('træner: lytter på sin årgangs rangliste', 'ALLOW', ()=>aar('traener','rangliste','2017'));
await proev('træner: kan IKKE lytte på en anden årgang', 'DENY', ()=>aar('traener','rangliste','2011'));
await proev('drengetræner: kan IKKE lytte på hele årgangens rangliste uden køn', 'DENY', ()=>aar('drenge','rangliste','2017'));
await proev('drengetræner: lytter på drengenes linjer, som subscribeYearScoped spørger', 'ALLOW', ()=>aarKoen('drenge','rangliste','2017','dreng'));
await proev('drengetræner: kan IKKE hente en piges linje', 'DENY', ()=>hent('drenge','rangliste','p3'));
await proev('træner med begge køn: henter en piges linje', 'ALLOW', ()=>hent('traener','rangliste','p3'));
await proev('anden årgang: lytter på 2011', 'ALLOW', ()=>aar('anden','rangliste','2011'));
await proev('anden årgang: kan IKKE lytte på 2017', 'DENY', ()=>aar('anden','rangliste','2017'));
await proev('anden årgang: kan IKKE hente en 2017-linje', 'DENY', ()=>hent('anden','rangliste','p1'));
await proev('admin: lytter på hele samlingen', 'ALLOW', ()=>getDocs(collection(db('admin'),'rangliste')));
await proev('admin: henter en linje fra en årgang, admin ikke står på', 'ALLOW', ()=>hent('admin','rangliste','p11'));
await proev('træner: henter linjen for et barn uden login i sin årgang (som før)', 'ALLOW', ()=>hent('traener','rangliste','p4'));
await proev('drengetræner: henter linjen for en dreng uden login', 'ALLOW', ()=>hent('drenge','rangliste','p4'));
await proev('træner: lytter også med kanUdfordres-klausulen', 'ALLOW', ()=>aarLogin('traener','2017'));
await proev('træner: kan IKKE hente en linje i en anden årgang, selv med login', 'DENY', ()=>hent('traener','rangliste','p11'));
await proev('admin: henter linjen for et barn uden login', 'ALLOW', ()=>hent('admin','rangliste','p4'));

console.log('\n--- klubRangliste/top: alle aktive logins ---');
for(const k of ['spiller','ny','elleve','demo','foerLinje','traener','drenge','anden','admin']){
  await proev(`${k}: læser klubbens top 10`, 'ALLOW', ()=>hent(k,'klubRangliste','top'));
}

console.log('\n--- Ingen klient skriver ranglisten - heller ikke admin ---');
for(const k of ['spiller','traener','admin']){
  await proev(`${k}: kan ikke skrive sin egen/en linje`, 'DENY', ()=>setDoc(doc(db(k),'rangliste','p1'), linje('p1','2017','dreng',9999)));
  await proev(`${k}: kan ikke rette en linje (merge)`, 'DENY', ()=>setDoc(doc(db(k),'rangliste','p1'), {total:9999}, {merge:true}));
  await proev(`${k}: kan ikke oprette en ny linje`, 'DENY', ()=>setDoc(doc(db(k),'rangliste','p-falsk'), linje('p-falsk','2017','dreng',9999)));
  await proev(`${k}: kan ikke slette en linje`, 'DENY', ()=>deleteDoc(doc(db(k),'rangliste','p2')));
  await proev(`${k}: kan ikke skrive klubbens top 10`, 'DENY', ()=>setDoc(doc(db(k),'klubRangliste','top'), {top:[{id:'p1', name:'X', year:'2017', total:9999}]}, {merge:true}));
  await proev(`${k}: kan ikke slette klubbens top 10`, 'DENY', ()=>deleteDoc(doc(db(k),'klubRangliste','top')));
}

// =====================================================================================
console.log('\n--- players/: spilleren læser KUN sit eget spillerdokument ---');
await proev('spiller: lytter på sit eget spillerdokument', 'ALLOW', ()=>hent('spiller','players','p1'));
await proev('spiller: kan IKKE hente en holdkammerat i sin årgang', 'DENY', ()=>hent('spiller','players','p2'));
await proev('spiller: kan IKKE hente en spiller i en anden årgang', 'DENY', ()=>hent('spiller','players','p11'));
await proev('spiller: kan IKKE lytte på årgangen (year)', 'DENY', ()=>aar('spiller','players','2017'));
await proev('spiller: kan IKKE lytte på årgangen (year + køn, som før)', 'DENY', ()=>aarKoen('spiller','players','2017','dreng'));
await proev('spiller: kan IKKE liste samlingen', 'DENY', ()=>getDocs(collection(db('spiller'),'players')));
await proev('ny spiller: lytter på sit eget spillerdokument', 'ALLOW', ()=>hent('ny','players','p-ny'));
await proev('spiller: et spillerdokument, der ikke findes, er stadig kun det eget id', 'DENY', ()=>hent('spiller','players','findes-ikke'));
await proev('demo: læser sit eget spillerdokument', 'ALLOW', ()=>hent('demo','players','p9'));
await proev('demo: kan IKKE hente andre børn', 'DENY', ()=>hent('demo','players','p1'));
await proev('demo: kan IKKE lytte på årgangen', 'DENY', ()=>aarKoen('demo','players','2017','dreng'));
await proev('spillerlogin uden playerId: kan intet spillerdokument hente', 'DENY', ()=>hent('udenId','players','p1'));
console.log('\n--- players/: trænere og admin som før ---');
await proev('træner: lytter på sin årgang', 'ALLOW', ()=>aar('traener','players','2017'));
await proev('drengetræner: lytter på drengene i årgangen', 'ALLOW', ()=>aarKoen('drenge','players','2017','dreng'));
await proev('drengetræner: kan IKKE lytte på hele årgangen uden køn', 'DENY', ()=>aar('drenge','players','2017'));
await proev('drengetræner: kan IKKE hente en pige', 'DENY', ()=>hent('drenge','players','p3'));
await proev('anden årgang: kan IKKE lytte på 2017', 'DENY', ()=>aar('anden','players','2017'));
await proev('admin: lytter på hele samlingen', 'ALLOW', ()=>getDocs(collection(db('admin'),'players')));

// =====================================================================================
for(const s of ['footwork', 'juggleLadder']){
  console.log(`\n--- ${s}/: spilleren læser kun sit eget, træneren sin årgang ---`);
  await proev(`spiller: lytter på sit eget ${s}`, 'ALLOW', ()=>hent('spiller',s,'p1'));
  await proev(`ny spiller: lytter på sit eget ${s}, før det findes`, 'ALLOW', ()=>hent('ny',s,'p-ny'));
  await proev(`spiller: kan IKKE hente en holdkammerats ${s} i sin årgang`, 'DENY', ()=>hent('spiller',s,'p2'));
  await proev(`spiller: kan IKKE hente ${s} for et barn i en anden årgang`, 'DENY', ()=>hent('spiller',s,'p11'));
  await proev(`spiller: kan IKKE hente ${s} for et barn, der ikke findes`, 'DENY', ()=>hent('spiller',s,'p-findes-ikke'));
  await proev(`spiller: kan IKKE liste hele ${s}-samlingen (som før hele klubben kunne)`, 'DENY', ()=>getDocs(collection(db('spiller'),s)));
  await proev(`spiller: kan IKKE lytte på årgangens ${s}`, 'DENY', ()=>aar('spiller',s,'2017'));
  await proev(`spiller: kan IKKE lytte på årgangens ${s} med køn`, 'DENY', ()=>aarKoen('spiller',s,'2017','dreng'));
  await proev(`spiller: kan IKKE lytte på en anden årgangs ${s}`, 'DENY', ()=>aar('spiller',s,'2011'));
  await proev(`demo: læser sit eget ${s}`, 'ALLOW', ()=>hent('demo',s,'p9'));
  await proev(`demo: kan IKKE hente et andet barns ${s}`, 'DENY', ()=>hent('demo',s,'p1'));
  await proev(`spillerlogin uden playerId: kan IKKE hente ${s}`, 'DENY', ()=>hent('udenId',s,'p1'));
  await proev(`træner: lytter på årgangens ${s} (where year)`, 'ALLOW', ()=>aar('traener',s,'2017'));
  await proev(`træner: henter et barn i sin årgang`, 'ALLOW', ()=>hent('traener',s,'p3'));
  await proev(`træner: henter et GAMMELT ${s} uden gender-felt`, 'ALLOW', ()=>hent('traener',s,'p-gammel'));
  await proev(`træner: kan IKKE lytte på en anden årgangs ${s}`, 'DENY', ()=>aar('traener',s,'2011'));
  await proev(`træner: kan IKKE liste hele ${s}-samlingen`, 'DENY', ()=>getDocs(collection(db('traener'),s)));
  await proev(`drengetræner: lytter på drengenes ${s}`, 'ALLOW', ()=>aarKoen('drenge',s,'2017','dreng'));
  await proev(`drengetræner: kan IKKE hente en piges ${s}`, 'DENY', ()=>hent('drenge',s,'p3'));
  await proev(`drengetræner: kan IKKE lytte på hele årgangen uden køn`, 'DENY', ()=>aar('drenge',s,'2017'));
  await proev(`anden årgang: lytter på 2011`, 'ALLOW', ()=>aar('anden',s,'2011'));
  await proev(`anden årgang: kan IKKE hente et 2017-barns ${s}`, 'DENY', ()=>hent('anden',s,'p1'));
  await proev(`admin: lytter på hele ${s}-samlingen`, 'ALLOW', ()=>getDocs(collection(db('admin'),s)));
  await proev(`admin: henter et dokument, der ikke findes`, 'ALLOW', ()=>hent('admin',s,'p-findes-ikke'));
}

// =====================================================================================
console.log('\n--- clubRanking/: kun træner (egen årgang) og admin ---');
await proev('spiller: kan IKKE liste den gamle klub-rangliste', 'DENY', ()=>getDocs(collection(db('spiller'),'clubRanking')));
await proev('spiller: kan IKKE hente sin egen plads', 'DENY', ()=>hent('spiller','clubRanking','p1'));
await proev('spiller: kan IKKE lytte på sin årgang', 'DENY', ()=>aar('spiller','clubRanking','2017'));
await proev('demo: kan IKKE læse den', 'DENY', ()=>hent('demo','clubRanking','p1'));
await proev('træner: lytter på sin årgang', 'ALLOW', ()=>aar('traener','clubRanking','2017'));
await proev('træner: henter en plads i sin årgang', 'ALLOW', ()=>hent('traener','clubRanking','p3'));
await proev('træner: kan IKKE hente en plads i en anden årgang', 'DENY', ()=>hent('traener','clubRanking','p11'));
await proev('træner: kan IKKE liste hele samlingen længere', 'DENY', ()=>getDocs(collection(db('traener'),'clubRanking')));
await proev('drengetræner: lytter på årgangen (samlingen har intet køn)', 'ALLOW', ()=>aar('drenge','clubRanking','2017'));
await proev('anden årgang: henter 2011', 'ALLOW', ()=>hent('anden','clubRanking','p11'));
await proev('admin: lytter på hele samlingen', 'ALLOW', ()=>getDocs(collection(db('admin'),'clubRanking')));
await proev('admin: henter en plads, der ikke findes', 'ALLOW', ()=>hent('admin','clubRanking','p-findes-ikke'));

// =====================================================================================
console.log('\n--- submissions/: egne og dem i egne dueller ---');
await proev('spiller: egne indsendelser (where playerId == p1)', 'ALLOW', ()=>felt('spiller','submissions','playerId','p1'));
await proev('spiller: indsendelser i dueller, man har udfordret til (where challengerId == p1)', 'ALLOW', ()=>felt('spiller','submissions','challengerId','p1'));
await proev('spiller: indsendelser i dueller, man er udfordret i (where opponentId == p1)', 'ALLOW', ()=>felt('spiller','submissions','opponentId','p1'));
await proev('kammerat: (where opponentId == p2)', 'ALLOW', ()=>felt('kammerat','submissions','opponentId','p2'));
await proev('spiller: henter sin egen indsendelse', 'ALLOW', ()=>hent('spiller','submissions','s-p1'));
await proev('spiller: henter sin egen GAMLE indsendelse uden duel-felter', 'ALLOW', ()=>hent('spiller','submissions','s-p1-gammel'));
await proev('spiller: henter modpartens video-indsendelse i sin egen duel', 'ALLOW', ()=>hent('spiller','submissions','s-p2-duel'));
await proev('spiller: kan IKKE hente en holdkammerats almindelige indsendelse', 'DENY', ()=>hent('spiller','submissions','s-p2'));
await proev('spiller: kan IKKE hente en holdkammerats gamle indsendelse uden duel-felter', 'DENY', ()=>hent('spiller','submissions','s-p2-gammel'));
await proev('spiller: kan IKKE hente en indsendelse i en duel mellem to andre børn', 'DENY', ()=>hent('spiller','submissions','s-p3-duel'));
await proev('spiller: kan IKKE hente en indsendelse i en anden årgang', 'DENY', ()=>hent('spiller','submissions','s-p11'));
await proev('spiller: kan IKKE lytte på årgangens indsendelser', 'DENY', ()=>aar('spiller','submissions','2017'));
await proev('spiller: heller ikke med køn (som før)', 'DENY', ()=>aarKoen('spiller','submissions','2017','dreng'));
await proev('spiller: kan IKKE lytte på en andens indsendelser', 'DENY', ()=>felt('spiller','submissions','playerId','p2'));
await proev('spiller: kan IKKE lytte på en andens dueller (challengerId == p2)', 'DENY', ()=>felt('spiller','submissions','challengerId','p2'));
await proev('spiller: kan IKKE liste samlingen', 'DENY', ()=>getDocs(collection(db('spiller'),'submissions')));
await proev('spillerlogin uden playerId: kan IKKE lytte på indsendelser uden duel (challengerId == null)', 'DENY', ()=>felt('udenId','submissions','challengerId',null));
await proev('spillerlogin uden playerId: kan IKKE hente en almindelig indsendelse', 'DENY', ()=>hent('udenId','submissions','s-p1'));
await proev('demo: lytter på sine egne (tomme) indsendelser', 'ALLOW', ()=>felt('demo','submissions','playerId','p9'));
await proev('demo: kan IKKE lytte på årgangen', 'DENY', ()=>aarKoen('demo','submissions','2017','dreng'));
await proev('træner: lytter på årgangens indsendelser som før', 'ALLOW', ()=>aar('traener','submissions','2017'));
await proev('drengetræner: lytter på drengenes', 'ALLOW', ()=>aarKoen('drenge','submissions','2017','dreng'));
await proev('drengetræner: kan IKKE hente en piges', 'DENY', ()=>hent('drenge','submissions','s-p3-duel'));
await proev('anden årgang: kan IKKE lytte på 2017', 'DENY', ()=>aar('anden','submissions','2017'));
await proev('admin: hele samlingen', 'ALLOW', ()=>getDocs(collection(db('admin'),'submissions')));

console.log('\n--- challenges/: kun egne dueller ---');
await proev('spiller: dueller, man har startet (where challengerId == p1)', 'ALLOW', ()=>felt('spiller','challenges','challengerId','p1'));
await proev('spiller: dueller, man er udfordret i (where opponentId == p1)', 'ALLOW', ()=>felt('spiller','challenges','opponentId','p1'));
await proev('spiller: henter sin egen duel', 'ALLOW', ()=>hent('spiller','challenges','c12'));
await proev('spiller: henter en duel, man er udfordret i', 'ALLOW', ()=>hent('spiller','challenges','c21'));
await proev('spiller: kan IKKE hente en duel mellem to andre børn', 'DENY', ()=>hent('spiller','challenges','c23'));
await proev('spiller: kan IKKE lytte på årgangens dueller', 'DENY', ()=>aar('spiller','challenges','2017'));
await proev('spiller: heller ikke med køn (som før)', 'DENY', ()=>aarKoen('spiller','challenges','2017','dreng'));
await proev('spiller: kan IKKE lytte på en andens dueller', 'DENY', ()=>felt('spiller','challenges','challengerId','p2'));
await proev('spiller: kan IKKE liste samlingen', 'DENY', ()=>getDocs(collection(db('spiller'),'challenges')));
await proev('demo: lytter på sine (tomme) dueller', 'ALLOW', ()=>felt('demo','challenges','opponentId','p9'));
await proev('træner: lytter på årgangens dueller som før', 'ALLOW', ()=>aar('traener','challenges','2017'));
await proev('drengetræner: lytter på drengenes', 'ALLOW', ()=>aarKoen('drenge','challenges','2017','dreng'));
await proev('anden årgang: kan IKKE lytte på 2017', 'DENY', ()=>aar('anden','challenges','2017'));
await proev('admin: hele samlingen', 'ALLOW', ()=>getDocs(collection(db('admin'),'challenges')));

// =====================================================================================
console.log('\n--- Deaktiveret, fremmed og ikke logget ind: intet ---');
for(const k of ['lukket', 'lukketTraener', 'fremmed', 'ude']){
  await proev(`${k}: rangliste for 2017`, 'DENY', ()=>aar(k,'rangliste','2017'));
  await proev(`${k}: en ranglistelinje`, 'DENY', ()=>hent(k,'rangliste','p1'));
  await proev(`${k}: rangliste for 2017 med kanUdfordres`, 'DENY', ()=>aarKoenLogin(k,'2017','dreng'));
  await proev(`${k}: klubbens top 10`, 'DENY', ()=>hent(k,'klubRangliste','top'));
  await proev(`${k}: spillerdokumentet p1`, 'DENY', ()=>hent(k,'players','p1'));
  await proev(`${k}: footwork/p1`, 'DENY', ()=>hent(k,'footwork','p1'));
  await proev(`${k}: juggleLadder/p1`, 'DENY', ()=>hent(k,'juggleLadder','p1'));
  await proev(`${k}: footwork, der ikke findes`, 'DENY', ()=>hent(k,'footwork','p-ny'));
  await proev(`${k}: clubRanking/p1`, 'DENY', ()=>hent(k,'clubRanking','p1'));
  await proev(`${k}: indsendelser (playerId == p1)`, 'DENY', ()=>felt(k,'submissions','playerId','p1'));
  await proev(`${k}: dueller (challengerId == p1)`, 'DENY', ()=>felt(k,'challenges','challengerId','p1'));
  await proev(`${k}: kan ikke skrive ranglisten`, 'DENY', ()=>setDoc(doc(db(k),'rangliste','p1'), linje('p1','2017','dreng',9999)));
  await proev(`${k}: kan ikke skrive klubbens top 10`, 'DENY', ()=>setDoc(doc(db(k),'klubRangliste','top'), {top:[]}));
}

// =====================================================================================
console.log('\n--- Spillerens skrivninger virker stadig, som klienten sender dem ---');
const ts = () => serverTimestamp();
const SP = {year:'2017', gender:'dreng'};
// createChallenge(): addDoc med praecis disse felter.
let nyDuel = null;
await proev('spiller: udfordrer en holdkammerat (fri duel, som createChallenge)', 'ALLOW', async ()=>{
  nyDuel = await addDoc(collection(db('spiller'),'challenges'), {type:'freestyle', title:'Flest jongleringer',
    challengerId:'p1', challengerName:'TEST p1', opponentId:'p2', opponentName:'TEST p2', year:'2017', gender:'dreng', status:'pending', createdAt:ts()});
});
await proev('spiller: udfordrer med en øvelsesduel (som createChallenge)', 'ALLOW', ()=>addDoc(collection(db('spiller'),'challenges'), {type:'exercise',
  exercise:'Finter', stepIndex:0, level:1, medal:'Bronze', challengerId:'p1', challengerName:'TEST p1', opponentId:'p2', opponentName:'TEST p2',
  year:'2017', gender:'dreng', status:'pending', createdAt:ts()}));
await proev('spiller: kan IKKE udfordre i en andens navn', 'DENY', ()=>addDoc(collection(db('spiller'),'challenges'), {type:'freestyle', title:'X',
  challengerId:'p2', challengerName:'TEST p2', opponentId:'p3', opponentName:'TEST p3', year:'2017', gender:'dreng', status:'pending', createdAt:ts()}));
await proev('demo: kan stadig IKKE udfordre', 'DENY', ()=>addDoc(collection(db('demo'),'challenges'), {type:'freestyle', title:'X',
  challengerId:'p9', challengerName:'TEST p9', opponentId:'p1', opponentName:'TEST p1', year:'2017', gender:'dreng', status:'pending', createdAt:ts()}));
await proev('kammeraten ser den nye duel (where opponentId == p2)', 'ALLOW', ()=>felt('kammerat','challenges','opponentId','p2'));
// respondChallenge(): setDoc merge med status + respondedAt.
await proev('kammerat: accepterer duellen (som respondChallenge)', 'ALLOW',
  ()=>setDoc(doc(db('kammerat'),'challenges', nyDuel.id), {status:'active', respondedAt:ts()}, {merge:true}));
await proev('spiller: afslår en duel, man er udfordret i', 'ALLOW',
  ()=>setDoc(doc(db('spiller'),'challenges','c21'), {status:'declined', respondedAt:ts()}, {merge:true}));
await proev('spiller: kan IKKE svare på en duel mellem to andre børn', 'DENY',
  ()=>setDoc(doc(db('spiller'),'challenges','c23'), {status:'declined', respondedAt:ts()}, {merge:true}));
// uploadSubmission(): praecis klientens felter.
const indsendelse = (over={}) => ({playerId:'p1', playerName:'TEST p1', ...SP, exercise:'Finter', stepIndex:0, level:1, medal:'Bronze', status:'pending',
  challengeId:null, challengerId:null, opponentId:null, submittedAt:nu(), createdAt:ts(), ...over});
await proev('spiller: sender en almindelig medaljevideo ind', 'ALLOW', ()=>setDoc(doc(collection(db('spiller'),'submissions')), indsendelse()));
await proev('spiller: sender en duel-video ind', 'ALLOW', ()=>setDoc(doc(collection(db('spiller'),'submissions')), indsendelse({exercise:'Flest jongleringer',
  stepIndex:null, level:null, medal:null, challengeId:nyDuel?.id || 'c12', challengerId:'p1', opponentId:'p2'})));
await proev('spiller: kan stadig ikke sende ind i en andens navn', 'DENY', ()=>setDoc(doc(collection(db('spiller'),'submissions')), indsendelse({playerId:'p2'})));
await proev('demo: kan stadig ikke sende ind', 'DENY', ()=>setDoc(doc(collection(db('demo'),'submissions')), indsendelse({playerId:'p9'})));
// markSubmissionViewed(): modparten markerer en afgjort duel-video som set.
await proev('spiller: markerer modpartens afgjorte duel-video som set', 'ALLOW',
  ()=>setDoc(doc(db('spiller'),'submissions','s-p2-duel'), {viewedAt:ts()}, {merge:true}));
await proev('spiller: kan IKKE markere en video i en andens duel', 'DENY',
  ()=>setDoc(doc(db('spiller'),'submissions','s-p3-duel'), {viewedAt:ts()}, {merge:true}));
// writeFootwork / writeJuggle: allerfoerste registrering for p-ny, og videre for p1.
await proev('ny: første fodteknik-registrering', 'ALLOW', ()=>setDoc(doc(db('ny'),'footwork','p-ny'), {...SP, updatedAt:ts(), days:{[D]:{t:1}}}, {merge:true}));
await proev('ny: læser nu sit eget fodteknik-dokument', 'ALLOW', ()=>hent('ny','footwork','p-ny'));
await proev('ny: første trin på stigen', 'ALLOW', ()=>setDoc(doc(db('ny'),'juggleLadder','p-ny'), {...SP, updatedAt:ts(), mainStep:1, days:[D]}, {merge:true}));
await proev('ny: læser nu sin egen stige', 'ALLOW', ()=>hent('ny','juggleLadder','p-ny'));
await proev('spiller: næste fodteknik-registrering', 'ALLOW', ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...SP, updatedAt:ts(), days:{[D]:{t:2}}}, {merge:true}));
await proev('spiller: søger joker', 'ALLOW', ()=>setDoc(doc(db('spiller'),'footwork','p1'), {...SP, updatedAt:ts(), jokerRequests:{'2026-11-06':true}}, {merge:true}));
await proev('spiller: næste trin på stigen', 'ALLOW', ()=>setDoc(doc(db('spiller'),'juggleLadder','p1'), {...SP, updatedAt:ts(), mainStep:3, days:['2026-11-01', D]}, {merge:true}));
await proev('spiller: kan stadig ikke skrive en andens fodteknik', 'DENY', ()=>setDoc(doc(db('spiller'),'footwork','p2'), {...SP, updatedAt:ts(), days:{[D]:{t:1}}}, {merge:true}));
await proev('spiller: kan stadig ikke skrive en andens stige', 'DENY', ()=>setDoc(doc(db('spiller'),'juggleLadder','p2'), {...SP, updatedAt:ts(), mainStep:15}, {merge:true}));
await proev('spiller: kan stadig ikke skrive sit spillerdokument', 'DENY', ()=>setDoc(doc(db('spiller'),'players','p1'), {points:9999}, {merge:true}));
await proev('spiller: kan stadig ikke skrive den gamle klub-rangliste', 'DENY',
  ()=>setDoc(doc(db('spiller'),'clubRanking','p1'), {name:'TEST p1', year:'2017', points:9999, updatedAt:ts()}));
await proev('træner: skriver stadig den gamle klub-rangliste for sin årgang', 'ALLOW',
  ()=>setDoc(doc(db('traener'),'clubRanking','p1'), {name:'TEST p1', year:'2017', points:25, updatedAt:ts()}));

// Det, der blev skrevet, ligger der - laest uden om reglerne.
let gemt = {};
await env.withSecurityRulesDisabled(async c => {
  const f = c.firestore();
  gemt.duel = (await getDoc(doc(f,'challenges', nyDuel?.id || 'mangler'))).data();
  gemt.fw = (await getDoc(doc(f,'footwork','p-ny'))).data();
  gemt.rang = (await getDoc(doc(f,'rangliste','p1'))).data();
});
ok('den nye duel er accepteret', gemt.duel?.status === 'active');
ok('p-ny har sin første fodteknik-dag', gemt.fw?.days?.[D]?.t === 1);
ok('ranglistelinjen for p1 er urørt', gemt.rang?.total === 10);

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
