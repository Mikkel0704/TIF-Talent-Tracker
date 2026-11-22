// Haerdning af reglerne. Hvert hul, der blev fundet i emulatoren, faar her en test, der
// viser, at det er lukket - og ved siden af en test, der viser, at den rigtige brug
// stadig virker. Skrivningerne har samme form som index.html: ét felt ad gangen med
// {merge:true}, hvor klienten goer det, og hele dokumentet, hvor klienten goer det.
//
// Rollerne:
//   fremmed      - en Auth-konto UDEN users-dokument (alle kan oprette en i projektet)
//   lukketTraener/lukketSpiller - users-dokument med active:false
//   traener      - traener i 2017, begge koen
//   drenge       - traener i 2017, kun drenge (yearGenders)
//   anden        - traener i 2011
//   admin, spiller (p1), ny (p-ny, har endnu ingen log), demo (p9)
//
// Gemte data laeses KUN gennem withSecurityRulesDisabled - aldrig med en bar getDoc
// gennem et regelstyret login uden for assertSucceeds/assertFails. Det har efterladt en
// aaben forbindelse, der vaeltede naeste testfils clearFirestore().
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, serverTimestamp, deleteField } from 'firebase/firestore';
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
  admin:         {uid:'u-admin',   doc:{email:'a@x.invalid', role:'admin', years:['2017'], active:true}},
  traener:       {uid:'u-traener', doc:{email:'t@x.invalid', role:'coach', years:['2017'], yearGenders:{'2017':'begge'}, active:true}},
  drenge:        {uid:'u-drenge',  doc:{email:'dr@x.invalid', role:'coach', years:['2017'], yearGenders:{'2017':'dreng'}, active:true}},
  anden:         {uid:'u-anden',   doc:{email:'x@x.invalid', role:'coach', years:['2011'], active:true}},
  lukketTraener: {uid:'u-lukT',    doc:{email:'lt@x.invalid', role:'coach', years:['2017'], active:false}},
  // Den deaktiverede spiller ER p1 - saa alle "egne" dokumenter er rigtige egne dokumenter.
  lukketSpiller: {uid:'u-lukS',    doc:{email:'ls@x.invalid', role:'player', playerId:'p1', years:['2017'], yearGenders:{'2017':'dreng'}, active:false, demo:false}},
  lukketSpiller2:{uid:'u-lukS2',   doc:{email:'ls2@x.invalid', role:'player', playerId:'p2', years:['2017'], active:false}},
  spiller:       {uid:'u-spiller', doc:{email:'s@x.invalid', role:'player', playerId:'p1', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:false}},
  ny:            {uid:'u-ny',      doc:{email:'n@x.invalid', role:'player', playerId:'p-ny', years:['2017'], yearGenders:{'2017':'dreng'}, active:true}},   // intet demo-felt
  demo:          {uid:'u-demo',    doc:{email:'d@x.invalid', role:'player', playerId:'p9', years:['2017'], yearGenders:{'2017':'dreng'}, active:true, demo:true}},
};
const FREMMED_UID = 'u-fremmed';   // ingen users-dokument

