// Mappen til instruktionsvideoer i lager-emulatoren. Lagerreglerne kan ikke slaa roller
// op, saa alt haenger paa maerket "admin" paa selve loginnet. Her proeves baade med og
// uden maerket - og med et maerke, der har en forkert vaerdi.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getDownloadURL, getMetadata, deleteObject, listAll } from 'firebase/storage';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'tif-talent-tracker',
  storage: { host: '127.0.0.1', port: 8891, rules: fs.readFileSync(new URL("../../storage.rules", import.meta.url), 'utf8') }
});
await env.clearStorage();
const r = []; const ok = (n,b,d)=>{ r.push([n,b]); console.log((b?'PASS':'FAIL')+' - '+n+(d?' :: '+d:'')); };
const proev = async (n, forvent, fn) => {
  try { forvent==='ALLOW' ? await assertSucceeds(fn()) : await assertFails(fn()); ok(n,true); }
  catch(e){ ok(n,false,(e.message||'').split('\n')[0].slice(0,120)); }
};
const admin   = () => env.authenticatedContext('u-admin', {admin:true}).storage();
const traener = () => env.authenticatedContext('u-traener').storage();          // intet maerke
const falsk   = () => env.authenticatedContext('u-falsk', {admin:'true'}).storage(); // tekst, ikke sandt/falsk
const nej     = () => env.authenticatedContext('u-nej', {admin:false}).storage();
const ingen   = () => env.unauthenticatedContext().storage();
const video = new Uint8Array(1024);
const VID = { contentType: 'video/mp4' };
const sti = 'guides/f_t/1731400000000_toetaps.mp4';

console.log('\n--- Upload ---');
await proev('et login uden mærket kan ikke lægge en video i mappen','DENY', ()=>uploadBytes(ref(traener(), sti), video, VID));
await proev('et mærke med værdien falsk giver ingen adgang','DENY', ()=>uploadBytes(ref(nej(), sti), video, VID));
await proev('et mærke skrevet som tekst giver ingen adgang','DENY', ()=>uploadBytes(ref(falsk(), sti), video, VID));
await proev('uden login kan man ikke','DENY', ()=>uploadBytes(ref(ingen(), sti), video, VID));
await proev('administratoren lægger videoen op','ALLOW', ()=>uploadBytes(ref(admin(), sti), video, VID));
await proev('og kan slå dens adresse op bagefter (det gør appen lige efter upload)','ALLOW', ()=>getDownloadURL(ref(admin(), sti)));
await proev('kun video - ikke andre filtyper','DENY', ()=>uploadBytes(ref(admin(), 'guides/f_t/2_side.html'), video, {contentType:'text/html'}));
await proev('en fil kan ikke overskrives - heller ikke af administratoren','DENY', ()=>uploadBytes(ref(admin(), sti), video, VID));
await proev('en video over 100 MB afvises','DENY', ()=>uploadBytes(ref(admin(), 'guides/f_t/3_stor.mp4'), new Uint8Array(100*1024*1024 + 1), VID));
await proev('mærket giver ikke adgang til at lægge filer andre steder','DENY', ()=>uploadBytes(ref(admin(), 'andet/f_t/4_x.mp4'), video, VID));
await proev('eller til en anden spillers videomappe','DENY', ()=>uploadBytes(ref(admin(), 'submissions/u-ejer/5_x.mp4'), video, VID));

console.log('\n--- Hvem kan hente og liste ---');
await proev('et login uden mærket kan ikke hente filen direkte','DENY', ()=>getMetadata(ref(traener(), sti)));
await proev('og kan ikke få dens adresse - den kommer fra clubConfig, ikke fra lageret','DENY', ()=>getDownloadURL(ref(traener(), sti)));
await proev('uden login kan man ingenting hente','DENY', ()=>getMetadata(ref(ingen(), sti)));
await proev('ingen kan liste mappen - heller ikke administratoren','DENY', ()=>listAll(ref(admin(), 'guides/f_t')));
await proev('og ikke hele mappen med instruktionsvideoer','DENY', ()=>listAll(ref(traener(), 'guides')));

console.log('\n--- Sletning ---');
await proev('et login uden mærket kan ikke slette en instruktionsvideo, selv med den præcise sti','DENY', ()=>deleteObject(ref(traener(), sti)));
await proev('uden login kan man ikke','DENY', ()=>deleteObject(ref(ingen(), sti)));
await proev('administratoren sletter den','ALLOW', ()=>deleteObject(ref(admin(), sti)));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
