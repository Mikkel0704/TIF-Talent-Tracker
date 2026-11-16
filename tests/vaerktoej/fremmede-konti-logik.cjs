// Fremmede konti: logins i Firebase Authentication uden et users-dokument. De kan intet i
// Firestore (hver regel kraever et aktivt users-dokument), men de kan lægge filer i deres
// egen mappe i lageret og roder i listen over logins. De opstaar, naar nogen har oprettet sig
// selv, mens selvoprettelsen var aaben - og da en spiller blev slettet i appen foer v15.78
// (browseren fjernede users-dokumentet, men kunne ikke slette selve login'et; nu goer
// serverens sletSpiller begge dele).
//
// Logikken ligger for sig, saa den kan proeves mod emulatoren
// (tests/funktioner/fremmede-konti.test.mjs). Den sletter INTET, medmindre slet er sand -
// og aldrig et login, der har et users-dokument.
//
// Der skrives aldrig en hel e-mailadresse ud - kun domaenet (fx "@gmail.com").

const MIN_ALDER_MS = 10 * 60 * 1000;   // et login, der lige er oprettet, kan vente paa sit users-dokument

function domaene(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '(ingen e-mail)';
  return '@' + email.split('@').pop().toLowerCase();
}
const tid = s => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toISOString().slice(0, 16).replace('T', ' ') : null; };

async function alleLogins(auth) {
  const ud = [];
  let side;
  do {
    const svar = await auth.listUsers(1000, side);
    svar.users.forEach(u => ud.push({ uid: u.uid, oprettet: u.metadata?.creationTime || null, sidstLoggetInd: u.metadata?.lastSignInTime || null, domaene: domaene(u.email) }));
    side = svar.pageToken;
  } while (side);
  return ud;
}

// Hvad er der? Svar: {logins, brugere, fremmede: [...], forNye: [...], udenLogin: [{uid, rolle}]}
async function find(db, auth, { nu = new Date(), minAlderMs = MIN_ALDER_MS } = {}) {
  const [logins, brugereSnap] = await Promise.all([alleLogins(auth), db.collection('users').get()]);
  const brugere = new Map(brugereSnap.docs.map(d => [d.id, d.data()]));
  const iAuth = new Set(logins.map(l => l.uid));
  const uden = logins.filter(l => !brugere.has(l.uid));
  const ung = l => l.oprettet && nu - new Date(l.oprettet) < minAlderMs;
  return {
    logins: logins.length,
    brugere: brugere.size,
    fremmede: uden.filter(l => !ung(l)),
    forNye: uden.filter(ung),
    udenLogin: [...brugere].filter(([uid]) => !iAuth.has(uid)).map(([uid, d]) => ({ uid, rolle: typeof d.role === 'string' ? d.role : null }))
  };
}

// Sletter de fremmede logins. Tjekker igen lige foer, at intet af dem har faaet et
// users-dokument i mellemtiden. Svar: {slettet: [uid], sprunget: [uid], fejl: [{uid, kode}]}
async function sletFremmede(db, auth, uids) {
  const svar = { slettet: [], sprunget: [], fejl: [] };
  if (!uids.length) return svar;
  const snaps = await db.getAll(...uids.map(uid => db.collection('users').doc(uid)));
  const tilSletning = uids.filter((uid, i) => { if (snaps[i].exists) { svar.sprunget.push(uid); return false; } return true; });
  for (let i = 0; i < tilSletning.length; i += 1000) {
    const del = tilSletning.slice(i, i + 1000);
    const r = await auth.deleteUsers(del);
    const fejlede = new Set();
    (r.errors || []).forEach(e => { fejlede.add(del[e.index]); svar.fejl.push({ uid: del[e.index], kode: e.error?.code || null }); });
    del.forEach(uid => { if (!fejlede.has(uid)) svar.slettet.push(uid); });
  }
  return svar;
}

const linje = l => `  ${l.uid}  oprettet ${tid(l.oprettet) || '?'}  sidst logget ind ${tid(l.sidstLoggetInd) || 'aldrig'}  ${l.domaene}`;

// Hele forloebet. Svar: {foer, sletning, efter, ok, linjer: [tekst til skaermen]}
async function koer(db, auth, { slet = false, nu = new Date(), minAlderMs = MIN_ALDER_MS } = {}) {
  const rapport = { foer: null, sletning: null, efter: null, ok: true, linjer: [] };
  const sig = l => rapport.linjer.push(l);
  const f = rapport.foer = await find(db, auth, { nu, minAlderMs });
  sig(`Logins i Auth: ${f.logins} · users-dokumenter: ${f.brugere}`);
  sig(`\nLogins uden users-dokument: ${f.fremmede.length}`);
  f.fremmede.forEach(l => sig(linje(l)));
  if (f.forNye.length) {
    sig(`\nOprettet for under ${Math.round(minAlderMs / 60000)} minutter siden (kan vente paa sit users-dokument - roeres ikke): ${f.forNye.length}`);
    f.forNye.forEach(l => sig(linje(l)));
  }
  sig(`\nusers-dokumenter uden login i Auth: ${f.udenLogin.length}${f.udenLogin.length ? ' (slettes ikke af vaerktoejet)' : ''}`);
  f.udenLogin.forEach(u => sig(`  ${u.uid}  rolle ${u.rolle || '?'}`));

  if (!slet) {
    if (f.fremmede.length) sig(`\nKoer med --slet for at slette de ${f.fremmede.length} logins uden users-dokument.`);
    return rapport;
  }
  if (!f.brugere) {
    // Et tomt users kan vaere en fejl (forkert projekt, manglende adgang). Saa slettes intet.
    sig('\nSTOP: fandt ingen users-dokumenter. Det ligner en fejl - intet er slettet.');
    rapport.ok = false;
    return rapport;
  }
  sig(`\nSletter ${f.fremmede.length} login(s) uden users-dokument...`);
  const s = rapport.sletning = await sletFremmede(db, auth, f.fremmede.map(l => l.uid));
  sig(`  slettet: ${s.slettet.length}${s.sprunget.length ? ` · sprunget over (har faaet et users-dokument): ${s.sprunget.length}` : ''}${s.fejl.length ? ` · FEJL: ${s.fejl.length}` : ''}`);
  s.fejl.forEach(x => sig(`  FEJL ${x.uid}: ${x.kode || 'ukendt'}`));
  // Laes tilbage: det er serverens svar, der taeller.
  const e = rapport.efter = await find(db, auth, { nu, minAlderMs });
  const tilbage = e.fremmede.filter(l => s.slettet.includes(l.uid)).length;
  sig(`\nLaest tilbage: logins i Auth: ${e.logins} · uden users-dokument: ${e.fremmede.length} · af dem slettet, men stadig der: ${tilbage}`);
  rapport.ok = !s.fejl.length && !tilbage;
  return rapport;
}

module.exports = { domaene, find, sletFremmede, koer, MIN_ALDER_MS };