const D = '2026-11-07';
const nu = () => new Date().toISOString();
// Seed: alt hvad et barn kan have liggende, for p1 og p2 (2017 drenge), p3 (2017 pige),
// p-gammel (2017, INTET gender-felt), p-uaar (intet year og intet gender).
const LOG = (year, gender) => ({year, gender, updatedAt:new Date(), entries:[{t:'main', v:1, at:'2026-11-01T10:00:00Z', by:'u-x'}]});
const FLOG = (year, gender) => ({year, gender, updatedAt:new Date(), entries:[], reasons:{'2026-11-05':{tekst:'syg', at:'2026-11-05T10:00:00Z', by:'u-x'}}});
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  for(const b of Object.values(B)) await setDoc(doc(db,'users',b.uid), b.doc);
  const boern = {p1:['2017','dreng'], p2:['2017','dreng'], p3:['2017','pige'], p11:['2011','dreng']};
  for(const [pid,[year,gender]] of Object.entries(boern)){
    await setDoc(doc(db,'players',pid), {name:'TEST '+pid, year, gender, points:0, passed:{}});
    await setDoc(doc(db,'playerNotes',pid), {note:'hemmelig note', year, gender, updatedAt:new Date(), updatedBy:'t@x.invalid'});
    await setDoc(doc(db,'footwork',pid), {year, gender, updatedAt:new Date(), days:{'2026-11-01':{t:1}}});
    await setDoc(doc(db,'footworkLog',pid), FLOG(year, gender));
    await setDoc(doc(db,'juggleLadder',pid), {year, gender, updatedAt:new Date(), mainStep:2});
    await setDoc(doc(db,'juggleLog',pid), LOG(year, gender));
    await setDoc(doc(db,'clubRanking',pid), {name:'TEST '+pid, year, points:10, updatedAt:new Date()});
  }
  // Gamle dokumenter fra foer koen blev denormaliseret: intet gender-felt.
  await setDoc(doc(db,'players','p-gammel'), {name:'TEST gammel', year:'2017', points:0});
  await setDoc(doc(db,'playerNotes','p-gammel'), {note:'gammel', year:'2017', updatedAt:new Date()});
  await setDoc(doc(db,'footwork','p-gammel'), {year:'2017', updatedAt:new Date(), days:{}});
  await setDoc(doc(db,'footworkLog','p-gammel'), {year:'2017', updatedAt:new Date(), entries:[]});
  await setDoc(doc(db,'juggleLadder','p-gammel'), {year:'2017', updatedAt:new Date(), mainStep:1});
  await setDoc(doc(db,'juggleLog','p-gammel'), {year:'2017', updatedAt:new Date(), entries:[]});
  await setDoc(doc(db,'clubRanking','p-gammel'), {name:'TEST gammel', year:'2017', points:0, updatedAt:new Date()});
  // Endnu aeldre: hverken year eller gender. Saa er det kun admin.
  await setDoc(doc(db,'footwork','p-uaar'), {days:{}});
  await setDoc(doc(db,'clubRanking','p-uaar'), {name:'TEST uaar', points:0});
  await setDoc(doc(db,'players','p-ny'), {name:'TEST ny', year:'2017', gender:'dreng', points:0});

  await setDoc(doc(db,'submissions','s1'), {playerId:'p1', playerName:'TEST p1', year:'2017', gender:'dreng', exercise:'Finter',
    stepIndex:0, level:1, medal:'Bronze', status:'pending', challengeId:null, challengerId:null, opponentId:null, submittedAt:nu(), createdAt:new Date()});
  await setDoc(doc(db,'submissionVideos','s1'), {playerId:'p1', year:'2017', gender:'dreng', videoURL:'https://x.invalid/v', videoPath:'submissions/u-spiller/1.mp4',
    challengeId:null, challengerId:null, opponentId:null, decided:false, submittedAt:nu(), createdAt:new Date()});
  await setDoc(doc(db,'challenges','c1'), {type:'freestyle', challengerId:'p1', opponentId:'p2', year:'2017', gender:'dreng', status:'pending'});
  await setDoc(doc(db,'clubConfig','modules'), {talentmaerke:{}});
  await setDoc(doc(db,'maanedensSpiller','2025-01_2017'), {maaned:'2025-01', aargang:'2017', beregnet:new Date(),
    vindere:[{id:'p1', navn:'A', point:60}, {id:'p2', navn:'B', point:50}, {id:'p3', navn:'C', point:40}]});
  await setDoc(doc(db,'maanedensTopscorer','2025-01_2017'), {maaned:'2025-01', aargang:'2017', beregnet:new Date(),
    vindere:[{id:'p2', navn:'B', point:90, oevelser:20, svaer:1, mellem:2, let:3, starter:4}]});
  await setDoc(doc(db,'deletionRequests','p1'), {playerId:'p1', status:'pending', requestedAt:new Date()});
});
const db = k => k === 'fremmed' ? env.authenticatedContext(FREMMED_UID).firestore() : env.authenticatedContext(B[k].uid).firestore();
const gemt = async (sti) => { let d; await env.withSecurityRulesDisabled(async c => { d = (await getDoc(doc(c.firestore(), sti))).data(); }); return d; };

// Praecis de felter, uploadSubmission() sender efter aendringen (uden submittedBy).
const indsendelse = (over={}) => ({playerId:'p1', playerName:'TEST p1', year:'2017', gender:'dreng',
  exercise:'Finter', stepIndex:0, level:1, medal:'Bronze', status:'pending',
  challengeId:null, challengerId:null, opponentId:null, submittedAt:nu(), createdAt:serverTimestamp(), ...over});

