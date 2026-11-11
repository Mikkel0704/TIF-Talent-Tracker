// Reproducerer "missing or insufficient permissions" med PRAECIS det, index.html sender.
// Hver sag faar sin EGEN bruger og sin EGEN spiller, saa playerId altid passer - ellers
// maaler man bare, at man skriver paa en andens dokument.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId:'tif-talent-tracker',
  firestore:{ host:'127.0.0.1', port:8890, rules: fs.readFileSync(new URL("../../firestore.rules", import.meta.url),'utf8') }});
await env.clearFirestore();
const r=[]; const ok=(n,b,d)=>{r.push([n,b]);console.log((b?'PASS':'FAIL')+' - '+n+(d?' :: '+d:''));};
const proev=async(n,f,fn)=>{try{f==='ALLOW'?await assertSucceeds(fn()):await assertFails(fn());ok(n,true);}catch(e){ok(n,false,(e.message||'').split('\n')[0].slice(0,100));}};

// sag -> {uid, pid}. Alle i aargang 2017, dreng, bortset fra "udenKoen".
const SAGER = ['hoved','trick','svagt','alle','fodteknik','joker','udenKoen','udenYearGenders'];
await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  for(const s of SAGER){
    const doc_ = {email:s+'@x.invalid', role:'player', playerId:'p-'+s, years:['2017'], active:true, demo:false};
    if(s !== 'udenYearGenders') doc_.yearGenders = {'2017':'dreng'};
    await setDoc(doc(db,'users','u-'+s), doc_);
    const spiller = {name:'TEST '+s, year:'2017', points:0};
    if(s !== 'udenKoen') spiller.gender = 'dreng';
    await setDoc(doc(db,'players','p-'+s), spiller);
  }
});
const db = s => env.authenticatedContext('u-'+s).firestore();
const nu = new Date();
// Praecis som writeJuggle(): ét fremdriftsfelt + aargang + koen + tidsstempel + datoliste.
const klient = (s, felt, gender='dreng') => Object.assign({year:'2017', gender, updatedAt:nu, days:['2026-11-07']}, felt);

console.log('\n--- Jongleringsstigen: allerfoerste registrering, som klienten sender den ---');
await proev('trin 1 paa hovedstigen (KUN mainStep)','ALLOW',
  ()=>setDoc(doc(db('hoved'),'juggleLadder','p-hoved'), klient('hoved',{mainStep:1}), {merge:true}));
await proev('et trick (KUN tricks)','ALLOW',
  ()=>setDoc(doc(db('trick'),'juggleLadder','p-trick'), klient('trick',{tricks:['oploft']}), {merge:true}));
await proev('daarligt ben (KUN weakStep)','ALLOW',
  ()=>setDoc(doc(db('svagt'),'juggleLadder','p-svagt'), klient('svagt',{weakStep:1}), {merge:true}));
await proev('alle tre felter paa én gang (som den gamle test gjorde)','ALLOW',
  ()=>setDoc(doc(db('alle'),'juggleLadder','p-alle'), klient('alle',{mainStep:1,weakStep:0,tricks:[]}), {merge:true}));

console.log('\n--- Spillere med huller i profilen ---');
await proev('players.gender mangler, saa klienten sender gender:null','ALLOW',
  ()=>setDoc(doc(db('udenKoen'),'juggleLadder','p-udenKoen'), klient('udenKoen',{mainStep:1}, null), {merge:true}));
await proev('brugeren har ingen yearGenders overhovedet','ALLOW',
  ()=>setDoc(doc(db('udenYearGenders'),'juggleLadder','p-udenYearGenders'), klient('udenYearGenders',{mainStep:1}), {merge:true}));

console.log('\n--- Fodteknik, samme spoergsmaal ---');
await proev('foerste registrering (KUN days)','ALLOW',
  ()=>setDoc(doc(db('fodteknik'),'footwork','p-fodteknik'), {year:'2017',gender:'dreng',updatedAt:nu,days:{'2026-11-07':{t:1}}}, {merge:true}));
await proev('foerste joker-anmodning (KUN jokerRequests)','ALLOW',
  ()=>setDoc(doc(db('joker'),'footwork','p-joker'), {year:'2017',gender:'dreng',updatedAt:nu,jokerRequests:{'2026-11-06':true}}, {merge:true}));

console.log('\n--- Loftet skal stadig holde, selv om felterne nu er valgfrie ---');
const L = (felt) => setDoc(doc(db('hoved'),'juggleLadder','p-hoved'), klient('hoved',felt), {merge:true});
await proev('mainStep over 15 afvises','DENY', ()=>L({mainStep:99}));
await proev('negativt mainStep afvises','DENY', ()=>L({mainStep:-1}));
await proev('mainStep som tekst afvises','DENY', ()=>L({mainStep:'3'}));
await proev('weakStep over 10 afvises','DENY', ()=>L({weakStep:99}));
await proev('mere end 6 tricks afvises','DENY', ()=>L({tricks:['a','b','c','d','e','f','g']}));
await proev('tricks som tekst afvises','DENY', ()=>L({tricks:'oploft'}));
await proev('mere end 400 datoer afvises','DENY',
  ()=>setDoc(doc(db('hoved'),'juggleLadder','p-hoved'),
    {year:'2017',gender:'dreng',updatedAt:nu,mainStep:2,days:Array.from({length:401},(_,i)=>'d'+i)}, {merge:true}));
await proev('et point-felt kan stadig ikke smugles med','DENY',
  ()=>setDoc(doc(db('hoved'),'juggleLadder','p-hoved'), Object.assign(klient('hoved',{mainStep:2}),{points:999}), {merge:true}));
await proev('en spiller kan stadig ikke skrive paa en ANDENS stige','DENY',
  ()=>setDoc(doc(db('hoved'),'juggleLadder','p-trick'), klient('hoved',{mainStep:1}), {merge:true}));

console.log('\n--- Et helt forloeb paa ét dokument, trin for trin ---');
await proev('trin 2','ALLOW', ()=>L({mainStep:2}));
await proev('trin 3','ALLOW', ()=>L({mainStep:3}));
await proev('et trick oveni','ALLOW', ()=>L({tricks:['oploft']}));
await proev('og saa daarligt ben','ALLOW', ()=>L({weakStep:1}));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
