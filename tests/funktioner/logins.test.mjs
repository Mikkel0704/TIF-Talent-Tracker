// opretLogin og sletLogin (functions/logins.js) i emulatoren: kaldt over HTTP, praecis som
// appens httpsCallable kalder dem, med rigtige ID-beviser fra Auth-emulatoren. Koeres af
// `npm run funktioner` inde i
//   firebase emulators:exec --config funktioner/firebase.json --only auth,firestore,functions,storage
// med egne porte (auth 9199, firestore 8990, functions 8995, hub 4410). Demo-projekt: intet
// her kan naa produktion.
//
// Emulatoren tjekker IKKE beviserne kryptografisk (firebase-tools saetter
// skipTokenVerification): et App Check-bevis, der mangler, afvises, men et falsk bevis
// godtages. At serveren afviser falske beviser, er Googles kode, ikke vores - her proeves,
// at vores funktion kraever et bevis og selv afgoer, hvem der er administrator.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createRequire } from "node:module";
import * as funktioner from "../../functions/index.js";
import * as logins from "../../functions/logins.js";

const PROJEKT = process.env.GCLOUD_PROJECT;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST, FS = process.env.FIRESTORE_EMULATOR_HOST;
if(!AUTH || !FS || !PROJEKT?.startsWith("demo-")) throw new Error("koeres kun i emulatoren med et demo-projekt (npm run funktioner)");
const app = initializeApp({ projectId: PROJEKT });
const db = getFirestore(app), auth = getAuth(app);
// logins.js bruger functions/'s egen firebase-admin; dens FieldValue skal skrives med en
// klient fra samme pakke (som i emulator.test.mjs).
const fra = createRequire(new URL("../../functions/package.json", import.meta.url));
const fApp = fra("firebase-admin/app").initializeApp({ projectId: PROJEKT }, "funktioner");
const fdb = fra("firebase-admin/firestore").getFirestore(fApp);
const fAuth = fra("firebase-admin/auth").getAuth(fApp);
const { FieldValue: fFieldValue } = fra("firebase-admin/firestore");

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- emulatorerne ---------------------------------------------------------------------
const toem = async () => {
  await fetch(`http://${FS}/emulator/v1/projects/${PROJEKT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJEKT}/accounts`, { method: "DELETE" });
};
const logIndBevis = async (email, kode) => {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-noegle`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: kode, returnSecureToken: true }) });
  const j = await r.json();
  return r.ok ? j.idToken : null;
};
// Et App Check-bevis med appens id. Emulatoren laeser det uden at tjekke signaturen.
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const APP_CHECK = [b64({ alg: "none", typ: "JWT" }), b64({ sub: "1:727656181039:web:3be0054db82f85f415c5da", aud: ["projects/" + PROJEKT] }), "x"].join(".");
// Kaldet, som httpsCallable sender det: POST {data}, Authorization: Bearer <ID-bevis>,
// X-Firebase-AppCheck: <bevis>. Svar: {status, result} eller {status, error: {status, message}}.
async function kald(navn, data, { bevis = null, appCheck = true } = {}){
  const headers = { "content-type": "application/json" };
  if(bevis) headers.authorization = "Bearer " + bevis;
  if(appCheck) headers["x-firebase-appcheck"] = APP_CHECK;
  const r = await fetch(`http://127.0.0.1:8995/${PROJEKT}/europe-west1/${navn}`, { method: "POST", headers, body: JSON.stringify({ data }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, result: j.result, error: j.error };
}
const antalLogins = async () => (await auth.listUsers(1000)).users.length;
const antalBrugere = async () => (await db.collection("users").get()).size;
const brugerMedEmail = async email => { try{ return await auth.getUserByEmail(email); }catch{ return null; } };
const brugerDok = async uid => { const s = await db.collection("users").doc(uid).get(); return s.exists ? s.data() : null; };
const spiller = async id => { const s = await db.collection("players").doc(id).get(); return s.exists ? { ...s.data(), _tid: s.updateTime.toMillis() } : null; };

