// Lukker Firebase Authentications aabne selvoprettelse: i dag kan enhver med den offentlige
// API-noegle fra index.html oprette en konto i projektet. Logins oprettes nu af serveren
// (opretLogin), saa klienterne behoever det ikke laengere.
//
// RUL FUNKTIONERNE UD FOERST (udrul-funktioner.cjs) og kontroller, at administratoren kan
// oprette et login fra appen. Lukkes der, foer appen kalder serveren, kan ingen oprette logins.
//
//   node vaerktoej/luk-selvoprettelse.cjs --tjek     viser kun, om der er aabent; aendrer intet
//   node vaerktoej/luk-selvoprettelse.cjs --bevis    proever udefra at oprette en konto (sletter
//                                                    den straks igen, hvis det lykkes)
//   node vaerktoej/luk-selvoprettelse.cjs --udfoer   lukker, laeser tilbage og beviser det udefra
//
// Uden flag: som --tjek. Kraever, at projektet er opgraderet til Identity Platform - ellers
// stopper vaerktoejet med en besked og aendrer intet (se luk-selvoprettelse-logik.cjs).
// Noeglen skal kunne laese og skrive Auth-konfigurationen (firebaseauth.configs.get og
// .update, fx rollen Firebase Authentication Admin) og slette en bruger.
// Der skrives ingen e-mailadresser ud.
// Kraever tests/service-account.json (se README om noegler).
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { adresser, koer } = require('./luk-selvoprettelse-logik.cjs');

const PROJEKT = 'tif-talent-tracker';
const APPENS_ADRESSE = 'https://mikkel0704.github.io/TIF-Talent-Tracker/';
const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const apiNoegle = (/apiKey:\s*"([^"]+)"/.exec(html) || [])[1];
if (!apiNoegle) { console.error('Fandt ikke apiKey i index.html'); process.exit(1); }
const app = initializeApp({ credential: cert(require(noegle)) });
const udfoer = process.argv.includes('--udfoer');
const bevis = process.argv.includes('--bevis');

// Et kald med projektets noegle (OAuth-adgangsbevis fra service-noeglen).
async function kald(url, { method = 'GET', body } = {}) {
  const { access_token } = await app.options.credential.getAccessToken();
  const r = await fetch(url, { method, body, headers: { authorization: 'Bearer ' + access_token, 'content-type': 'application/json' } });
  return { status: r.status, tekst: await r.text() };
}

(async () => {
  console.log(udfoer ? '=== UDFOERER ===' : bevis ? '=== BEVIS - opretter og sletter hoejst én proevekonto ===' : '=== TJEK - intet aendres ===');
  const r = await koer({ udfoer, bevis, kald, hent: fetch, adr: adresser({ projekt: PROJEKT }), apiNoegle, referer: APPENS_ADRESSE,
    sletBruger: uid => getAuth(app).deleteUser(uid) });
  r.linjer.forEach(l => console.log(l));
  if (udfoer || bevis) console.log('\nHusk: slet tests/service-account.json nu, og slet noeglen i Google Cloud Console.');
  process.exit(r.ok ? 0 : r.stop || udfoer || bevis ? 1 : 2);
})().catch(e => {
  console.error('FEJL:', e.message);
  if (e.status === 403) console.error('Noeglen maa ikke laese/skrive Auth-konfigurationen (kraever firebaseauth.configs.get/.update, fx rollen Firebase Authentication Admin).');
  process.exit(1);
});
