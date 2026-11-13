// Instruktionsvideoerne: adressen pr. oevelse staar i clubConfig/guideVideos. Alle aktive
// logins skal kunne laese den - ellers er der ingen "Se video"-knap - og kun en
// administrator maa skrive. Skrivningerne har samme form, som appen sender: ét felt
// ad gangen med merge, og deleteField() ved sletning.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteField } from 'firebase/firestore';
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
  spiller:  {uid:'u-sp',    doc:{email:'a@x.invalid', role:'player', playerId:'p1', years:['2017'], active:true, demo:false}},
  demo:     {uid:'u-demo',  doc:{email:'d@x.invalid', role:'player', playerId:'p9', years:['2017'], active:true, demo:true}},
  traener:  {uid:'u-tr',    doc:{email:'t@x.invalid', role:'coach',  years:['2017'], active:true}},
  admin:    {uid:'u-admin', doc:{email:'m@x.invalid', role:'admin',  years:['2017'], active:true}},
  lukket:   {uid:'u-luk',   doc:{email:'l@x.invalid', role:'admin',  years:['2017'], active:false}},
};
await env.withSecurityRulesDisabled(async c => {
  for(const b of Object.values(BRUGERE)) await setDoc(doc(c.firestore(),'users',b.uid), b.doc);
});
const db = k => env.authenticatedContext(BRUGERE[k].uid).firestore();
const maal = k => doc(db(k),'clubConfig','guideVideos');
// Hvad der faktisk staar i databasen, laest uden om reglerne - saa det er indholdet, der
// proeves, og ikke endnu en gang hvem der maa laese.
const gemt = async tjek => { let svar = false;
  await env.withSecurityRulesDisabled(async c => { svar = !!tjek((await getDoc(doc(c.firestore(),'clubConfig','guideVideos'))).data() || {}); });
  return svar; };
const video = n => ({url:'https://eksempel.invalid/guides/f_t/'+n+'.mp4', sti:'guides/f_t/'+n+'.mp4', lagt:new Date().toISOString()});

console.log('\n--- Hvem maa laegge op ---');
await proev('en spiller kan ikke lægge en video ind','DENY', ()=>setDoc(maal('spiller'), {f_t: video(1)}, {merge:true}));
await proev('demo-loginnet kan ikke','DENY', ()=>setDoc(maal('demo'), {f_t: video(1)}, {merge:true}));
await proev('en træner kan ikke','DENY', ()=>setDoc(maal('traener'), {f_t: video(1)}, {merge:true}));
await proev('en deaktiveret administrator kan ikke','DENY', ()=>setDoc(maal('lukket'), {f_t: video(1)}, {merge:true}));
await proev('uden login kan man ikke','DENY', ()=>setDoc(doc(env.unauthenticatedContext().firestore(),'clubConfig','guideVideos'), {f_t: video(1)}, {merge:true}));
await proev('administratoren lægger den første video ind (dokumentet findes ikke endnu)','ALLOW', ()=>setDoc(maal('admin'), {f_t: video(1)}, {merge:true}));
await proev('og én til, uden at røre den første','ALLOW', ()=>setDoc(maal('admin'), {t_oploft: video(2)}, {merge:true}));
await proev('og skifter en ud','ALLOW', ()=>setDoc(maal('admin'), {f_t: video(3)}, {merge:true}));

console.log('\n--- Hvem maa se ---');
await proev('en spiller kan læse adresserne','ALLOW', ()=>getDoc(maal('spiller')));
await proev('demo-loginnet kan','ALLOW', ()=>getDoc(maal('demo')));
await proev('en træner kan','ALLOW', ()=>getDoc(maal('traener')));
await proev('et deaktiveret login kan ikke','DENY', ()=>getDoc(maal('lukket')));
await proev('uden login kan man ikke','DENY', ()=>getDoc(doc(env.unauthenticatedContext().firestore(),'clubConfig','guideVideos')));
ok('begge videoer står der, og den udskiftede er den nye', await gemt(d => d.f_t?.sti === 'guides/f_t/3.mp4' && d.t_oploft?.sti === 'guides/f_t/2.mp4'));

console.log('\n--- Sletning ---');
await proev('en spiller kan ikke fjerne en video','DENY', ()=>setDoc(maal('spiller'), {f_t: deleteField()}, {merge:true}));
await proev('en træner kan ikke','DENY', ()=>setDoc(maal('traener'), {f_t: deleteField()}, {merge:true}));
await proev('administratoren fjerner én','ALLOW', ()=>setDoc(maal('admin'), {f_t: deleteField()}, {merge:true}));
ok('kun den ene er væk', await gemt(d => !('f_t' in d) && !!d.t_oploft));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