// --- folkene -----------------------------------------------------------------------------
await toem();
const KODE = "hemmelig-1";
async function person(navn, dok){
  const u = await auth.createUser({ email: navn + "@eksempel.invalid", password: KODE });
  if(dok) await db.collection("users").doc(u.uid).set({ email: u.email, ...dok });
  return { uid: u.uid, email: u.email, bevis: await logIndBevis(u.email, KODE) };
}
const admin   = await person("admin",   { role: "admin", active: true, years: ["2017"], closedYears: ["U8", "2016", "2016"] });
const admin2  = await person("admin2",  { role: "admin" });                       // intet active-felt = aktiv, som i reglerne
const traener = await person("traener", { role: "coach", active: true, years: ["2017"] });
const spil    = await person("spiller", { role: "player", active: true, playerId: "p2", years: ["2016"] });
const lukket  = await person("lukket",  { role: "admin", active: false });
const fremmed = await person("fremmed", null);                                    // Auth-konto uden users-dokument
await db.collection("players").doc("p1").set({ name: "Oscar Login", year: "U9", gender: "dreng", points: 3 });
await db.collection("players").doc("p2").set({ name: "Ida Login", year: "2016", points: 0 });
await db.collection("players").doc("p9").set({ name: "Demo Login", year: "2017", gender: "pige", points: 0 });
t("alle testpersoner fik et rigtigt ID-bevis fra Auth-emulatoren", [admin, admin2, traener, spil, lukket, fremmed].every(p => typeof p.bevis === "string" && p.bevis.split(".").length === 3));

console.log("\nLogins · det, der udrulles");
for(const navn of ["opretLogin", "sletLogin"]){
  const e = funktioner[navn]?.__endpoint;
  t(`${navn} er en kaldbar funktion i europe-west1, 256 MiB, 60 s, hoejst 3 instanser, gcfv2`,
    !!e?.callableTrigger && ens(e.region, ["europe-west1"]) && e.availableMemoryMb === 256 && e.timeoutSeconds === 60 && e.maxInstances === 3 && e.platform === "gcfv2", e);
}

console.log("\nLogins · App Check");
let foerLogins = await antalLogins(), foerBrugere = await antalBrugere();
let r = await kald("opretLogin", { rolle: "coach", email: "uden-appcheck@eksempel.invalid", kode: KODE, years: ["2017"] }, { bevis: admin.bevis, appCheck: false });
t("et kald uden App Check-bevis afvises (401, unauthenticated) - ogsaa fra en administrator", r.status === 401 && r.error?.status === "UNAUTHENTICATED", r);
r = await kald("sletLogin", { uid: traener.uid }, { bevis: admin.bevis, appCheck: false });
t("ogsaa sletLogin", r.status === 401 && r.error?.status === "UNAUTHENTICATED", r);
t("og intet er oprettet eller slettet", await antalLogins() === foerLogins && await antalBrugere() === foerBrugere);

console.log("\nLogins · administratoren opretter en træner");
r = await kald("opretLogin", { rolle: "coach", email: " ny.traener@eksempel.invalid ", kode: KODE, years: ["2017", "2015", "2017"],
  yearGenders: { "2017": "pige", "2014": "dreng" },
  // Det, klienten ikke bestemmer over: ignoreres
  role: "admin", active: false, createdBy: "en anden", closedYears: [] }, { bevis: admin.bevis });
const nyTraener = r.result?.uid;
t("svaret er {uid}", r.status === 200 && typeof nyTraener === "string" && ens(Object.keys(r.result), ["uid"]), r);
const nyT = await brugerMedEmail("ny.traener@eksempel.invalid");
t("login'et findes i Auth med den e-mail, der blev skrevet (uden mellemrum)", nyT?.uid === nyTraener);
let d = await brugerDok(nyTraener);
t("users-dokumentet har netop de felter, appen skrev", d && ens(Object.keys(d).sort(),
  ["active", "closedYears", "createdAt", "createdBy", "email", "mustChangePassword", "role", "updatedAt", "yearGenders", "years"]), d && Object.keys(d).sort());