// =====================================================================================
console.log('\n--- A. Fremmed og deaktiverede logins: ingenting, nogen steder ---');
// Pr. samling: et eksisterende dokument at laese/slette, og den skrivning, der ville
// vaere lovlig for et aktivt login af samme slags.
const AARG = {year:'2017', gender:'dreng'};
const SAMLINGER = {
  players:          {id:'p1', skriv:()=>({points:5, updatedAt:serverTimestamp()}), merge:true},
  playerNotes:      {id:'p1', skriv:()=>({note:'ny', ...AARG, updatedAt:serverTimestamp(), updatedBy:''})},
  submissions:      {id:'s1', nyId:true, skriv:()=>indsendelse()},
  submissionVideos: {id:'s1', nyId:true, skriv:()=>({playerId:'p1', ...AARG, videoURL:'https://x.invalid/y', videoPath:'submissions/x/2.mp4',
                      challengeId:null, challengerId:null, opponentId:null, decided:false, submittedAt:nu(), createdAt:serverTimestamp()})},
  challenges:       {id:'c1', nyId:true, skriv:()=>({type:'freestyle', challengerId:'p1', opponentId:'p2', ...AARG, status:'pending'})},
  footwork:         {id:'p1', skriv:()=>({...AARG, updatedAt:serverTimestamp(), days:{[D]:{t:1}}}), merge:true},
  footworkLog:      {id:'p1', skriv:()=>({...AARG, updatedAt:serverTimestamp(), entries:[]}), merge:true},
  juggleLadder:     {id:'p1', skriv:()=>({...AARG, updatedAt:serverTimestamp(), mainStep:3}), merge:true},
  juggleLog:        {id:'p1', skriv:()=>({...AARG, updatedAt:serverTimestamp(), entries:[]}), merge:true},
  clubRanking:      {id:'p1', skriv:()=>({name:'X', year:'2017', points:9999, updatedAt:serverTimestamp()})},
  clubConfig:       {id:'modules', skriv:()=>({talentmaerke:{'2017':false}}), merge:true},
  maanedensSpiller: {id:'2025-01_2017', nyId:'2025-02_2017', skriv:()=>({maaned:'2025-02', aargang:'2017', vindere:[], beregnet:serverTimestamp()})},
  maanedensTopscorer: {id:'2025-01_2017', nyId:'2025-02_2017', skriv:()=>({maaned:'2025-02', aargang:'2017', vindere:[], beregnet:serverTimestamp()})},
  deletionRequests: {id:'p1', skriv:()=>({playerId:'p1', status:'pending', requestedAt:serverTimestamp()})},
};
const UDEN_AAR = new Set(['clubConfig', 'maanedensSpiller', 'maanedensTopscorer', 'deletionRequests']);
for(const k of ['fremmed', 'lukketTraener', 'lukketSpiller']){
  for(const [s, c] of Object.entries(SAMLINGER)){
    await proev(`${k}: kan ikke læse ${s}`, 'DENY', ()=>getDoc(doc(db(k), s, c.id)));
    await proev(`${k}: kan ikke lytte på ${s}`, 'DENY', ()=>getDocs(UDEN_AAR.has(s) ? collection(db(k), s)
      : query(collection(db(k), s), where('year','==','2017'))));
    const id = c.nyId === true ? `ny-${k}` : (c.nyId || c.id);
    await proev(`${k}: kan ikke skrive ${s}`, 'DENY', ()=>setDoc(doc(db(k), s, id), c.skriv(), c.merge ? {merge:true} : undefined));
    await proev(`${k}: kan ikke slette ${s}`, 'DENY', ()=>deleteDoc(doc(db(k), s, c.id)));
  }
}
await proev('deaktiveret spiller kan ikke oprette en sletteanmodning (dokumentet findes ikke)', 'DENY',
  ()=>setDoc(doc(db('lukketSpiller2'), 'deletionRequests', 'p2'), {playerId:'p2', status:'pending', requestedAt:serverTimestamp()}));
await proev('fremmed: kan ikke "slette" et dokument, der ikke findes', 'DENY', ()=>deleteDoc(doc(db('fremmed'), 'playerNotes', 'findes-ikke')));
await proev('deaktiveret træner: kan ikke "slette" et dokument, der ikke findes', 'DENY', ()=>deleteDoc(doc(db('lukketTraener'), 'clubRanking', 'findes-ikke')));
await proev('fremmed: kan ikke læse brugerdokumenter', 'DENY', ()=>getDoc(doc(db('fremmed'), 'users', B.traener.uid)));
await proev('fremmed: kan ikke oprette sit eget brugerdokument', 'DENY',
  ()=>setDoc(doc(db('fremmed'), 'users', FREMMED_UID), {role:'admin', years:['2017'], active:true}));
await proev('deaktiveret træner: kan ikke aktivere sig selv igen', 'DENY',
  ()=>setDoc(doc(db('lukketTraener'), 'users', B.lukketTraener.uid), {active:true}, {merge:true}));
// Undtagelsen: klienten skal kunne se "din adgang er deaktiveret".
await proev('deaktiveret træner: MÅ læse sit eget brugerdokument', 'ALLOW', ()=>getDoc(doc(db('lukketTraener'), 'users', B.lukketTraener.uid)));
await proev('deaktiveret spiller: MÅ læse sit eget brugerdokument', 'ALLOW', ()=>getDoc(doc(db('lukketSpiller'), 'users', B.lukketSpiller.uid)));
await proev('fremmed: må slå sit eget (manglende) brugerdokument op', 'ALLOW', ()=>getDoc(doc(db('fremmed'), 'users', FREMMED_UID)));
await proev('deaktiveret træner: kan ikke læse andres brugerdokument', 'DENY', ()=>getDoc(doc(db('lukketTraener'), 'users', B.traener.uid)));
const note = await gemt('playerNotes/p1');
ok('trænernoten til p1 ligger der stadig, uændret', note?.note === 'hemmelig note');

