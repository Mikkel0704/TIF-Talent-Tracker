// Lagerreglerne i lager-emulatoren. Sender det, appen sender: en videofil til
// submissions/{login-id}/..., efterfulgt af et opslag paa filens adresse.
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
const lager = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();
const video = new Uint8Array(1024);
const VID = { contentType: 'video/mp4' };
const sti = 'submissions/u-ejer/1731400000000_klip.mp4';

console.log('\n--- Upload ---');
await proev('barnet uploader til sin egen mappe','ALLOW', ()=>uploadBytes(ref(lager('u-ejer'), sti), video, VID));
await proev('og kan slå filens adresse op bagefter (det gør appen lige efter upload)','ALLOW', ()=>getDownloadURL(ref(lager('u-ejer'), sti)));
await proev('man kan ikke uploade til en andens mappe','DENY', ()=>uploadBytes(ref(lager('u-anden'), 'submissions/u-ejer/2_snyd.mp4'), video, VID));
await proev('man kan ikke uploade til en mappe med et spiller-id (den gamle form)','DENY',
  ()=>uploadBytes(ref(lager('u-ejer'), 'submissions/p-ejer/3_gammel.mp4'), video, VID));
await proev('uden login kan man ikke uploade','DENY', ()=>uploadBytes(ref(lager(null), 'submissions/u-ejer/4_x.mp4'), video, VID));
await proev('kun video - ikke andre filtyper','DENY', ()=>uploadBytes(ref(lager('u-ejer'), 'submissions/u-ejer/5_x.html'), video, {contentType:'text/html'}));
await proev('en fil kan ikke overskrives','DENY', ()=>uploadBytes(ref(lager('u-ejer'), sti), video, VID));
await proev('man kan ikke uploade uden for videomappen','DENY', ()=>uploadBytes(ref(lager('u-ejer'), 'andet/u-ejer/x.mp4'), video, VID));

console.log('\n--- Hvem kan hente og liste ---');
await proev('en anden, der er logget ind, kan ikke hente filen direkte','DENY', ()=>getMetadata(ref(lager('u-anden'), sti)));
await proev('og kan ikke få dens adresse','DENY', ()=>getDownloadURL(ref(lager('u-anden'), sti)));
await proev('ingen kan liste et barns mappe - heller ikke barnet selv','DENY', ()=>listAll(ref(lager('u-ejer'), 'submissions/u-ejer')));
await proev('en anden kan slet ikke','DENY', ()=>listAll(ref(lager('u-anden'), 'submissions/u-ejer')));
await proev('og ingen kan liste hele videomappen','DENY', ()=>listAll(ref(lager('u-anden'), 'submissions')));
await proev('uden login kan man ingenting hente','DENY', ()=>getMetadata(ref(lager(null), sti)));

console.log('\n--- Sletning ---');
await proev('uden login kan man ikke slette','DENY', ()=>deleteObject(ref(lager(null), sti)));
await proev('træneren sletter med den præcise sti (den står kun i submissionVideos)','ALLOW', ()=>deleteObject(ref(lager('u-traener'), sti)));
await env.withSecurityRulesDisabled(async c => { await uploadBytes(ref(c.storage(), 'submissions/p-gammel/9_klip.mp4'), video, VID); });
await proev('en fil i en gammel mappe kan stadig ryddes op med stien','ALLOW', ()=>deleteObject(ref(lager('u-traener'), 'submissions/p-gammel/9_klip.mp4')));

await env.cleanup();
console.log(`\n${r.filter(x=>x[1]).length} / ${r.length} bestået`);
process.exit(r.every(x=>x[1]) ? 0 : 1);