t("rolle coach, aktiv, skal skifte kode, e-mail som skrevet", d?.role === "coach" && d.active === true && d.mustChangePassword === true && d.email === "ny.traener@eksempel.invalid", d);
t("aargangene som valgt (uden dubletter); en aargang uden valg af koen faar 'begge', andre ignoreres",
  ens(d?.years, ["2017", "2015"]) && ens(d?.yearGenders, { "2017": "pige", "2015": "begge" }), d);
t("closedYears er administratorens egne, normaliseret som closedYearsForCurrentUser() (U8 -> 2018)", ens(d?.closedYears, ["2018", "2016"]), d?.closedYears);
t("createdBy er kalderens e-mail - ikke det, klienten sendte", d?.createdBy === admin.email, d?.createdBy);
t("createdAt og updatedAt er serverens tidsstempler", d?.createdAt instanceof Timestamp && d?.updatedAt instanceof Timestamp);
t("den nye træner kan logge ind med koden", !!await logIndBevis("ny.traener@eksempel.invalid", KODE));

console.log("\nLogins · administratoren opretter et spillerlogin");
const p1Foer = await spiller("p1");
r = await kald("opretLogin", { rolle: "player", email: "oscar@eksempel.invalid", kode: KODE, playerId: "p1", demo: false, years: ["2010"] }, { bevis: admin.bevis });
const nySpiller = r.result?.uid;
t("svaret er {uid}", r.status === 200 && typeof nySpiller === "string", r);
d = await brugerDok(nySpiller);
t("users-dokumentet har netop de felter, appen skrev", d && ens(Object.keys(d).sort(),
  ["active", "createdAt", "createdBy", "demo", "email", "mustChangePassword", "playerId", "role", "updatedAt", "yearGenders", "years"]), d && Object.keys(d).sort());
t("rolle player, spilleren, aktiv, ikke demo, skal skifte kode", d?.role === "player" && d.playerId === "p1" && d.active === true && d.demo === false && d.mustChangePassword === true, d);
t("aargangen laeses af serveren paa spilleren og normaliseres som i appen (U9 -> 2017) - klientens years ignoreres", ens(d?.years, ["2017"]), d?.years);
t("begraenset til spillerens eget koen", ens(d?.yearGenders, { "2017": "dreng" }), d?.yearGenders);
t("createdBy er kalderens e-mail; tidsstempler fra serveren", d?.createdBy === admin.email && d?.createdAt instanceof Timestamp && d?.updatedAt instanceof Timestamp);
const p1 = await spiller("p1");
t("spilleren faar hasActiveLogin = true (og updatedAt)", p1?.hasActiveLogin === true && p1.updatedAt instanceof Timestamp, p1);
t("intet andet paa spilleren er roert", p1?.name === p1Foer.name && p1.year === "U9" && p1.points === 3);

r = await kald("opretLogin", { rolle: "player", email: "ida@eksempel.invalid", kode: KODE, playerId: "p2" }, { bevis: admin2.bevis });
d = await brugerDok(r.result?.uid);
t("en administrator uden active-felt maa ogsaa (som isAdmin() i reglerne)", r.status === 200 && !!d, r);
t("en spiller uden koen faar tomme yearGenders", ens(d?.yearGenders, {}) && ens(d?.years, ["2016"]), d);

const p9Foer = await spiller("p9");
r = await kald("opretLogin", { rolle: "player", email: "demo@eksempel.invalid", kode: KODE, playerId: "p9", demo: true }, { bevis: admin.bevis });
d = await brugerDok(r.result?.uid);
t("demo-login: demo true og mustChangePassword false", r.status === 200 && d?.demo === true && d?.mustChangePassword === false, { r, d });
const p9 = await spiller("p9");
t("demo-login: spillerens hasActiveLogin er ikke roert (dokumentet er ikke skrevet)", p9 && !("hasActiveLogin" in p9) && p9._tid === p9Foer._tid, p9);