// =====================================================================================
console.log('\n--- B. En træner fra en anden årgang kan ikke overtage et barns dokumenter ---');
const OVERTAG = ['playerNotes', 'footworkLog', 'juggleLog', 'footwork', 'juggleLadder'];
for(const s of OVERTAG){
  await proev(`anden årgang: kan ikke flette sin årgang ind på ${s}`, 'DENY',
    ()=>setDoc(doc(db('anden'), s, 'p1'), {year:'2011', gender:'dreng'}, {merge:true}));
  await proev(`anden årgang: kan ikke slette ${s}`, 'DENY', ()=>deleteDoc(doc(db('anden'), s, 'p1')));
}
await proev('anden årgang: kan heller ikke overskrive noten helt (som saveNote)', 'DENY',
  ()=>setDoc(doc(db('anden'), 'playerNotes', 'p1'), {note:'x', year:'2011', gender:'dreng', updatedAt:serverTimestamp(), updatedBy:'x@x.invalid'}));
await proev('anden årgang: kan ikke give et barn 9999 point på klub-ranglisten', 'DENY',
  ()=>setDoc(doc(db('anden'), 'clubRanking', 'p1'), {name:'TEST p1', year:'2017', points:9999, updatedAt:serverTimestamp()}));
await proev('anden årgang: kan ikke flytte barnet til sin egen årgang på ranglisten', 'DENY',
  ()=>setDoc(doc(db('anden'), 'clubRanking', 'p1'), {name:'TEST p1', year:'2011', points:9999, updatedAt:serverTimestamp()}));
await proev('anden årgang: kan ikke slette barnet fra ranglisten', 'DENY', ()=>deleteDoc(doc(db('anden'), 'clubRanking', 'p1')));
await proev('anden årgang: kan ikke oprette en ranglisteplads i en årgang, den ikke har', 'DENY',
  ()=>setDoc(doc(db('anden'), 'clubRanking', 'k-ny2017'), {name:'X', year:'2017', points:1, updatedAt:serverTimestamp()}));
await proev('anden årgang: kan stadig skrive ranglisten for sin egen årgang', 'ALLOW',
  ()=>setDoc(doc(db('anden'), 'clubRanking', 'p11'), {name:'TEST p11', year:'2011', points:30, updatedAt:serverTimestamp()}));
await proev('drengetræneren kan ikke flette "dreng" ind på en piges fodteknik', 'DENY',
  ()=>setDoc(doc(db('drenge'), 'footwork', 'p3'), {year:'2017', gender:'dreng'}, {merge:true}));
await proev('drengetræneren kan ikke flette "dreng" ind på en piges note', 'DENY',
  ()=>setDoc(doc(db('drenge'), 'playerNotes', 'p3'), {note:'x', year:'2017', gender:'dreng', updatedAt:serverTimestamp(), updatedBy:''}));
await proev('en træner kan ikke flytte et barn ud af sin egen årgang til en, den ikke har', 'DENY',
  ()=>setDoc(doc(db('traener'), 'footwork', 'p2'), {year:'2011'}, {merge:true}));
const fw = await gemt('footwork/p1');
ok('p1\'s fodteknik ligger stadig i 2017', fw?.year === '2017');
const rang = await gemt('clubRanking/p1');
ok('p1\'s ranglisteplads er uændret', rang?.points === 10 && rang?.year === '2017');

