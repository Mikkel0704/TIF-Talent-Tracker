// Ruller ../firestore.rules ud til det rigtige projekt og laeser dem tilbage bagefter.
//
// Kraever en service-noegle i tests/service-account.json. Noeglen gaar uden om ALLE
// regler, saa: lav en frisk i Firebase Console hver gang, slet filen bagefter, og slet
// selve noeglen i Google Cloud Console (IAM -> Service Accounts -> Keys). .gitignore
// holder filen ude af repoet, men det er ikke en grund til at lade den ligge.
//
//   node vaerktoej/udrul-regler.cjs          ruller ud
//   node vaerktoej/udrul-regler.cjs --tjek   sammenligner kun, aendrer intet
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getSecurityRules } = require('firebase-admin/security-rules');

const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const kilde = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
const app = initializeApp({ credential: cert(require(noegle)) });
const rules = getSecurityRules(app);
const kunTjek = process.argv.includes('--tjek');

(async () => {
  const foer = (await rules.getFirestoreRuleset()).source.map(f => f.content).join('');
  console.log('live lige nu:', foer === kilde ? 'ENS med filen i repoet' : 'AFVIGER fra filen i repoet');
  if (kunTjek) process.exit(foer === kilde ? 0 : 2);
  if (foer === kilde) { console.log('Intet at rulle ud.'); process.exit(0); }
  const ruleset = await rules.createRuleset(rules.createRulesFileFromSource('firestore.rules', kilde));
  await rules.releaseFirestoreRuleset(ruleset);
  const efter = await rules.getFirestoreRuleset();
  const ens = efter.source.map(f => f.content).join('') === kilde;
  console.log(ens ? 'Rullet ud og laest tilbage: ENS.' : 'FEJL: det, der ligger live, er ikke det, der blev sendt.');
  console.log('ruleset:', efter.name, '|', efter.createTime);
  console.log('\nHusk: slet tests/service-account.json nu, og slet noeglen i Google Cloud Console.');
  process.exit(ens ? 0 : 1);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
