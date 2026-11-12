// Ruller ../storage.rules ud til videoboetten, laeser dem tilbage, og saetter boettens
// egen slettefrist: alt under submissions/ slettes af Google efter 8 dage, uanset hvad
// appen goer. Det er dét, der faar loeftet om 7 dage til at holde, ogsaa naar en
// oprydning i en browser aldrig naar at koere.
//
//   node vaerktoej/udrul-lager.cjs --tjek   viser kun, hvad der ligger live
//   node vaerktoej/udrul-lager.cjs          ruller ud
//
// Kraever tests/service-account.json (se README om noegler).
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getSecurityRules } = require('firebase-admin/security-rules');
const { getStorage } = require('firebase-admin/storage');

const BOETTE = 'tif-talent-tracker';
const FRIST = { action: { type: 'Delete' }, condition: { age: 8, matchesPrefix: ['submissions/'] } };
const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const kilde = fs.readFileSync(path.join(__dirname, '..', '..', 'storage.rules'), 'utf8');
const app = initializeApp({ credential: cert(require(noegle)) });
const rules = getSecurityRules(app);
const kunTjek = process.argv.includes('--tjek');
const erFristen = r => r?.action?.type === 'Delete' && r?.condition?.age === 8 && (r.condition.matchesPrefix || []).includes('submissions/');

(async () => {
  // --- regler ---
  let live = null;
  try { live = (await rules.getStorageRuleset(BOETTE)).source.map(f => f.content).join(''); }
  catch (e) { console.log('Kunne ikke laese lagerreglerne for boetten:', e.message); }
  console.log('lagerregler live:', live === null ? 'UKENDT' : live === kilde ? 'ENS med filen i repoet' : 'AFVIGER fra filen i repoet');
  if (!kunTjek && live !== kilde) {
    const ruleset = await rules.createRuleset(rules.createRulesFileFromSource('storage.rules', kilde));
    await rules.releaseStorageRuleset(ruleset, BOETTE);
    const efter = (await rules.getStorageRuleset(BOETTE)).source.map(f => f.content).join('');
    console.log(efter === kilde ? 'Lagerregler rullet ud og laest tilbage: ENS.' : 'FEJL: det, der ligger live, er ikke det, der blev sendt.');
    if (efter !== kilde) process.exit(1);
  }

  // --- slettefrist ---
  const bucket = getStorage(app).bucket(BOETTE);
  try {
    const [meta] = await bucket.getMetadata();
    const nu = meta.lifecycle?.rule || [];
    console.log('slettefrist paa boetten:', nu.some(erFristen) ? 'SAT (8 dage under submissions/)' : 'IKKE sat', nu.length ? `· ${nu.length} regel/regler i alt` : '');
    console.log('boettens placering:', meta.location, '·', meta.locationType);
    if (!kunTjek && !nu.some(erFristen)) {
      // Eksisterende regler bevares; fristen laegges til.
      await bucket.setMetadata({ lifecycle: { rule: [...nu, FRIST] } });
      const [efter] = await bucket.getMetadata();
      console.log((efter.lifecycle?.rule || []).some(erFristen) ? 'Slettefrist sat og laest tilbage.' : 'FEJL: slettefristen staar der ikke efter skrivningen.');
    }
  } catch (e) {
    console.log('\nKunne ikke laese eller saette slettefristen:', e.message);
    console.log('Noeglen har formentlig ikke lov til at aendre boetten. Saet den i haanden i stedet:');
    console.log('  Google Cloud Console -> Cloud Storage -> Buckets -> ' + BOETTE + ' -> Lifecycle -> Add a rule');
    console.log('  Action: Delete object · Condition: Age 8 days · Object name matches prefix: submissions/');
  }
  process.exit(0);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