// =====================================================================================
console.log('\n--- B. Årgangens egen træner: oprette, rette og slette som klienten gør ---');
// Hvert barn her har ingen dokumenter, foer testen opretter dem.
const ts = () => serverTimestamp();
const traenerSkriv = {
  // saveNote: hele dokumentet, uden merge.
  playerNotes:  (k, y, g) => setDoc(doc(db(k), 'playerNotes', y), {note:'god til finter', year:'2017', gender:g, updatedAt:ts(), updatedBy:'t@x.invalid'}),
  // decideFootworkJoker -> writeFootwork: footwork med jokers, merge.
  footwork:     (k, y, g) => setDoc(doc(db(k), 'footwork', y), {year:'2017', gender:g, updatedAt:ts(), jokers:{[D]:'approved'}}, {merge:true}),
  // samme kald, loggen: entries + reasons, merge.
  footworkLog:  (k, y, g) => setDoc(doc(db(k), 'footworkLog', y), {year:'2017', gender:g, updatedAt:ts(),
                  entries:[{d:D, e:'joker', til:'godkendt', at:nu(), by:'u-t', af:'t@x.invalid'}],
                  reasons:{[D]:{afgjort:'approved', afgjortAf:'t@x.invalid', afgjortAt:nu()}}}, {merge:true}),
  juggleLadder: (k, y, g) => setDoc(doc(db(k), 'juggleLadder', y), {year:'2017', gender:g, updatedAt:ts(), mainStep:4}, {merge:true}),
  juggleLog:    (k, y, g) => setDoc(doc(db(k), 'juggleLog', y), {year:'2017', gender:g, updatedAt:ts(), entries:[{t:'correct', v:4, at:nu(), by:'u-t'}]}, {merge:true}),
  // syncClubRanking: hele dokumentet, uden merge. Intet koen.
  clubRanking:  (k, y) => setDoc(doc(db(k), 'clubRanking', y), {name:'TEST '+y, year:'2017', points:25, updatedAt:ts()}),
};
for(const [s, skriv] of Object.entries(traenerSkriv)){
  await proev(`træner: opretter ${s} (første skrivning, dokumentet findes ikke)`, 'ALLOW', ()=>skriv('traener', 'k1', 'dreng'));
  await proev(`træner: retter ${s} med samme form`, 'ALLOW', ()=>skriv('traener', 'k1', 'dreng'));
  await proev(`træner: sletter ${s}`, 'ALLOW', ()=>deleteDoc(doc(db('traener'), s, 'k1')));
  if(s === 'clubRanking') continue;
  await proev(`drengetræner: opretter ${s} for en dreng`, 'ALLOW', ()=>skriv('drenge', 'k2', 'dreng'));
  await proev(`drengetræner: retter ${s} for en dreng`, 'ALLOW', ()=>skriv('drenge', 'k2', 'dreng'));
  await proev(`drengetræner: sletter ${s} for en dreng`, 'ALLOW', ()=>deleteDoc(doc(db('drenge'), s, 'k2')));
  await proev(`drengetræner: kan ikke oprette ${s} for en pige`, 'DENY', ()=>skriv('drenge', 'k3', 'pige'));
  await proev(`drengetræner: kan ikke rette ${s} for en pige`, 'DENY', ()=>skriv('drenge', 'p3', 'pige'));
  await proev(`drengetræner: kan ikke slette ${s} for en pige`, 'DENY', ()=>deleteDoc(doc(db('drenge'), s, 'p3')));
  // Et gammelt dokument uden gender. Klienten sender gender:null, naar spilleren ikke har et.
  await proev(`træner: retter et GAMMELT ${s} uden gender-felt`, 'ALLOW', ()=>skriv('traener', 'p-gammel', null));
}
await proev('træner: retter en gammel ranglisteplads', 'ALLOW', ()=>traenerSkriv.clubRanking('traener', 'p-gammel'));
await proev('træner: sletter et gammelt dokument uden gender-felt', 'ALLOW', ()=>deleteDoc(doc(db('traener'), 'juggleLog', 'p-gammel')));
// Rydningen af joker-begrundelser sender hverken year eller gender - kun reasons.
await proev('træner: rydder en joker-begrundelse (kun reasons + updatedAt, merge)', 'ALLOW',
  ()=>setDoc(doc(db('traener'), 'footworkLog', 'p2'), {reasons:{'2026-11-05':{tekst:deleteField()}}, updatedAt:ts()}, {merge:true}));
await proev('træner: kan ikke rette et dokument UDEN årgang (kun admin)', 'DENY',
  ()=>setDoc(doc(db('traener'), 'footwork', 'p-uaar'), {year:'2017', gender:'dreng', jokers:{[D]:'approved'}}, {merge:true}));
await proev('træner: kan ikke rette en ranglisteplads uden årgang (kun admin)', 'DENY',
  ()=>setDoc(doc(db('traener'), 'clubRanking', 'p-uaar'), {name:'X', year:'2017', points:1, updatedAt:ts()}));
await proev('træner: kan stadig lytte på årgangens fodteknik-log', 'ALLOW', ()=>getDocs(query(collection(db('traener'), 'footworkLog'), where('year','==','2017'))));
await proev('træner: kan stadig lytte på årgangens stige-log', 'ALLOW', ()=>getDocs(query(collection(db('traener'), 'juggleLog'), where('year','==','2017'))));
await proev('træner: kan stadig lytte på årgangens noter', 'ALLOW', ()=>getDocs(query(collection(db('traener'), 'playerNotes'), where('year','==','2017'))));
await proev('drengetræner: kan stadig lytte på drengenes fodteknik-log', 'ALLOW',
  ()=>getDocs(query(collection(db('drenge'), 'footworkLog'), where('year','==','2017'), where('gender','==','dreng'))));
await proev('træner: kan læse en begrundelse i sin årgang', 'ALLOW', ()=>getDoc(doc(db('traener'), 'footworkLog', 'p1')));
await proev('anden årgang: kan ikke læse begrundelsen', 'DENY', ()=>getDoc(doc(db('anden'), 'footworkLog', 'p1')));

