// Giver aktive administratorer lov til at laegge instruktionsvideoer i lageret - og tager
// tilladelsen fra dem, der ikke laengere er administratorer.
//
// Koeres efter udrulning af lagerreglerne, og igen hver gang en administrator kommer
// til eller holder op. Indtil da kan en ny administrator alt andet i appen, men ikke
// uploade en instruktionsvideo (appen siger det med en besked).
//
//   node vaerktoej/saet-admin-maerke.cjs            toerkoersel: viser hvad der ville ske
//   node vaerktoej/saet-admin-maerke.cjs --udfoer   goer det
//
// Der skrives kun login-id'er ud, ingen e-mailadresser.
// Kraever tests/service-account.json (se README om noegler).
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { planlaegAdminMaerker, nyeMaerker } = require('./admin-maerke-logik.cjs');

const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const app = initializeApp({ credential: cert(require(noegle)) });
const udfoer = process.argv.includes('--udfoer');

(async () => {
  console.log(udfoer ? '=== UDFOERER ===' : '=== TOERKOERSEL - intet aendres. Koer med --udfoer for at goere det. ===');
  const auth = getAuth(app);

  const brugere = (await getFirestore(app).collection('users').get()).docs
    .map(d => ({ uid: d.id, role: d.data().role, active: d.data().active }));
  const logins = [];
  let side;
  do {
    const svar = await auth.listUsers(1000, side);
    svar.users.forEach(u => logins.push({ uid: u.uid, claims: u.customClaims || {} }));
    side = svar.pageToken;
  } while (side);

  const plan = planlaegAdminMaerker(brugere, logins);
  const claimsFor = uid => (logins.find(l => l.uid === uid) || {}).claims;
  console.log(`\nAdministratorer i appen: ${plan.saet.length + plan.uaendret.length + plan.mangler.length}`);
  console.log(`  har allerede maerket: ${plan.uaendret.length}`);
  console.log(`  faar maerket ${udfoer ? 'nu' : '(ville faa)'}: ${plan.saet.length}`); plan.saet.forEach(u => console.log('    +', u));
  console.log(`  mister maerket ${udfoer ? 'nu' : '(ville miste)'}: ${plan.fjern.length}`); plan.fjern.forEach(u => console.log('    -', u));
  if (plan.mangler.length) { console.log(`  staar som administrator, men har intet login: ${plan.mangler.length}`); plan.mangler.forEach(u => console.log('    ?', u)); }

  if (udfoer) {
    for (const uid of plan.saet) await auth.setCustomUserClaims(uid, nyeMaerker(claimsFor(uid), true));
    for (const uid of plan.fjern) await auth.setCustomUserClaims(uid, nyeMaerker(claimsFor(uid), false));
    // Laes tilbage: det er serverens svar, der taeller, ikke at kaldet ikke fejlede.
    let galt = 0;
    for (const uid of plan.saet) if (((await auth.getUser(uid)).customClaims || {}).admin !== true) { galt++; console.log('  IKKE SAT:', uid); }
    for (const uid of plan.fjern) if ('admin' in ((await auth.getUser(uid)).customClaims || {})) { galt++; console.log('  IKKE FJERNET:', uid); }
    console.log(galt ? `\n${galt} aendring(er) slog ikke igennem.` : '\nLaest tilbage: alt er, som det skal vaere.');
    console.log('Et login faar foerst maerket med, naar dets bevis fornyes. Appen fornyer det selv ved naeste upload.');
    if (galt) process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