console.log("\nLogins · fejl, der skal vises, som de er");
foerLogins = await antalLogins(); foerBrugere = await antalBrugere();
const p2Foer = await spiller("p2");
r = await kald("opretLogin", { rolle: "player", email: "OSCAR@eksempel.invalid", kode: KODE, playerId: "p2" }, { bevis: admin.bevis });
t("en e-mail, der allerede har et login (ogsaa med store bogstaver), giver den danske besked",
  r.status === 409 && r.error?.status === "ALREADY_EXISTS" && r.error.message === logins.BESKEDER["auth/email-already-exists"][1], r);
t("og intet er halvt oprettet: samme antal logins og brugere, spilleren uroert",
  await antalLogins() === foerLogins && await antalBrugere() === foerBrugere && (await spiller("p2"))._tid === p2Foer._tid);
const fejlsager = [
  ["en ugyldig e-mail", { rolle: "coach", email: "ikke-en-email", kode: KODE, years: ["2017"] }, "INVALID_ARGUMENT", "E-mailadressen ser ikke rigtig ud. Tjek om den er stavet korrekt."],
  ["et password paa 5 tegn", { rolle: "coach", email: "kort@eksempel.invalid", kode: "12345", years: ["2017"] }, "INVALID_ARGUMENT", "Password skal være mindst 6 tegn."],
  ["en træner uden aargange", { rolle: "coach", email: "ingen@eksempel.invalid", kode: KODE, years: [] }, "INVALID_ARGUMENT", "Vælg mindst én årgang."],
  ["en træner uden e-mail", { rolle: "coach", email: "  ", kode: KODE, years: ["2017"] }, "INVALID_ARGUMENT", "Skriv trænerens e-mail."],
  ["et ukendt valg af koen", { rolle: "coach", email: "koen@eksempel.invalid", kode: KODE, years: ["2017"], yearGenders: { "2017": "alle" } }, "INVALID_ARGUMENT", "Ukendt valg af køn for årgang 2017."],
  ["en spiller, der ikke findes", { rolle: "player", email: "ingen.spiller@eksempel.invalid", kode: KODE, playerId: "findes-ikke" }, "NOT_FOUND", "Spilleren findes ikke længere. Genindlæs siden, og vælg igen."],
  ["et spillerlogin uden spiller", { rolle: "player", email: "x@eksempel.invalid", kode: KODE }, "INVALID_ARGUMENT", "Vælg en spiller."],
  ["en ukendt rolle", { rolle: "admin", email: "x@eksempel.invalid", kode: KODE }, "INVALID_ARGUMENT", "Ukendt slags login."]
];
for(const [navn, data, status, besked] of fejlsager){
  r = await kald("opretLogin", data, { bevis: admin.bevis });
  t(`${navn}: ${status} med den danske besked`, r.error?.status === status && r.error.message === besked, r);
}
t("ingen af dem efterlod noget i Auth eller users", await antalLogins() === foerLogins && await antalBrugere() === foerBrugere);

console.log("\nLogins · kun en aktiv administrator");
const ikkeAdmin = [["en træner", traener.bevis], ["et spillerlogin", spil.bevis], ["en, der ikke er logget ind", null],
  ["en deaktiveret administrator", lukket.bevis], ["en Auth-konto uden users-dokument", fremmed.bevis]];
const spillereFoer = JSON.stringify((await db.collection("players").get()).docs.map(x => [x.id, x.updateTime.toMillis()]));
for(const [navn, bevis] of ikkeAdmin){
  r = await kald("opretLogin", { rolle: "coach", email: "forsoeg@eksempel.invalid", kode: KODE, years: ["2017"] }, { bevis });
  const r2 = await kald("opretLogin", { rolle: "player", email: "forsoeg2@eksempel.invalid", kode: KODE, playerId: "p1" }, { bevis });
  const r3 = await kald("sletLogin", { uid: nyTraener }, { bevis });
  t(`${navn}: opretLogin og sletLogin giver permission-denied`,
    [r, r2, r3].every(x => x.status === 403 && x.error?.status === "PERMISSION_DENIED"), [r, r2, r3]);
}
t("og intet er skrevet: samme logins, samme brugere, spillerne uroerte, træneren findes stadig",
  await antalLogins() === foerLogins && await antalBrugere() === foerBrugere
  && JSON.stringify((await db.collection("players").get()).docs.map(x => [x.id, x.updateTime.toMillis()])) === spillereFoer
  && !!(await brugerDok(nyTraener)) && !!(await brugerMedEmail("ny.traener@eksempel.invalid")));
