// Finder logins i Firebase Authentication uden et users-dokument (fremmede, der oprettede
// sig selv, mens selvoprettelsen var aaben, og logins efter spillere, der er slettet i appen)
// - og users-dokumenter, hvis login mangler.
//
//   node vaerktoej/fremmede-konti.cjs          viser dem; aendrer intet
//   node vaerktoej/fremmede-konti.cjs --slet   sletter logins uden users-dokument og laeser tilbage
//
// Sletter aldrig et login, der har et users-dokument, og aldrig et login, der er under 10
// minutter gammelt (det kan vaere ved at blive oprettet). users-dokumenter roeres ikke.
// Der skrives kun login-id'er, tidspunkter og e-mailens domaene ud - aldrig en hel adresse.
// Kraever tests/service-account.json (se README om noegler).
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { koer } = require('./fremmede-konti-logik.cjs');

const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const app = initializeApp({ credential: cert(require(noegle)) });
const slet = process.argv.includes('--slet');

(async () => {
  console.log(slet ? '=== SLETTER ===' : '=== TOERKOERSEL - intet aendres. Koer med --slet for at slette. ===');
  const r = await koer(getFirestore(app), getAuth(app), { slet });
  r.linjer.forEach(l => console.log(l));
  if (slet) console.log('\nHusk: slet tests/service-account.json nu, og slet noeglen i Google Cloud Console.');
  process.exit(r.ok ? 0 : 1);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
