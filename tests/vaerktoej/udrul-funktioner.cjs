// Ruller Cloud Functions (../../functions) ud til det rigtige projekt og laeser bagefter
// tilbage, hvilke funktioner der ligger live. Pointkoden laves forfra ud fra index.html
// (functions/byg.mjs) foerst - og igen som predeploy i ../../firebase.json.
//
// Kraever en service-noegle i tests/service-account.json (se udrul-regler.cjs om noegler:
// lav en frisk, slet filen bagefter, og slet noeglen i Google Cloud Console). Noeglen
// bruges af firebase-vaerktoejet gennem GOOGLE_APPLICATION_CREDENTIALS.
//
//   node vaerktoej/udrul-funktioner.cjs --tjek   viser kun, hvad der ligger live, aendrer intet
//   node vaerktoej/udrul-funktioner.cjs          ruller ud uden at spoerge (--non-interactive --force)
//
// Bagefter: node vaerktoej/genberegn-rangliste.cjs (toerkoersel) og --udfoer, saa alle linjer
// findes og er regnet med de nye regler.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const PROJEKT = 'tif-talent-tracker';
const rod = path.join(__dirname, '..', '..');
const funktioner = path.join(rod, 'functions');
const firebase = path.join(__dirname, '..', 'node_modules', '.bin', 'firebase');
const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
if (!fs.existsSync(firebase)) { console.error('Mangler firebase-vaerktoejet - koer npm install i tests/'); process.exit(1); }
const env = { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: noegle };
const kunTjek = process.argv.includes('--tjek');

const koer = (cmd, args, valg = {}) => {
  const r = spawnSync(cmd, args, { cwd: rod, env, stdio: 'inherit', ...valg });
  if (r.status !== 0) { console.error(`FEJL: ${path.basename(cmd)} ${args.join(' ')} sluttede med ${r.status}`); process.exit(1); }
  return r;
};

async function live() {
  const r = spawnSync(firebase, ['functions:list', '--project', PROJEKT, '--json'], { cwd: rod, env, encoding: 'utf8' });
  let svar;
  try { svar = JSON.parse(r.stdout); } catch { console.error(r.stdout, r.stderr); throw new Error('kunne ikke laese listen over funktioner'); }
  if (svar.status !== 'success') throw new Error(svar.error || 'functions:list fejlede');
  return (svar.result || []).map(f => ({ id: f.id || f.entryPoint || String(f.name || '').split('/').pop(), region: f.region, platform: f.platform }));
}

(async () => {
  if (!fs.existsSync(path.join(funktioner, 'node_modules'))) koer('npm', ['ci'], { cwd: funktioner });
  koer(process.execPath, [path.join(funktioner, 'byg.mjs')]);
  const forventet = Object.keys(await import(pathToFileURL(path.join(funktioner, 'index.js')).href)).sort();
  const vis = async () => {
    const l = await live();
    l.forEach(f => console.log(`  ${f.id}  ${f.region || ''}  ${f.platform || ''}`));
    const mangler = forventet.filter(n => !l.some(f => f.id === n && f.region === 'europe-west1'));
    console.log(mangler.length ? 'MANGLER live i europe-west1: ' + mangler.join(', ') : `Alle ${forventet.length} funktioner ligger live i europe-west1.`);
    return mangler.length === 0;
  };
  console.log('I repoet: ' + forventet.join(', ') + '\nLive lige nu:');
  const foer = await vis();
  if (kunTjek) process.exit(foer ? 0 : 2);

  // --non-interactive: vaerktoejet koeres uden en terminal, der kan svare paa spoergsmaal.
  // --force: saetter oprydningsreglen for de byggede billeder (slettes efter 1 dag), som
  // firebase ellers SPOERGER om - og uden et svar ender udrulningen som en fejl, selv om
  // funktionerne er lagt op. Med --only functions roerer --force kun funktioner i dette repo.
  koer(firebase, ['deploy', '--only', 'functions', '--project', PROJEKT, '--non-interactive', '--force']);
  console.log('\nLaest tilbage:');
  const efter = await vis();
  console.log('\nHusk: koer vaerktoej/genberegn-rangliste.cjs, og slet saa tests/service-account.json og noeglen i Google Cloud Console.');
  process.exit(efter ? 0 : 1);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
