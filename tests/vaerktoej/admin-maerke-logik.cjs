// Hvem skal have maerket "admin" paa sit login, og hvem skal af med det.
//
// Lagerreglerne kan ikke slaa roller op i Firestore, saa mappen med instruktionsvideoer
// aabnes af et maerke paa selve loginnet. Maerket skal foelge rollen i appen: en aktiv
// administrator har det, alle andre har det ikke. Funktionen her regner kun ud, hvad der
// skal aendres - den roerer ingenting, saa den kan proeves uden noegle og uden netvaerk.
//
//   brugere: [{uid, role, active}]   fra samlingen users
//   logins:  [{uid, claims}]         fra Firebase Auth
function planlaegAdminMaerker(brugere, logins) {
  const skalHave = new Set(brugere.filter(b => b.role === 'admin' && b.active !== false).map(b => b.uid));
  const kendte = new Map(logins.map(l => [l.uid, l.claims || {}]));
  const plan = { saet: [], fjern: [], uaendret: [], mangler: [] };
  for (const uid of skalHave) {
    if (!kendte.has(uid)) plan.mangler.push(uid);           // staar i appen, men har intet login
    else if (kendte.get(uid).admin === true) plan.uaendret.push(uid);
    else plan.saet.push(uid);
  }
  // Alt andet end et aegte "sandt" paa en aktiv administrator skal vaek - ogsaa et maerke
  // med en forkert vaerdi, saa der ikke ligger noget og ligner en tilladelse.
  for (const [uid, claims] of kendte) {
    if ('admin' in claims && !skalHave.has(uid)) plan.fjern.push(uid);
  }
  return plan;
}

// De oevrige maerker paa loginnet bevares; kun "admin" saettes eller fjernes.
function nyeMaerker(claims, skalHave) {
  const ny = { ...(claims || {}) };
  if (skalHave) ny.admin = true; else delete ny.admin;
  return ny;
}

module.exports = { planlaegAdminMaerker, nyeMaerker };
