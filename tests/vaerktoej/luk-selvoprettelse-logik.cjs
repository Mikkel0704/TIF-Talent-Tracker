// Lukker for, at enhver kan oprette en konto i projektets Firebase Authentication med den
// offentlige API-noegle. Logikken ligger for sig, saa den kan proeves mod Auth-emulatoren
// (tests/funktioner/selvoprettelse.test.mjs), foer den roerer det rigtige projekt.
//
// Indstillingen er feltet client.permissions.disabledUserSignup i projektets Auth-
// konfiguration (Identity Toolkit admin v2: GET/PATCH .../admin/v2/projects/{projekt}/config).
// Er det sandt, afviser Google enhver oprettelse fra en klient med ADMIN_ONLY_OPERATION;
// Admin SDK'et (serverens opretLogin) kan stadig oprette logins.
//
// Feltet og den side i konsollen, det hoerer til ("User actions"), er dokumenteret som en
// del af Identity Platform. Det er IKKE fastslaaet, at det virker i et projekt, der ikke er
// opgraderet. Derfor aendrer vaerktoejet intet, medmindre konfigurationen selv siger
// subtype IDENTITY_PLATFORM - og bagefter BEVISES det udefra: en oprettelse med den
// offentlige noegle skal blive afvist.

// Adresserne. Emulatoren har samme API under en anden sti.
function adresser({ projekt, emulator = null }) {
  if (!projekt) throw new Error('projekt mangler');
  const rod = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  return {
    konfig: emulator ? `${rod}/v2/projects/${projekt}/config` : `${rod}/admin/v2/projects/${projekt}/config`,
    signUp: noegle => `${rod}/v1/accounts:signUp?key=${encodeURIComponent(noegle)}`
  };
}

// Svarets fejlkode, fx "ADMIN_ONLY_OPERATION" ud af "ADMIN_ONLY_OPERATION : ...".
const fejlkodeAf = tekst => {
  try { const m = JSON.parse(tekst)?.error?.message; return m ? String(m).split(/[\s:]/)[0] : null; } catch { return null; }
};

// kald(url, {method, body}) -> {status, tekst}: et kald MED projektets noegle (OAuth).
async function laesIndstilling(kald, adr) {
  const r = await kald(adr.konfig, { method: 'GET' });
  if (r.status !== 200) {
    const e = new Error(`kunne ikke laese Auth-konfigurationen (HTTP ${r.status}${fejlkodeAf(r.tekst) ? ', ' + fejlkodeAf(r.tekst) : ''})`);
    e.status = r.status; throw e;
  }
  const k = JSON.parse(r.tekst);
  return {
    aaben: k?.client?.permissions?.disabledUserSignup !== true,
    subtype: k?.subtype || null,
    identityPlatform: k?.subtype === 'IDENTITY_PLATFORM'
  };
}

async function lukSelvoprettelse(kald, adr) {
  const r = await kald(adr.konfig + '?updateMask=client.permissions.disabledUserSignup',
    { method: 'PATCH', body: JSON.stringify({ client: { permissions: { disabledUserSignup: true } } }) });
  if (r.status !== 200) {
    const e = new Error(`kunne ikke gemme indstillingen (HTTP ${r.status}${fejlkodeAf(r.tekst) ? ', ' + fejlkodeAf(r.tekst) : ''})`);
    e.status = r.status; throw e;
  }
}

// Beviset udefra: proev at oprette en konto, som en fremmed ville - med den offentlige
// noegle fra index.html og uden andre beviser. Lykkes det mod forventning, slettes kontoen
// med det samme (sletBruger(uid) med Admin SDK'et).
// hent: fetch (uden projektets noegle!). Svar: {udfald: "afvist"|"oprettet"|"uafklaret", kode, uid?, slettet?}
async function proevOprettelse({ hent, adr, apiNoegle, referer = null, sletBruger }) {
  const tilfaeldig = Math.random().toString(36).slice(2, 10);
  const body = { email: `selvoprettelse-proeve-${Date.now()}-${tilfaeldig}@tif-talent-tracker.invalid`,
    password: 'P' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), returnSecureToken: true };
  const headers = { 'content-type': 'application/json' };
  // Noeglen kan vaere begraenset til appens adresse; en fremmed kan saette samme Referer.
  if (referer) { headers.referer = referer; headers.origin = new URL(referer).origin; }
  const r = await hent(adr.signUp(apiNoegle), { method: 'POST', headers, body: JSON.stringify(body) });
  const tekst = await r.text();
  if (r.ok) {
    let uid = null;
    try { uid = JSON.parse(tekst).localId || null; } catch { /* meldes som uden id */ }
    let slettet = false;
    if (uid) { try { await sletBruger(uid); slettet = true; } catch { slettet = false; } }
    return { udfald: 'oprettet', kode: null, uid, slettet };
  }
  const kode = fejlkodeAf(tekst) || `HTTP ${r.status}`;
  return { udfald: kode === 'ADMIN_ONLY_OPERATION' ? 'afvist' : 'uafklaret', kode };
}

