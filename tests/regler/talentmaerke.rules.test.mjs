// Talentmaerket slaaet fra pr. aargang - haandhaevet paa serveren, ikke kun i menuen.
// Det afgoerende her er, at en SKJULT fane ikke er en spaerring: testene gaar uden om
// brugerfladen og skriver direkte, praecis som en teknisk kyndig person ville.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
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

// AAR_TIL kører Talentmærket. AAR_FRA gør ikke.
const AAR_TIL = '2017', AAR_FRA = '2014';
const BRUGERE = {
  spillerTil: {uid:'u-sp-til', doc:{email:'a@x.invalid', role:'player', playerId:'pt', years:[AAR_TIL], active:true, demo:false}},
  spillerFra: {uid:'u-sp-fra', doc:{email:'b@x.invalid', role:'player', playerId:'pf', years:[AAR_FRA], active:true, demo:false}},
  traenerFra: {uid:'u-tr-fra', doc:{email:'t@x.invalid', role:'coach',  years:[AAR_FRA], active:true}},
  admin:      {uid:'u-admin',  doc:{email:'m@x.invalid', role:'admin',  years:[AAR_TIL,AAR_FRA], active:true}},
};
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  for(const b of Object.values(BRUGERE)) await setDoc(doc(db,'users',b.uid), b.doc);
  await setDoc(doc(db,'players','pt'), {name:'TEST Til', year:AAR_TIL, gender:'dreng', points:0, passed:{}});
  await setDoc(doc(db,'players','pf'), {name:'TEST Fra', year:AAR_FRA, gender:'dreng', points:0, passed:{}});
});
const db = k => env.authenticatedContext(BRUGERE[k].uid).firestore();

const medalje = (pid, year) => ({playerId:pid, playerName:'TEST', year, gender:'dreng',
  exercise:'Præcision', stepIndex:0, level:1, medal:'Bronze', status:'pending', challengeId:null,
  videoPath:'x', videoURL:'y', submittedAt:new Date().toISOString()});
const friDuel = (pid, year) => ({playerId:pid, playerName:'TEST', year, gender:'dreng',
  exercise:'Flest jongleringer', stepIndex:null, level:null, medal:null, status:'pending',
  challengeId:'c1', videoPath:'x', videoURL:'y', submittedAt:new Date().toISOString()});

// ---------- før indstillingen findes overhovedet ----------
await proev('uden clubConfig-dokumentet er alt som før: medaljevideo tilladt','ALLOW',
  ()=>setDoc(doc(db('spillerTil'),'submissions','s0'), medalje('pt', AAR_TIL)));

// ---------- admin slår fra ----------
await proev('kun admin må skrive modul-indstillingen','DENY',
  ()=>setDoc(doc(db('traenerFra'),'clubConfig','modules'), {talentmaerke:{[AAR_FRA]:false}}));
await proev('en spiller kan ikke slå Talentmærket til for sig selv','DENY',
  ()=>setDoc(doc(db('spillerFra'),'clubConfig','modules'), {talentmaerke:{[AAR_FRA]:true}}));
await proev('admin slår det fra for én årgang','ALLOW',
  ()=>setDoc(doc(db('admin'),'clubConfig','modules'), {talentmaerke:{[AAR_FRA]:false}}));
await proev('alle aktive logins må læse indstillingen','ALLOW',
  ()=>getDoc(doc(db('spillerFra'),'clubConfig','modules')));

// ---------- selve spærringen ----------
await proev('den SLUKKEDE årgang kan ikke sende en medaljevideo ind','DENY',
  ()=>setDoc(doc(db('spillerFra'),'submissions','s1'), medalje('pf', AAR_FRA)));
await proev('men den må gerne sende en FRI duel-video (option C)','ALLOW',
  ()=>setDoc(doc(db('spillerFra'),'submissions','s2'), friDuel('pf', AAR_FRA)));
await proev('den TÆNDTE årgang er upåvirket','ALLOW',
  ()=>setDoc(doc(db('spillerTil'),'submissions','s3'), medalje('pt', AAR_TIL)));

await proev('den slukkede årgang kan ikke oprette en ØVELSES-duel','DENY',
  ()=>setDoc(doc(db('spillerFra'),'challenges','c-ex'), {type:'exercise', exercise:'Finter', stepIndex:0,
    challengerId:'pf', opponentId:'pt', year:AAR_FRA, gender:'dreng', status:'pending'}));
await proev('men gerne en FRI duel','ALLOW',
  ()=>setDoc(doc(db('spillerFra'),'challenges','c-fri'), {type:'freestyle', title:'Flest jongleringer',
    challengerId:'pf', opponentId:'pt', year:AAR_FRA, gender:'dreng', status:'pending'}));
await proev('en duel uden "type" behandles som en øvelsesduel og afvises','DENY',
  ()=>setDoc(doc(db('spillerFra'),'challenges','c-ukendt'), {exercise:'Finter', stepIndex:0,
    challengerId:'pf', opponentId:'pt', year:AAR_FRA, gender:'dreng', status:'pending'}));

// ---------- træneren kan heller ikke sætte flueben ----------
await proev('træneren kan ikke sætte et medalje-flueben i den slukkede årgang','DENY',
  ()=>setDoc(doc(db('traenerFra'),'players','pf'), {passed:{'0_Præcision':true}}, {merge:true}));
await proev('træneren kan ikke uddele en medalje','DENY',
  ()=>setDoc(doc(db('traenerFra'),'players','pf'), {medals:{'0':{at:'nu'}}}, {merge:true}));
await proev('men point må stadig gives - en fri duel giver bonus','ALLOW',
  ()=>setDoc(doc(db('traenerFra'),'players','pf'), {points:25}, {merge:true}));
await proev('og navn/note må stadig rettes','ALLOW',
  ()=>setDoc(doc(db('traenerFra'),'players','pf'), {name:'TEST Fra II'}, {merge:true}));

// ---------- slået til igen ----------
await proev('admin slår det til igen ved at fjerne årgangen','ALLOW',
  ()=>setDoc(doc(db('admin'),'clubConfig','modules'), {talentmaerke:{}}, {merge:false}));
await proev('nu virker medaljevideoen igen','ALLOW',
  ()=>setDoc(doc(db('spillerFra'),'submissions','s4'), medalje('pf', AAR_FRA)));
await proev('og fluebenet virker igen','ALLOW',
  ()=>setDoc(doc(db('traenerFra'),'players','pf'), {passed:{'0_Præcision':true}}, {merge:true}));

// ---------- den gamle faelde: manglende felt maa ikke naegte alt ----------
await env.withSecurityRulesDisabled(async c =>
  await setDoc(doc(c.firestore(),'clubConfig','modules'), {noget:'andet'}, {merge:false}));
await proev('et dokument UDEN talentmaerke-feltet betyder slået til, ikke nægtet','ALLOW',
  ()=>setDoc(doc(db('spillerTil'),'submissions','s5'), medalje('pt', AAR_TIL)));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