// =====================================================================================
console.log('\n--- B. Admin må det hele ---');
for(const [s, skriv] of Object.entries(traenerSkriv)){
  await proev(`admin: opretter ${s}`, 'ALLOW', ()=>skriv('admin', 'k5', 'pige'));
  await proev(`admin: retter ${s}`, 'ALLOW', ()=>skriv('admin', 'k5', 'pige'));
  await proev(`admin: sletter ${s}`, 'ALLOW', ()=>deleteDoc(doc(db('admin'), s, 'k5')));
  // "Slet alt" sletter blindt - ogsaa dokumenter, barnet aldrig fik.
  await proev(`admin: "sletter" ${s}, der aldrig fandtes, uden fejl`, 'ALLOW', ()=>deleteDoc(doc(db('admin'), s, 'aldrig')));
}
await proev('admin: flytter et barn til en anden årgang', 'ALLOW', ()=>setDoc(doc(db('admin'), 'footwork', 'p11'), {year:'2017', gender:'dreng'}, {merge:true}));
await proev('admin: retter et dokument uden årgang', 'ALLOW', ()=>setDoc(doc(db('admin'), 'footwork', 'p-uaar'), {year:'2017', gender:'dreng'}, {merge:true}));
await proev('admin: retter en ranglisteplads uden årgang', 'ALLOW', ()=>setDoc(doc(db('admin'), 'clubRanking', 'p-uaar'), {name:'X', year:'2017', points:1, updatedAt:ts()}));
await proev('admin: sletter et barn i en årgang, admin ikke står på', 'ALLOW', ()=>deleteDoc(doc(db('admin'), 'playerNotes', 'p11')));

// =====================================================================================
console.log('\n--- D. Spilleren læser kun sine EGNE logge ---');
await proev('spiller: læser sin egen fodteknik-log', 'ALLOW', ()=>getDoc(doc(db('spiller'), 'footworkLog', 'p1')));
await proev('spiller: læser sin egen stige-log', 'ALLOW', ()=>getDoc(doc(db('spiller'), 'juggleLog', 'p1')));
await proev('ny spiller: lytter på sin fodteknik-log, før den findes', 'ALLOW', ()=>getDoc(doc(db('ny'), 'footworkLog', 'p-ny')));
await proev('ny spiller: lytter på sin stige-log, før den findes', 'ALLOW', ()=>getDoc(doc(db('ny'), 'juggleLog', 'p-ny')));
await proev('spiller: kan IKKE læse et andet barns fodteknik-log (begrundelser)', 'DENY', ()=>getDoc(doc(db('spiller'), 'footworkLog', 'p2')));
await proev('spiller: kan IKKE læse et andet barns stige-log', 'DENY', ()=>getDoc(doc(db('spiller'), 'juggleLog', 'p2')));
await proev('spiller: kan IKKE lytte på årgangens fodteknik-logge', 'DENY',
  ()=>getDocs(query(collection(db('spiller'), 'footworkLog'), where('year','==','2017'), where('gender','==','dreng'))));
await proev('spiller: heller ikke uden køn i forespørgslen', 'DENY', ()=>getDocs(query(collection(db('spiller'), 'footworkLog'), where('year','==','2017'))));
await proev('spiller: kan IKKE lytte på årgangens stige-logge', 'DENY',
  ()=>getDocs(query(collection(db('spiller'), 'juggleLog'), where('year','==','2017'), where('gender','==','dreng'))));
await proev('spiller: kan ikke liste hele samlingen', 'DENY', ()=>getDocs(collection(db('spiller'), 'juggleLog')));
await proev('demo: læser sin egen (manglende) fodteknik-log', 'ALLOW', ()=>getDoc(doc(db('demo'), 'footworkLog', 'p9')));
await proev('demo: læser sin egen (manglende) stige-log', 'ALLOW', ()=>getDoc(doc(db('demo'), 'juggleLog', 'p9')));
await proev('demo: kan IKKE læse et andet barns fodteknik-log', 'DENY', ()=>getDoc(doc(db('demo'), 'footworkLog', 'p1')));
await proev('demo: kan IKKE lytte på årgangens stige-logge', 'DENY', ()=>getDocs(query(collection(db('demo'), 'juggleLog'), where('year','==','2017'), where('gender','==','dreng'))));
// Foer laeste en spiller hele klubbens fremdrift, aargangens spillere og den gamle
// klub-rangliste. Nu regner serveren ranglisten (rangliste/ og klubRangliste/ - se
// rangliste.rules.test.mjs), og spilleren laeser kun sine egne dokumenter.
await proev('spiller: kan IKKE længere liste hele samlingen af fodteknik-tal', 'DENY', ()=>getDocs(collection(db('spiller'), 'footwork')));
await proev('spiller: kan IKKE længere liste hele stigesamlingen', 'DENY', ()=>getDocs(collection(db('spiller'), 'juggleLadder')));
await proev('spiller: kan IKKE længere lytte på årgangens spillere', 'DENY', ()=>getDocs(query(collection(db('spiller'), 'players'), where('year','==','2017'), where('gender','==','dreng'))));
await proev('spiller: læser sit eget spillerdokument', 'ALLOW', ()=>getDoc(doc(db('spiller'), 'players', 'p1')));
await proev('spiller: kan IKKE længere læse den gamle klub-rangliste', 'DENY', ()=>getDocs(collection(db('spiller'), 'clubRanking')));
await proev('træner: læser den gamle klub-rangliste for sin årgang', 'ALLOW', ()=>getDocs(query(collection(db('traener'), 'clubRanking'), where('year','==','2017'))));

