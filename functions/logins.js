// Logins oprettes og slettes af serveren. Foer blev de oprettet fra administratorens
// browser med createUserWithEmailAndPassword, og saa maatte Firebase Authentications
// aabne selvoprettelse vaere slaaet til - saa kunne enhver paa nettet oprette en konto i
// projektet. Nu goer serveren det med Admin SDK'et, og selvoprettelsen kan lukkes
// (tests/vaerktoej/luk-selvoprettelse.cjs).
//
// Kun en aktiv administrator kan kalde. Det afgoeres af kalderens users-dokument, laest
// her paa serveren - aldrig af custom claims eller noget, klienten sender. Samme regel som
// isAdmin() i firestore.rules: dokumentet findes, role er "admin", og active er ikke false.
//
// users-dokumentet skrives praecis, som createCoachFromAdmin / createPlayerLoginFromAdmin
// i index.html skrev det. Mislykkes skrivningen, slettes login'et igen, saa intet staar
// halvt oprettet.
//
// Logger kun login-id'er og antal - aldrig e-mails eller navne.
import "./tid.js";
import { HttpsError } from "firebase-functions/v2/https";
import * as kode from "./genereret/pointkode.js";

export const MIN_KODE = 6;   // som i appen ("Password skal være mindst 6 tegn.")
const KOEN = new Set(["begge", "dreng", "pige"]);
// Bevidst simpel: et ord, et @, et domaene med punktum. Auth tjekker selv resten.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admin SDK'ets fejl paa dansk, saa appen kan vise dem, som de er.
export const BESKEDER = {
  "auth/email-already-exists": ["already-exists", "Der findes allerede et login med den e-mail. Brug en anden, eller slet det gamle login først."],
  "auth/invalid-email": ["invalid-argument", "E-mailadressen ser ikke rigtig ud. Tjek om den er stavet korrekt."],
  "auth/invalid-password": ["invalid-argument", "Password skal være mindst 6 tegn."]
};
const fejlkode = e => e?.code || e?.errorInfo?.code || null;

// Er kalderen en aktiv administrator? Svar: kalderens users-data. Ellers permission-denied.
export async function kraevAdmin(db, auth){
  const uid = auth?.uid;
  if(!uid || typeof uid !== "string") throw new HttpsError("permission-denied", "Kun en administrator kan oprette og slette logins.");
  const snap = await db.collection("users").doc(uid).get();
  const d = snap.exists ? snap.data() : null;
  if(!d || d.role !== "admin" || d.active === false) throw new HttpsError("permission-denied", "Kun en administrator kan oprette og slette logins.");
  return d;
}

const ugyldig = besked => new HttpsError("invalid-argument", besked);
function tekst(v, navn, maks = 200){
  if(typeof v !== "string" || !v.trim()) return null;
  if(v.length > maks) throw ugyldig(navn + " er for lang.");
  return v.trim();
}

// Tjekker og former forespoergslen. Kaster invalid-argument med en dansk besked.
export function formOpret(data){
  const d = data && typeof data === "object" ? data : {};
  if(d.rolle !== "coach" && d.rolle !== "player") throw ugyldig("Ukendt slags login.");
  const email = tekst(d.email, "E-mailen", 320);
  if(!email) throw ugyldig(d.rolle === "coach" ? "Skriv trænerens email." : "Skriv spillerens email.");
  if(!EMAIL.test(email)) throw ugyldig(BESKEDER["auth/invalid-email"][1]);
  if(typeof d.kode !== "string" || d.kode.length < MIN_KODE) throw ugyldig(BESKEDER["auth/invalid-password"][1]);
  if(d.kode.length > 128) throw ugyldig("Password er for langt.");
  if(d.rolle === "coach"){
    if(!Array.isArray(d.years) || d.years.length > 50) throw ugyldig("Vælg mindst én årgang.");
    const years = [...new Set(d.years.map(y => tekst(y, "Årgangen", 20)).filter(Boolean))];
    if(!years.length) throw ugyldig("Vælg mindst én årgang.");
    const valgt = d.yearGenders && typeof d.yearGenders === "object" && !Array.isArray(d.yearGenders) ? d.yearGenders : {};
    const yearGenders = {};
    for(const y of years){
      const k = Object.prototype.hasOwnProperty.call(valgt, y) ? valgt[y] : "begge";
      if(!KOEN.has(k)) throw ugyldig("Ukendt valg af køn for årgang " + y + ".");
      yearGenders[y] = k;
    }
    return { rolle: "coach", email, kode: d.kode, years, yearGenders };
  }
  const playerId = tekst(d.playerId, "Spilleren");
  if(!playerId || playerId.includes("/")) throw ugyldig("Vælg en spiller.");
  return { rolle: "player", email, kode: d.kode, playerId, demo: d.demo === true };
}