t("et ugyldigt kald afvises ogsaa, foer data overhovedet laeses (permission-denied foer invalid-argument)",
  (await kald("opretLogin", { rolle: "noget" }, { bevis: traener.bevis })).error?.status === "PERMISSION_DENIED");

console.log("\nLogins · sletLogin");
r = await kald("sletLogin", { uid: nySpiller }, { bevis: admin.bevis });
t("svaret siger, hvad der er gjort", r.status === 200 && ens(r.result, { uid: nySpiller, brugerdokument: "slettet", spiller: "p1", login: "slettet" }), r);
t("users-dokumentet er vaek", (await brugerDok(nySpiller)) === null);
t("login'et er vaek i Auth", (await brugerMedEmail("oscar@eksempel.invalid")) === null);
const p1Efter = await spiller("p1");
t("spilleren har hasActiveLogin = false; resten er uroert", p1Efter?.hasActiveLogin === false && p1Efter.name === "Oscar Login" && p1Efter.points === 3, p1Efter);
r = await kald("opretLogin", { rolle: "player", email: "oscar@eksempel.invalid", kode: KODE, playerId: "p1" }, { bevis: admin.bevis });
t("samme e-mail kan bruges igen med det samme", r.status === 200 && !!r.result?.uid, r);
const igen = r.result?.uid;

r = await kald("sletLogin", { uid: admin.uid }, { bevis: admin.bevis });
t("en administrator kan ikke slette sin egen adgang", r.error?.status === "FAILED_PRECONDITION" && r.error.message === "Du kan ikke slette din egen adgang.", r);
t("og den er der stadig", !!(await brugerDok(admin.uid)) && !!(await brugerMedEmail(admin.email)));

await auth.deleteUser(igen);
r = await kald("sletLogin", { uid: igen }, { bevis: admin.bevis });
t("et login, der allerede er vaek i Auth, er ikke en fejl", r.status === 200 && ens(r.result, { uid: igen, brugerdokument: "slettet", spiller: "p1", login: "fandtes ikke" }), r);
t("users-dokumentet er slettet alligevel", (await brugerDok(igen)) === null);

r = await kald("sletLogin", { uid: nyTraener }, { bevis: admin.bevis });
t("en træner slettes: dokument og login, ingen spiller", r.status === 200 && ens(r.result, { uid: nyTraener, brugerdokument: "slettet", spiller: null, login: "slettet" }), r);
r = await kald("sletLogin", { uid: fremmed.uid }, { bevis: admin.bevis });
t("en Auth-konto uden users-dokument kan slettes", r.status === 200 && ens(r.result, { uid: fremmed.uid, brugerdokument: "fandtes ikke", spiller: null, login: "slettet" }), r);
r = await kald("sletLogin", { uid: "findes-slet-ikke" }, { bevis: admin.bevis });
t("et ukendt login-id giver et svar uden fejl, og intet er gjort", r.status === 200 && ens(r.result, { uid: "findes-slet-ikke", brugerdokument: "fandtes ikke", spiller: null, login: "fandtes ikke" }), r);
t("et spillerlogin, hvis spiller er slettet, skriver ingen tom spiller",
  await (async () => {
    const u = await auth.createUser({ email: "foraeldreloes@eksempel.invalid", password: KODE });
    await db.collection("users").doc(u.uid).set({ role: "player", playerId: "slettet-barn", active: true });
    const x = await kald("sletLogin", { uid: u.uid }, { bevis: admin.bevis });
    return x.status === 200 && x.result.spiller === null && !(await db.collection("players").doc("slettet-barn").get()).exists && !(await brugerDok(u.uid));
  })());