console.log('\n--- D. Spilleren skriver stadig sine egne logge, som klienten gør ---');
const SP = {year:'2017', gender:'dreng'};
// registerFootwork -> writeFootwork: foerst footwork, saa loggen. Allerfoerste gang.
await proev('ny: første fodteknik-registrering', 'ALLOW',
  ()=>setDoc(doc(db('ny'), 'footwork', 'p-ny'), {...SP, updatedAt:ts(), days:{[D]:{t:1}}}, {merge:true}));
await proev('ny: første fodteknik-log (dokumentet findes ikke)', 'ALLOW',
  ()=>setDoc(doc(db('ny'), 'footworkLog', 'p-ny'), {...SP, updatedAt:ts(), entries:[{d:D, k:'t', til:1, at:nu(), by:'u-ny'}]}, {merge:true}));
// requestFootworkJoker: jokerRequests paa footwork, entries + reasons paa loggen.
await proev('ny: søger joker', 'ALLOW',
  ()=>setDoc(doc(db('ny'), 'footwork', 'p-ny'), {...SP, updatedAt:ts(), jokerRequests:{'2026-11-06':true}}, {merge:true}));
await proev('ny: skriver begrundelsen i loggen', 'ALLOW',
  ()=>setDoc(doc(db('ny'), 'footworkLog', 'p-ny'), {...SP, updatedAt:ts(),
    entries:[{d:'2026-11-06', e:'joker', til:'søgt', at:nu(), by:'u-ny'}], reasons:{'2026-11-06':{tekst:'syg', at:nu(), by:'u-ny'}}}, {merge:true}));
// cancelFootworkJoker: deleteField paa begge.
await proev('ny: trækker jokeren tilbage', 'ALLOW',
  ()=>setDoc(doc(db('ny'), 'footwork', 'p-ny'), {...SP, updatedAt:ts(), jokerRequests:{'2026-11-06':deleteField()}}, {merge:true}));
await proev('ny: fjerner begrundelsen igen', 'ALLOW',
  ()=>setDoc(doc(db('ny'), 'footworkLog', 'p-ny'), {...SP, updatedAt:ts(),
    entries:[{d:'2026-11-06', e:'joker', til:'trukket tilbage', at:nu(), by:'u-ny'}], reasons:{'2026-11-06':deleteField()}}, {merge:true}));
// writeJuggle: stigen med ét fremdriftsfelt + days, saa loggen.
await proev('ny: første trin på stigen', 'ALLOW',
  ()=>setDoc(doc(db('ny'), 'juggleLadder', 'p-ny'), {...SP, updatedAt:ts(), mainStep:1, days:[D]}, {merge:true}));
await proev('ny: første stige-log (dokumentet findes ikke)', 'ALLOW',
  ()=>setDoc(doc(db('ny'), 'juggleLog', 'p-ny'), {...SP, updatedAt:ts(), entries:[{t:'main', v:1, at:nu(), by:'u-ny'}]}, {merge:true}));
await proev('ny: næste trin i loggen', 'ALLOW',
  ()=>setDoc(doc(db('ny'), 'juggleLog', 'p-ny'), {...SP, updatedAt:ts(), entries:[{t:'main', v:2, at:nu(), by:'u-ny'}]}, {merge:true}));
await proev('ny: læser nu sin egen log', 'ALLOW', ()=>getDoc(doc(db('ny'), 'juggleLog', 'p-ny')));
await proev('spiller: kan stadig ikke skrive i et andet barns log', 'DENY',
  ()=>setDoc(doc(db('spiller'), 'footworkLog', 'p2'), {...SP, updatedAt:ts(), entries:[]}, {merge:true}));
await proev('spiller: kan ikke slette sin egen log', 'DENY', ()=>deleteDoc(doc(db('spiller'), 'footworkLog', 'p1')));
await proev('spiller: kan ikke slette sin egen fodteknik', 'DENY', ()=>deleteDoc(doc(db('spiller'), 'footwork', 'p1')));
await proev('demo: kan stadig ikke skrive i sin log', 'DENY',
  ()=>setDoc(doc(db('demo'), 'juggleLog', 'p9'), {...SP, updatedAt:ts(), entries:[]}, {merge:true}));
await proev('spiller: kan ikke skrive klub-ranglisten', 'DENY',
  ()=>setDoc(doc(db('spiller'), 'clubRanking', 'p1'), {name:'TEST p1', year:'2017', points:9999, updatedAt:ts()}));

// =====================================================================================
console.log('\n--- C. Månedens spiller: admin må kun fjerne vindere ---');
const M = '2025-01_2017';
const vinder = (id) => ({id, navn:'X', point:1});
await proev('admin: fjerner én vinder (merge: vindere + rettet)', 'ALLOW',
  ()=>setDoc(doc(db('admin'), 'maanedensSpiller', M), {vindere:[vinder('p1'), vinder('p3')], rettet:serverTimestamp()}, {merge:true}));