// Hele forloebet.
//   udfoer: luk og bevis (ellers: kun laes)
//   bevis:  kun beviset (opretter og sletter hoejst én proevekonto, hvis der er aabent)
// Svar: {foer, efter, lukket, bevis, ok, stop, linjer: [tekst til skaermen]}
async function koer({ udfoer = false, bevis = false, kald, hent, adr, apiNoegle, referer, sletBruger }) {
  const rapport = { foer: null, efter: null, lukket: false, bevis: null, ok: false, stop: null, linjer: [] };
  const sig = l => rapport.linjer.push(l);
  const foer = rapport.foer = await laesIndstilling(kald, adr);
  sig(`Selvoprettelse med e-mail og adgangskode: ${foer.aaben ? 'AABEN - enhver kan oprette en konto' : 'LUKKET'}`);
  sig(`Auth-udgave: ${foer.identityPlatform ? 'Identity Platform' : 'Firebase Authentication uden Identity Platform'} (subtype ${foer.subtype || 'ikke oplyst'})`);

  if (udfoer && foer.aaben) {
    if (!foer.identityPlatform) {
      rapport.stop = 'ikke-identity-platform';
      sig('STOP: Projektet er ikke opgraderet til Identity Platform. Indstillingen, der lukker for');
      sig('selvoprettelse, hoerer til Identity Platform, og det er ikke fastslaaet, at den virker uden');
      sig('opgraderingen. Vaerktoejet gaetter ikke og har intet aendret.');
      sig('Opgrader i Firebase Console: Authentication -> Settings -> "Upgrade to Firebase Authentication');
      sig('with Identity Platform" (kraever Blaze-abonnementet), og koer saa vaerktoejet igen.');
      return rapport;
    }
    await lukSelvoprettelse(kald, adr);
    rapport.lukket = true;
    const efter = rapport.efter = await laesIndstilling(kald, adr);
    sig(`Laest tilbage: ${efter.aaben ? 'STADIG AABEN - indstillingen slog ikke igennem' : 'LUKKET'}`);
    if (efter.aaben) return rapport;
  }
  if (!udfoer && !bevis) {
    rapport.ok = !foer.aaben;
    if (foer.aaben) sig('Koer med --udfoer for at lukke (og bevise det bagefter).');
    else sig('Koer med --bevis for at bevise udefra, at en fremmed bliver afvist.');
    return rapport;
  }

  const b = rapport.bevis = await proevOprettelse({ hent, adr, apiNoegle, referer, sletBruger });
  if (b.udfald === 'afvist') {
    sig('Bevis: en oprettelse med den offentlige noegle blev AFVIST (ADMIN_ONLY_OPERATION). Der er lukket.');
    rapport.ok = true;
  } else if (b.udfald === 'oprettet') {
    sig(`FEJL: en fremmed KAN stadig oprette en konto - proevekontoen ${b.uid || '(uden id)'} blev oprettet.`);
    sig(b.slettet ? 'Proevekontoen er slettet igen.' : 'Proevekontoen kunne IKKE slettes - slet den i Firebase Console under Authentication.');
  } else {
    sig(`Uafklaret: oprettelsen blev afvist, men med ${b.kode} - ikke ADMIN_ONLY_OPERATION. Det beviser ikke, at`);
    sig('selvoprettelsen er lukket (en anden spaerring kan have sagt nej). Undersoeg koden, foer der regnes med det.');
  }
  return rapport;
}

module.exports = { adresser, laesIndstilling, lukSelvoprettelse, proevOprettelse, koer, fejlkodeAf };