console.log("\nLogins · halvt oprettet ruller tilbage (koden kaldt direkte mod emulatoren)");
const logbog = [];
const logger = { info: (...a) => logbog.push(a), warn: (...a) => logbog.push(a), error: (...a) => logbog.push(a) };
const kalder = { uid: admin.uid, token: { email: admin.email } };
// 1) Selve skrivningen fejler.
const fejlendeDb = { collection: n => fdb.collection(n), runTransaction: f => fdb.runTransaction(f),
  batch: () => { const b = fdb.batch(); return { create: (...a) => b.create(...a), update: (...a) => b.update(...a),
    commit: async () => { throw Object.assign(new Error("simuleret fejl"), { code: 14 }); } }; } };
foerLogins = await antalLogins(); foerBrugere = await antalBrugere();
let kastet = null;
try{ await logins.opretLogin({ db: fejlendeDb, adminAuth: fAuth, FieldValue: fFieldValue, logger }, kalder,
  { rolle: "coach", email: "rul.tilbage@eksempel.invalid", kode: KODE, years: ["2017"] }); }catch(e){ kastet = e; }
t("fejler users-skrivningen, faar appen en dansk besked (internal)", kastet?.code === "internal" && /kunne ikke gemmes, så det er ikke oprettet/.test(kastet.message), kastet?.message);
t("og login'et er slettet igen: intet i Auth, intet i users", (await brugerMedEmail("rul.tilbage@eksempel.invalid")) === null
  && await antalLogins() === foerLogins && await antalBrugere() === foerBrugere);
// 2) En rigtig fejl i Firestore: spilleren forsvinder mellem laesningen og skrivningen.
await db.collection("players").doc("p-vaek").set({ name: "Forsvinder", year: "2017" });
let foersteLaesning = true;   // kun laesningen narres; skrivningen faar den rigtige reference
const forsvinderDb = { runTransaction: f => fdb.runTransaction(f), batch: () => fdb.batch(),
  collection: n => n !== "players" ? fdb.collection(n) : { doc: id => { const ref = fdb.collection(n).doc(id);
    if(!foersteLaesning) return ref;
    foersteLaesning = false;
    return { get: async () => { const s = await ref.get(); await ref.delete(); return s; } }; } } };
kastet = null;
try{ await logins.opretLogin({ db: forsvinderDb, adminAuth: fAuth, FieldValue: fFieldValue, logger }, kalder,
  { rolle: "player", email: "forsvinder@eksempel.invalid", kode: KODE, playerId: "p-vaek" }); }catch(e){ kastet = e; }
t("forsvinder spilleren undervejs, afviser Firestore skrivningen (NOT_FOUND), og login'et rulles tilbage",
  kastet?.code === "internal" && logbog.at(-1)?.[1]?.kode === 5 && logbog.at(-1)?.[1]?.rulletTilbage === true && (await brugerMedEmail("forsvinder@eksempel.invalid")) === null && await antalBrugere() === foerBrugere
  && !(await db.collection("players").doc("p-vaek").get()).exists, kastet?.message);
// 3) Loggen
await logins.opretLogin({ db: fdb, adminAuth: fAuth, FieldValue: fFieldValue, logger }, kalder,
  { rolle: "player", email: "log.test@eksempel.invalid", kode: KODE, playerId: "p2" });
const u = await brugerMedEmail("log.test@eksempel.invalid");
await logins.sletLogin({ db: fdb, adminAuth: fAuth, FieldValue: fFieldValue, logger }, kalder, { uid: u.uid });
try{ await logins.opretLogin({ db: fdb, adminAuth: fAuth, FieldValue: fFieldValue, logger }, kalder,
  { rolle: "coach", email: admin.email, kode: KODE, years: ["2017"] }); }catch{}
const log = JSON.stringify(logbog);
t("loggen rummer login-id'er, men ingen e-mails og ingen navne",
  logbog.length >= 5 && log.includes(u.uid) && !/@|eksempel\.invalid|Ida|Oscar|Forsvinder/.test(log), logbog);

console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