const efter = await gemt('maanedensSpiller/' + M);
ok('listen er nu to lang, og måned/årgang er urørt', efter?.vindere?.length === 2 && efter?.maaned === '2025-01' && efter?.aargang === '2017');
await proev('admin: kan ikke gøre listen længere', 'DENY',
  ()=>setDoc(doc(db('admin'), 'maanedensSpiller', M), {vindere:[vinder('p1'), vinder('p3'), vinder('p2')], rettet:serverTimestamp()}, {merge:true}));
await proev('admin: kan ikke bytte en vinder ud (samme længde)', 'DENY',
  ()=>setDoc(doc(db('admin'), 'maanedensSpiller', M), {vindere:[vinder('p1'), vinder('p2')], rettet:serverTimestamp()}, {merge:true}));
await proev('admin: kan ikke ændre måneden', 'DENY',
  ()=>setDoc(doc(db('admin'), 'maanedensSpiller', M), {vindere:[vinder('p1')], maaned:'2025-02', rettet:serverTimestamp()}, {merge:true}));
await proev('admin: kan ikke ændre årgangen', 'DENY',
  ()=>setDoc(doc(db('admin'), 'maanedensSpiller', M), {vindere:[vinder('p1')], aargang:'2016', rettet:serverTimestamp()}, {merge:true}));
await proev('admin: kan ikke ændre beregnet', 'DENY',
  ()=>setDoc(doc(db('admin'), 'maanedensSpiller', M), {vindere:[vinder('p1')], beregnet:serverTimestamp()}, {merge:true}));
await proev('admin: vindere skal være en liste', 'DENY',
  ()=>setDoc(doc(db('admin'), 'maanedensSpiller', M), {vindere:null, rettet:serverTimestamp()}, {merge:true}));
await proev('træner med hele årgangen: kan ikke fjerne en vinder', 'DENY',
  ()=>setDoc(doc(db('traener'), 'maanedensSpiller', M), {vindere:[vinder('p1')], rettet:serverTimestamp()}, {merge:true}));
await proev('spiller: kan ikke fjerne en vinder', 'DENY',
  ()=>setDoc(doc(db('spiller'), 'maanedensSpiller', M), {vindere:[vinder('p1')], rettet:serverTimestamp()}, {merge:true}));
await proev('admin: fjerner den sidste vinder igen (to -> én -> ingen)', 'ALLOW',
  ()=>setDoc(doc(db('admin'), 'maanedensSpiller', M), {vindere:[vinder('p1')], rettet:serverTimestamp()}, {merge:true}));
await proev('admin: ... og så den sidste', 'ALLOW',
  ()=>setDoc(doc(db('admin'), 'maanedensSpiller', M), {vindere:[], rettet:serverTimestamp()}, {merge:true}));

// =====================================================================================
console.log('\n--- E. Indsendelser: præcis klientens felter ---');
await proev('spiller: sender en medaljevideo ind i præcis klientens form', 'ALLOW',
  ()=>setDoc(doc(db('spiller'), 'submissions', 'e1'), indsendelse()));
await proev('spiller: sender en duel-video ind i præcis klientens form', 'ALLOW',
  ()=>setDoc(doc(db('spiller'), 'submissions', 'e2'), indsendelse({exercise:'Flest jongleringer', stepIndex:null, level:null, medal:null,
    challengeId:'c1', challengerId:'p1', opponentId:'p2'})));
await proev('spiller: samme plus submittedBy (en forælders mail) afvises', 'DENY',
  ()=>setDoc(doc(db('spiller'), 'submissions', 'e3'), indsendelse({submittedBy:'mor@x.invalid'})));
await proev('spiller: samme plus et selvvalgt videoURL afvises', 'DENY',
  ()=>setDoc(doc(db('spiller'), 'submissions', 'e4'), indsendelse({videoURL:'https://ondt.invalid/x'})));
await proev('spiller: samme plus videoPath afvises', 'DENY',
  ()=>setDoc(doc(db('spiller'), 'submissions', 'e5'), indsendelse({videoPath:'submissions/x/y.mp4'})));
await proev('spiller: samme plus pointsAwarded afvises', 'DENY',
  ()=>setDoc(doc(db('spiller'), 'submissions', 'e6'), indsendelse({pointsAwarded:999})));
await proev('spiller: kan stadig ikke sende i en andens navn', 'DENY',
  ()=>setDoc(doc(db('spiller'), 'submissions', 'e7'), indsendelse({playerId:'p2'})));
await proev('demo: kan stadig ikke sende ind', 'DENY',
  ()=>setDoc(doc(db('demo'), 'submissions', 'e8'), indsendelse({playerId:'p9'})));
await proev('træneren afgør stadig indsendelsen (merge)', 'ALLOW',
  ()=>setDoc(doc(db('traener'), 'submissions', 'e1'), {status:'approved', reviewedBy:'t@x.invalid', reviewedAt:serverTimestamp(), pointsAwarded:25}, {merge:true}));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