// Opret et login. deps: {db, adminAuth, FieldValue, logger}; kalder: request.auth.
// Svar: {uid}.
export async function opretLogin({ db, adminAuth, FieldValue, logger }, kalder, data){
  const admin = await kraevAdmin(db, kalder);
  const f = formOpret(data);
  const nu = FieldValue.serverTimestamp();
  const createdBy = String(kalder.token?.email || admin.email || "");

  // Alt, der skal laeses, laeses FOER login'et oprettes - saa en forkert spiller aldrig
  // efterlader et login.
  let spiller = null;
  if(f.rolle === "player"){
    const snap = await db.collection("players").doc(f.playerId).get();
    if(!snap.exists) throw new HttpsError("not-found", "Spilleren findes ikke længere. Genindlæs siden, og vælg igen.");
    // Som appen ser spilleren: migratePlayer giver aargangen den form, appen bruger.
    spiller = kode.migratePlayer({ id: snap.id, ...snap.data() });
  }
  const dokument = f.rolle === "coach"
    ? {
        email: f.email,
        role: "coach",
        mustChangePassword: true,
        years: f.years,
        yearGenders: f.yearGenders,
        active: true,
        // Som appen: den oprettende administrators egne lukkede aargange
        // (closedYearsForCurrentUser) - laest fra administratorens dokument her.
        closedYears: kode.normalizeYearsList(Array.isArray(admin.closedYears) ? admin.closedYears : []),
        createdBy,
        createdAt: nu,
        updatedAt: nu
      }
    : {
        email: f.email,
        role: "player",
        playerId: spiller.id,
        years: [spiller.year],
        // Kun begraenset til eget koen, naar spilleren har faaet et koen (som i appen).
        yearGenders: spiller.gender ? { [spiller.year]: spiller.gender } : {},
        active: true,
        demo: f.demo,
        // Demo-koden deles af mange familier og skal ikke skiftes af den foerste.
        mustChangePassword: !f.demo,
        createdBy,
        createdAt: nu,
        updatedAt: nu
      };

  let ny;
  try{
    ny = await adminAuth.createUser({ email: f.email, password: f.kode });
  }catch(e){
    const kendt = BESKEDER[fejlkode(e)];
    logger?.warn?.("opretLogin: login blev ikke oprettet", { kalder: kalder.uid, kode: fejlkode(e) });
    if(kendt) throw new HttpsError(kendt[0], kendt[1]);
    throw new HttpsError("internal", "Login'et kunne ikke oprettes. Prøv igen om lidt.");
  }

  try{
    // Brugerdokumentet og spillerens flag i ét hug: begge eller ingen. update() kraever, at
    // spilleren stadig findes.
    const batch = db.batch();
    batch.create(db.collection("users").doc(ny.uid), dokument);
    // Et demo-login taeller ikke som aktivt: de rigtige spillere skal ikke kunne udfordre det.
    if(f.rolle === "player" && !f.demo) batch.update(db.collection("players").doc(spiller.id), { hasActiveLogin: true, updatedAt: nu });
    await batch.commit();
  }catch(e){
    let rullet = false;
    try{ await adminAuth.deleteUser(ny.uid); rullet = true; }catch(e2){ /* meldes nedenfor */ }
    logger?.error?.("opretLogin: brugerdokumentet blev ikke skrevet", { kalder: kalder.uid, uid: ny.uid, rulletTilbage: rullet, kode: fejlkode(e) });
    throw new HttpsError("internal", rullet
      ? "Login'et kunne ikke gemmes, så det er ikke oprettet. Prøv igen."
      : "Login'et kunne ikke gemmes, og det halve login kunne ikke fjernes igen. Kontakt den, der passer appen (login-id " + ny.uid + ").");
  }
  logger?.info?.("opretLogin", { kalder: kalder.uid, uid: ny.uid, rolle: f.rolle, demo: f.rolle === "player" ? f.demo : null });
  return { uid: ny.uid };
}

// Slet et login: brugerdokumentet (adgangen lukkes med det samme), spillerens flag og
// selve login'et. Et login, der allerede er vaek, er ikke en fejl.
// Svar: {uid, brugerdokument: "slettet"|"fandtes ikke", spiller: id|null, login: "slettet"|"fandtes ikke"}
export async function sletLogin({ db, adminAuth, FieldValue, logger }, kalder, data){
  await kraevAdmin(db, kalder);
  const uid = tekst(data?.uid, "Login-id'et", 128);
  if(!uid || uid.includes("/")) throw ugyldig("Ukendt login.");
  if(uid === kalder.uid) throw new HttpsError("failed-precondition", "Du kan ikke slette din egen adgang.");

  const svar = { uid, brugerdokument: "fandtes ikke", spiller: null, login: "fandtes ikke" };
  await db.runTransaction(async tx => {
    const ref = db.collection("users").doc(uid);
    const bruger = await tx.get(ref);
    const d = bruger.exists ? bruger.data() : null;
    let spiller = null;
    if(d && d.role === "player" && typeof d.playerId === "string" && d.playerId && !d.playerId.includes("/")){
      spiller = await tx.get(db.collection("players").doc(d.playerId));
    }
    svar.brugerdokument = "fandtes ikke"; svar.spiller = null;   // transaktionen kan koere igen
    if(d){ tx.delete(ref); svar.brugerdokument = "slettet"; }
    // Som appen: et spillerlogin, der slettes, tager flaget med. Findes spilleren ikke
    // laengere, skrives intet (ellers ville der opstaa en tom spiller).
    if(spiller?.exists){ tx.update(spiller.ref, { hasActiveLogin: false, updatedAt: FieldValue.serverTimestamp() }); svar.spiller = spiller.id; }
  });
  try{
    await adminAuth.deleteUser(uid);
    svar.login = "slettet";
  }catch(e){
    if(fejlkode(e) !== "auth/user-not-found"){
      logger?.error?.("sletLogin: login'et blev ikke slettet", { kalder: kalder.uid, uid, kode: fejlkode(e) });
      throw new HttpsError("internal", "Adgangen til appen er lukket, men selve login'et kunne ikke slettes. Prøv igen om lidt.");
    }
  }
  logger?.info?.("sletLogin", { kalder: kalder.uid, uid, brugerdokument: svar.brugerdokument, spiller: !!svar.spiller, login: svar.login });
  return svar;
}
