// sletSpiller (functions/sletning.js) i emulatoren: "Slet alt" om et barn, kaldt over HTTP
// praecis som appens httpsCallable kalder den, med rigtige ID-beviser fra Auth-emulatoren og
// et App Check-bevis, emulatoren laeser uden at tjekke (se logins.test.mjs). Koeres af
// `npm run funktioner` inde i
//   firebase emulators:exec --config funktioner/firebase.json --only auth,firestore,functions,storage
// med egne porte (auth 9199, firestore 8990, functions 8995, storage 9299). Demo-projekt:
// intet her kan naa produktion. De rigtige ranglistetriggere koerer med, saa testen kan se,
// at ingen af dem genskaber det slettede barns linje.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { createRequire } from "node:module";
import * as funktioner from "../../functions/index.js";
import * as sletning from "../../functions/sletning.js";

const PROJEKT = process.env.GCLOUD_PROJECT;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST, FS = process.env.FIRESTORE_EMULATOR_HOST, LAGER = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if(!AUTH || !FS || !LAGER || !PROJEKT?.startsWith("demo-")) throw new Error("koeres kun i emulatorerne med et demo-projekt (npm run funktioner)");
const app = initializeApp({ projectId: PROJEKT }, "sletning");
const db = getFirestore(app), auth = getAuth(app);
const boette = getStorage(app).bucket(sletning.VIDEO_BOETTE);
// Til kald direkte i processen (en fejl, der skal sprøjtes ind): functions/'s egen firebase-admin.
const fra = createRequire(new URL("../../functions/package.json", import.meta.url));
const fApp = fra("firebase-admin/app").initializeApp({ projectId: PROJEKT }, "sletning-funktioner");
const fdb = fra("firebase-admin/firestore").getFirestore(fApp);
const fAuth = fra("firebase-admin/auth").getAuth(fApp);
const fBoette = fra("firebase-admin/storage").getStorage(fApp).bucket(sletning.VIDEO_BOETTE);
const { FieldValue: fFieldValue } = fra("firebase-admin/firestore");

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sov = ms => new Promise(r => setTimeout(r, ms));
async function vent(hvad, maks = 20000){
  const slut = Date.now() + maks;
  for(;;){ const v = await hvad(); if(v || Date.now() > slut) return v; await sov(150); }
}

// --- emulatorerne ---------------------------------------------------------------------
const toemLager = async () => { const [filer] = await boette.getFiles(); await Promise.all(filer.map(f => f.delete({ ignoreNotFound: true }))); };
await fetch(`http://${FS}/emulator/v1/projects/${PROJEKT}/databases/(default)/documents`, { method: "DELETE" });
await fetch(`http://${AUTH}/emulator/v1/projects/${PROJEKT}/accounts`, { method: "DELETE" });
await toemLager();
const logIndBevis = async (email, kode) => {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-noegle`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: kode, returnSecureToken: true }) });
  const j = await r.json();
  return r.ok ? j.idToken : null;
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const APP_CHECK = [b64({ alg: "none", typ: "JWT" }), b64({ sub: "1:727656181039:web:3be0054db82f85f415c5da", aud: ["projects/" + PROJEKT] }), "x"].join(".");
async function kald(data, { bevis = null, appCheck = true } = {}){
  const headers = { "content-type": "application/json" };
  if(bevis) headers.authorization = "Bearer " + bevis;
  if(appCheck) headers["x-firebase-appcheck"] = APP_CHECK;
  const r = await fetch(`http://127.0.0.1:8995/${PROJEKT}/europe-west1/sletSpiller`, { method: "POST", headers, body: JSON.stringify({ data }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, result: j.result, error: j.error };
}
const findesDok = async sti => (await db.doc(sti).get()).exists;
const dok = async sti => { const s = await db.doc(sti).get(); return s.exists ? { ...s.data(), _tid: s.updateTime.toMillis() } : null; };
const findesKonto = async uid => { try{ await auth.getUser(uid); return true; }catch{ return false; } };
const filer = async () => (await boette.getFiles())[0].map(f => f.name).sort();
// Et billede af ALT: hvert dokument med sit opdateringstidspunkt, hver fil og hver konto.
async function billede(){
  const docs = {};
  for(const c of await db.listCollections()) for(const d of (await c.get()).docs) docs[c.id + "/" + d.id] = d.updateTime.toMillis();
  return { docs, filer: await filer(), konti: (await auth.listUsers(1000)).users.map(u => u.uid).sort() };
}
const forskel = (a, b) => ({
  docs: [...new Set([...Object.keys(a.docs), ...Object.keys(b.docs)])].filter(k => a.docs[k] !== b.docs[k]),
  filer: a.filer.filter(f => !b.filer.includes(f)).concat(b.filer.filter(f => !a.filer.includes(f))),
  konti: a.konti.filter(f => !b.konti.includes(f)).concat(b.konti.filter(f => !a.konti.includes(f)))
});
const uroert = (a, b) => { const f = forskel(a, b); return !f.docs.length && !f.filer.length && !f.konti.length; };

// --- folkene og boernene ------------------------------------------------------------------
const KODE = "hemmelig-1";
async function person(navn, dok_){
  const u = await auth.createUser({ email: navn + "@eksempel.invalid", password: KODE });
  if(dok_) await db.collection("users").doc(u.uid).set({ email: u.email, ...dok_ });
  return { uid: u.uid, email: u.email, bevis: await logIndBevis(u.email, KODE) };
}
const admin   = await person("admin",   { role: "admin", active: true, years: ["2017"] });
const traener = await person("traener", { role: "coach", active: true, years: ["2017"] });
const lukket  = await person("lukket",  { role: "admin", active: false });
const fremmed = await person("fremmed", null);
// Freja slettes. Hun har et rigtigt login og et demo-login.
const freja   = await person("freja",   { role: "player", active: true, playerId: "s1", years: ["2017"], yearGenders: { "2017": "pige" }, demo: false });
const demo    = await person("demo",    { role: "player", active: true, playerId: "s1", years: ["2017"], demo: true });
// Bo er i samme aargang og skal staa uroert tilbage (paa naer det, han deler med Freja).
const bo      = await person("bo",      { role: "player", active: true, playerId: "s2", years: ["2017"] });
// En administrator, der selv er knyttet til et barn (s3).
const adminBarn = await person("admin.barn", { role: "admin", active: true, playerId: "s3", years: ["2017"] });
t("alle testpersoner fik et rigtigt ID-bevis", [admin, traener, lukket, fremmed, freja, demo, bo, adminBarn].every(p => typeof p.bevis === "string"));

const iDag = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const A = { year: "2017", gender: "pige" }, B = { year: "2017", gender: "dreng" };
await db.collection("players").doc("s1").set({ name: "Freja Slet", ...A, points: 500, passed: {}, history: [], hasActiveLogin: true });
await db.collection("players").doc("s2").set({ name: "Bo Bliver", ...B, points: 400, passed: {}, history: [], hasActiveLogin: true });
await db.collection("players").doc("s3").set({ name: "Admins Barn", year: "2017", points: 1 });
const saet = (sti, d) => db.doc(sti).set(d);
await Promise.all([
  saet("playerNotes/s1", { ...A, note: "venstrebenet" }),
  saet("juggleLadder/s1", { ...A, mainStep: 2, days: [iDag] }),
  saet("juggleLog/s1", { ...A, entries: [{ t: "main", v: 1, at: new Date().toISOString(), by: freja.uid }] }),
  saet("footwork/s1", { ...A, days: { [iDag]: { t: 2 } } }),
  saet("footworkLog/s1", { ...A, entries: [], reasons: {} }),
  saet("clubRanking/s1", { name: "Freja Slet", year: "2017", points: 500 }),
  saet("deletionRequests/s1", { playerId: "s1", playerName: "Freja Slet", year: "2017", requestedBy: freja.email, status: "pending", requestedAt: Timestamp.now() }),
  // Indsendelser: med sti i den nye mappe, uden video, med en gammel sti (mappen hed
  // spillerens id), en duel-indsendelse, og én hvis sti peger uden for videomappen.
  saet("submissions/sub1", { playerId: "s1", ...A, status: "pending", videoPath: `submissions/${freja.uid}/111_a.mp4` }),
  saet("submissions/sub2", { playerId: "s1", ...A, status: "approved", pointsAwarded: 25, reviewedAt: Timestamp.now() }),
  saet("submissions/sub3", { playerId: "s1", ...A, status: "pending", videoPath: "submissions/s1/222_b.mp4" }),
  saet("submissions/subD", { playerId: "s1", ...A, status: "pending", challengeId: "ch1" }),
  saet("submissions/sub4", { playerId: "s1", ...A, status: "pending", videoPath: "guides/f_v/1_guide.mp4" }),
  saet("submissionVideos/sub1", { playerId: "s1", ...A, videoPath: `submissions/${freja.uid}/111_a.mp4`, decided: false }),
  saet("submissionVideos/subD", { playerId: "s1", ...A, videoPath: `submissions/${demo.uid}/444_d.mp4`, decided: false, challengeId: "ch1" }),
  // Bos egne
  saet("submissions/subB", { playerId: "s2", ...B, status: "pending", videoPath: `submissions/${bo.uid}/333_c.mp4` }),
  saet("submissionVideos/subB", { playerId: "s2", ...B, videoPath: `submissions/${bo.uid}/333_c.mp4`, decided: false }),
  saet("juggleLadder/s2", { ...B, mainStep: 1, days: [iDag] }),
  saet("footwork/s2", { ...B, days: { [iDag]: { t: 1 } } }),
  saet("playerNotes/s2", { ...B, note: "hurtig" }),
  saet("clubRanking/s2", { name: "Bo Bliver", year: "2017", points: 400 }),
  // Dueller: Freja udfordrer Bo, Bo udfordrer Freja, og én uden Freja.
  saet("challenges/ch1", { challengerId: "s1", opponentId: "s2", year: "2017", status: "accepted" }),
  saet("challenges/ch2", { challengerId: "s2", opponentId: "s1", year: "2017", status: "pending" }),
  saet("challenges/ch3", { challengerId: "s2", opponentId: "x9", year: "2017", status: "pending" }),
  // Maanedens spiller: delt sejr, alene-sejr og en maaned uden Freja.
  saet("maanedensSpiller/2026-10_2017", { maaned: "2026-10", aargang: "2017", beregnet: Timestamp.fromMillis(1790000000000),
    vindere: [{ id: "s2", navn: "Bo Bliver", dage: 9, minutter: 13.5, oevelser: 9, point: 18 }, { id: "s1", navn: "Freja Slet", dage: 9, minutter: 13.5, oevelser: 9, point: 18 }] }),
  saet("maanedensSpiller/2026-11_2017", { maaned: "2026-11", aargang: "2017", beregnet: Timestamp.fromMillis(1792000000000),
    vindere: [{ id: "s1", navn: "Freja Slet", dage: 12, minutter: 18, oevelser: 12, point: 24 }] }),
  saet("maanedensSpiller/2026-09_2017", { maaned: "2026-09", aargang: "2017", beregnet: Timestamp.fromMillis(1788000000000),
    vindere: [{ id: "s2", navn: "Bo Bliver", dage: 5, minutter: 7.5, oevelser: 5, point: 10 }] }),
  // Maanedens topscorer: Freja alene, delt med Bo, og en maaned uden Freja. Samme id'er som
  // Maanedens spiller i en anden samling - de to maa ikke blandes sammen.
  saet("maanedensTopscorer/2026-10_2017", { maaned: "2026-10", aargang: "2017", beregnet: Timestamp.fromMillis(1790000000000),
    vindere: [{ id: "s1", navn: "Freja Slet", point: 90, oevelser: 20, svaer: 4, mellem: 3, let: 2, starter: 1 }] }),
  saet("maanedensTopscorer/2026-11_2017", { maaned: "2026-11", aargang: "2017", beregnet: Timestamp.fromMillis(1792000000000),
    vindere: [{ id: "s1", navn: "Freja Slet", point: 60, oevelser: 9, svaer: 0, mellem: 0, let: 9, starter: 0 }, { id: "s2", navn: "Bo Bliver", point: 60, oevelser: 9, svaer: 0, mellem: 0, let: 9, starter: 0 }] }),
  saet("maanedensTopscorer/2026-09_2017", { maaned: "2026-09", aargang: "2017", beregnet: Timestamp.fromMillis(1788000000000),
    vindere: [{ id: "x9", navn: "En Anden", point: 30, oevelser: 3, svaer: 1, mellem: 1, let: 1, starter: 0 }] })
]);
const VIDEO = Buffer.from("ikke en rigtig video");
const FREJAS_FILER = [`submissions/${freja.uid}/111_a.mp4`, `submissions/${freja.uid}/999_uden_link.mp4`,
  `submissions/${demo.uid}/444_d.mp4`, `submissions/${demo.uid}/555_uden_link.mp4`, "submissions/s1/222_b.mp4"].sort();
const ANDRE_FILER = [`submissions/${bo.uid}/333_c.mp4`, "guides/f_v/1_guide.mp4"].sort();
await Promise.all([...FREJAS_FILER, ...ANDRE_FILER].map(sti => boette.file(sti).save(VIDEO, { contentType: "video/mp4" })));
t("(testdata: syv filer i videoboetten)", ens(await filer(), [...FREJAS_FILER, ...ANDRE_FILER].sort()), await filer());

// Ranglisten: vent, til triggerne har skrevet begge linjer og klubbens top 10.
const top = async () => (await dok("klubRangliste/top"))?.top?.map(r => r.id) || [];
t("(testdata: triggerne har skrevet Frejas og Bos linjer, og begge er i klubbens top 10)",
  !!await vent(async () => (await findesDok("rangliste/s1")) && (await findesDok("rangliste/s2")) && (await top()).includes("s1") && (await top()).includes("s2")), await top());
await sov(3000);   // lad de sidste triggere blive faerdige, saa billedet ligger stille

console.log("\nSlet spiller · det, der udrulles");
const e = funktioner.sletSpiller?.__endpoint;
t("sletSpiller er en kaldbar funktion i europe-west1, 256 MiB, 60 s, hoejst 3 instanser, gcfv2 - som opretLogin og sletLogin",
  !!e?.callableTrigger && ens(e.region, ["europe-west1"]) && e.availableMemoryMb === 256 && e.timeoutSeconds === 60 && e.maxInstances === 3 && e.platform === "gcfv2"
  && ens(e, { ...funktioner.sletLogin.__endpoint }), e);
let foer = await billede();
let r = await kald({ playerId: "s1", kunOpgoer: true }, { bevis: admin.bevis, appCheck: false });
t("et kald uden App Check-bevis afvises (401, unauthenticated) - ogsaa fra en administrator", r.status === 401 && r.error?.status === "UNAUTHENTICATED", r);
r = await kald({ playerId: "s1", navn: "Freja Slet" }, { bevis: admin.bevis, appCheck: false });
t("ogsaa naar der skal slettes - og intet er roert", r.status === 401 && uroert(foer, await billede()), r);

console.log("\nSlet spiller · opgoerelsen");
foer = await billede();
r = await kald({ playerId: "s1", kunOpgoer: true }, { bevis: admin.bevis });
const opg = r.result;
t("svaret har navn og aargang", r.status === 200 && opg?.findes === true && opg.navn === "Freja Slet" && opg.aargang === "2017", r);
t("5 indsendelser, 2 dueller, 2 videodokumenter, 2 kaaringer som Maanedens spiller og 2 som topscorer",
  opg?.indsendelser === 5 && opg.udfordringer === 2 && opg.videodokumenter === 2 && opg.kaaringer === 2 && opg.topscorerKaaringer === 2, opg);
t("5 videofiler: de 3 med en sti i databasen og de 2 uden, der ligger i loginnenes mapper - ikke Bos og ikke guides/",
  opg?.videofiler === 5, opg?.videofiler);
t("de to logins med deres e-mails", ens((opg?.logins || []).map(l => l.email).sort(), [demo.email, freja.email].sort())
  && ens((opg?.logins || []).map(l => l.uid).sort(), [demo.uid, freja.uid].sort()), opg?.logins);
t("note, stige, stigelog, fodteknik, fodtekniklog, klub-rangliste, ranglistelinje og anmodning findes",
  ["note", "stige", "stigelog", "fodteknik", "fodtekniklog", "klubRangliste", "rangliste", "anmodning"].every(k => opg?.[k] === true), opg);
t("netop de felter", ens(Object.keys(opg || {}).sort(), ["aargang", "anmodning", "findes", "fodteknik", "fodtekniklog", "indsendelser", "kaaringer",
  "klubRangliste", "logins", "navn", "note", "playerId", "rangliste", "stige", "stigelog", "topscorerKaaringer", "udfordringer", "videodokumenter", "videofiler"].sort()), Object.keys(opg || {}).sort());
t("opgoerelsen skriver intet: ingen dokumenter, filer eller konti er roert", uroert(foer, await billede()), forskel(foer, await billede()));
r = await kald({ playerId: "s2", kunOpgoer: true }, { bevis: admin.bevis });
t("Bos opgoerelse: 1 indsendelse, 3 dueller, 1 videofil, 1 kaaring (den delte og hans egen = 2), 1 topscorer (den delte), 1 login",
  r.result?.indsendelser === 1 && r.result.udfordringer === 3 && r.result.videofiler === 1 && r.result.kaaringer === 2 && r.result.topscorerKaaringer === 1 && r.result.logins.length === 1, r.result);

console.log("\nSlet spiller · forkert navn, forkerte kaldere");
r = await kald({ playerId: "s1", navn: "Freja Slettet" }, { bevis: admin.bevis });
t("forkert navn: failed-precondition med den danske besked", r.error?.status === "FAILED_PRECONDITION" && r.error.message === "Navnet passede ikke. Intet er slettet.", r);
r = await kald({ playerId: "s1", navn: "freja slet" }, { bevis: admin.bevis });
t("store og smaa bogstaver skal passe", r.error?.status === "FAILED_PRECONDITION", r);
r = await kald({ playerId: "s1" }, { bevis: admin.bevis });
t("intet navn: invalid-argument", r.error?.status === "INVALID_ARGUMENT" && r.error.message === "Skriv spillerens navn for at bekræfte.", r);
r = await kald({ playerId: "s1/x", navn: "Freja Slet" }, { bevis: admin.bevis });
t("et ugyldigt id: invalid-argument", r.error?.status === "INVALID_ARGUMENT", r);
const ikkeAdmin = [["en træner", traener.bevis], ["et spillerlogin (Bo)", bo.bevis], ["Frejas eget login", freja.bevis], ["en, der ikke er logget ind", null],
  ["en deaktiveret administrator", lukket.bevis], ["en Auth-konto uden users-dokument", fremmed.bevis]];
for(const [navn, bevis] of ikkeAdmin){
  const x = await kald({ playerId: "s1", kunOpgoer: true }, { bevis });
  const y = await kald({ playerId: "s1", navn: "Freja Slet" }, { bevis });
  t(`${navn}: permission-denied - baade opgoerelse og sletning`,
    [x, y].every(z => z.status === 403 && z.error?.status === "PERMISSION_DENIED" && z.error.message === "Kun en administrator kan slette en spiller."), [x, y]);
}
const sBarn = await kald({ playerId: "s3", kunOpgoer: true }, { bevis: adminBarn.bevis });
const sBarn2 = await kald({ playerId: "s3", navn: "Admins Barn" }, { bevis: adminBarn.bevis });
t("et barn, der er knyttet til kalderens eget login, afvises (failed-precondition)",
  [sBarn, sBarn2].every(z => z.error?.status === "FAILED_PRECONDITION" && /det login, du selv er logget ind med/.test(z.error.message)), [sBarn, sBarn2]);
t("og intet af det har skrevet, slettet eller lukket noget", uroert(foer, await billede()), forskel(foer, await billede()));

console.log("\nSlet spiller · alt om Freja");
const frejaDocs = ["players/s1", "playerNotes/s1", "juggleLadder/s1", "juggleLog/s1", "footwork/s1", "footworkLog/s1", "clubRanking/s1",
  "deletionRequests/s1", "rangliste/s1", "submissions/sub1", "submissions/sub2", "submissions/sub3", "submissions/subD", "submissions/sub4",
  "submissionVideos/sub1", "submissionVideos/subD", "challenges/ch1", "challenges/ch2", `users/${freja.uid}`, `users/${demo.uid}`];
const kaaringFoer = { okt: await dok("maanedensSpiller/2026-10_2017"), nov: await dok("maanedensSpiller/2026-11_2017"), sep: await dok("maanedensSpiller/2026-09_2017") };
const topFoer = { okt: await dok("maanedensTopscorer/2026-10_2017"), nov: await dok("maanedensTopscorer/2026-11_2017"), sep: await dok("maanedensTopscorer/2026-09_2017") };
foer = await billede();
r = await kald({ playerId: "s1", navn: "  Freja Slet " }, { bevis: admin.bevis });
t("navnet tjekkes trimmet, og svaret siger faerdig uden fejl", r.status === 200 && r.result?.faerdig === true && ens(r.result.fejl, []), r);
t("svaret taeller hver slags", ens(r.result?.slettet, { videofiler: 5, videodokumenter: 2, indsendelser: 5, udfordringer: 2, kaaringer: 2, topscorerKaaringer: 2,
  klubRangliste: 1, note: 1, stige: 1, stigelog: 1, fodteknik: 1, fodtekniklog: 1, logins: 2, brugerdokumenter: 2, spiller: 1, rangliste: 1, anmodning: 1 }), r.result?.slettet);
const tilbage = [];
for(const sti of frejaDocs) if(await findesDok(sti)) tilbage.push(sti);
t("alle Frejas dokumenter er vaek - ogsaa brugerdokumenterne, anmodningen og ranglistelinjen", !tilbage.length, tilbage);
t("begge hendes logins er vaek i Authentication (ogsaa demo-login'et)", !(await findesKonto(freja.uid)) && !(await findesKonto(demo.uid)));
t("alle fem videofiler er vaek - Bos fil og instruktionsvideoen ligger der stadig (ogsaa den, Frejas indsendelse pegede paa)",
  ens(await filer(), ANDRE_FILER), await filer());
const okt = await dok("maanedensSpiller/2026-10_2017"), nov = await dok("maanedensSpiller/2026-11_2017");
t("delt kaaring: Bo staar tilbage som eneste vinder, praecis som foer", ens(okt?.vindere, kaaringFoer.okt.vindere.filter(v => v.id === "s2")), okt?.vindere);
t("Frejas egen kaaring staar uden vinder - posten er ikke slettet", nov && ens(nov.vindere, []));
t("begge har faaet et rettet-stempel fra serveren, og maaned, aargang og beregnet er uroert",
  [[okt, kaaringFoer.okt], [nov, kaaringFoer.nov]].every(([n, g]) => n.rettet instanceof Timestamp && n.maaned === g.maaned && n.aargang === g.aargang
    && n.beregnet.toMillis() === g.beregnet.toMillis() && ens(Object.keys(n).filter(k => k !== "_tid").sort(), ["aargang", "beregnet", "maaned", "rettet", "vindere"])));
t("kaaringen uden Freja er ikke roert", (await dok("maanedensSpiller/2026-09_2017"))?._tid === kaaringFoer.sep._tid);
const tOkt = await dok("maanedensTopscorer/2026-10_2017"), tNov = await dok("maanedensTopscorer/2026-11_2017");
t("Maanedens topscorer: Frejas egen staar uden vinder - posten er ikke slettet", tOkt && ens(tOkt.vindere, []), tOkt);
t("den delte: Bo staar tilbage med sine tal, praecis som foer", ens(tNov?.vindere, topFoer.nov.vindere.filter(v => v.id === "s2")), tNov?.vindere);
t("begge topscorer-poster har kun faaet vindere og rettet aendret",
  [[tOkt, topFoer.okt], [tNov, topFoer.nov]].every(([n, g]) => n.rettet instanceof Timestamp && n.maaned === g.maaned && n.aargang === g.aargang
    && n.beregnet.toMillis() === g.beregnet.toMillis() && ens(Object.keys(n).filter(k => k !== "_tid").sort(), ["aargang", "beregnet", "maaned", "rettet", "vindere"])));
t("topscoreren uden Freja er ikke roert", (await dok("maanedensTopscorer/2026-09_2017"))?._tid === topFoer.sep._tid);
const efter = await billede();
const aendret = forskel(foer, efter).docs.filter(k => !frejaDocs.includes(k));
t("ellers er kun de to kaaringer og klubbens top 10 aendret - Bos spiller, linje, login, indsendelse, note, stige og duel med en anden er uroert",
  ens(aendret.sort(), ["klubRangliste/top", "maanedensSpiller/2026-10_2017", "maanedensSpiller/2026-11_2017", "maanedensTopscorer/2026-10_2017", "maanedensTopscorer/2026-11_2017"]), aendret);
t("Bos login og de andre konti findes stadig", ens(efter.konti, foer.konti.filter(u => u !== freja.uid && u !== demo.uid)));

console.log("\nSlet spiller · ranglisten efter triggerne");
t("klubbens top 10 er uden Freja og har stadig Bo", !!await vent(async () => { const x = await top(); return !x.includes("s1") && x.includes("s2"); }), await top());
await sov(6000);   // triggerne paa de slettede indsendelser, stige, log og fodteknik naar at koere
t("efter triggerne er der stadig ingen linje for Freja", !(await findesDok("rangliste/s1")));
t("og klubbens top 10 rummer hende ikke", !(await top()).includes("s1") && !JSON.stringify((await dok("klubRangliste/top"))?.top).includes("Freja"), await top());
t("Bos linje er der stadig", await findesDok("rangliste/s2"));

console.log("\nSlet spiller · igen");
foer = await billede();
r = await kald({ playerId: "s1", navn: "Freja Slet" }, { bevis: admin.bevis });
t("en koersel mere lykkes og har intet at goere", r.status === 200 && r.result?.faerdig === true && ens(r.result.fejl, [])
  && Object.values(r.result.slettet || { x: 1 }).every(n => n === 0), r.result);
t("og skriver intet", uroert(foer, await billede()), forskel(foer, await billede()));
r = await kald({ playerId: "s1", kunOpgoer: true }, { bevis: admin.bevis });
t("opgoerelsen siger nu: findes ikke, intet tilbage", r.result?.findes === false && r.result.navn === null && r.result.indsendelser === 0
  && r.result.videofiler === 0 && r.result.logins.length === 0 && r.result.kaaringer === 0 && r.result.topscorerKaaringer === 0 && r.result.rangliste === false, r.result);

console.log("\nSlet spiller · en fejl undervejs, og en koersel mere goer det faerdigt");
const karl = await person("karl", { role: "player", active: true, playerId: "s4", years: ["2016"] });
await db.collection("players").doc("s4").set({ name: "Karl Fejl", year: "2016", gender: "dreng", points: 3, hasActiveLogin: true });
await db.doc("footwork/s4").set({ year: "2016", gender: "dreng", days: { [iDag]: { t: 1 } } });
await db.doc("deletionRequests/s4").set({ playerId: "s4", playerName: "Karl Fejl", year: "2016", status: "pending" });
const KARL = [`submissions/${karl.uid}/1_a.mp4`, `submissions/${karl.uid}/2_b.mp4`];
await Promise.all(KARL.map(sti => boette.file(sti).save(VIDEO, { contentType: "video/mp4" })));
await vent(() => findesDok("rangliste/s4"));
// Den ene fil kan ikke slettes (lageret svarer med en fejl).
const fejlendeBoette = { getFiles: o => fBoette.getFiles(o), file: sti => {
  const f = fBoette.file(sti);
  return sti !== KARL[1] ? f : { exists: () => f.exists(), delete: async () => { throw Object.assign(new Error("simuleret fejl"), { code: 503 }); } };
} };
const logbog = [];
const logger = { info: (...a) => logbog.push(a), warn: (...a) => logbog.push(a), error: (...a) => logbog.push(a) };
const deps = b => ({ db: fdb, adminAuth: fAuth, bucket: b, FieldValue: fFieldValue, logger });
const svar1 = await sletning.sletSpiller(deps(fejlendeBoette), { uid: admin.uid }, { playerId: "s4", navn: "Karl Fejl" });
t("fejlen meldes med art og id, og svaret siger ikke faerdig", svar1.faerdig === false && ens(svar1.fejl, [{ art: "videofil", id: KARL[1] }]), svar1);
t("den anden fil og fodteknikken er slettet, og login'et er vaek i Authentication",
  ens(await filer(), [...ANDRE_FILER, KARL[1]].sort()) && !(await findesDok("footwork/s4")) && !(await findesKonto(karl.uid)), { filer: await filer() });
const karlBruger = await dok(`users/${karl.uid}`);
t("users-dokumentet staar tilbage, men lukket (active false) - det peger paa login'et og dets mappe til naeste koersel",
  karlBruger?.active === false && karlBruger.playerId === "s4", karlBruger);
const karlSpiller = await dok("players/s4");
t("spilleren og anmodningen staar tilbage, saa admin kan trykke Slet alt igen - spilleren kan ikke laengere udfordres",
  karlSpiller?.name === "Karl Fejl" && karlSpiller.hasActiveLogin === false && await findesDok("deletionRequests/s4"), karlSpiller);
r = await kald({ playerId: "s4", kunOpgoer: true }, { bevis: admin.bevis });
t("opgoerelsen viser det, der er tilbage: 1 videofil og login'et", r.result?.findes === true && r.result.videofiler === 1 && r.result.logins.length === 1 && r.result.fodteknik === false, r.result);
r = await kald({ playerId: "s4", navn: "Karl Fejl" }, { bevis: admin.bevis });
t("koeres den igen, bliver den faerdig", r.status === 200 && r.result?.faerdig === true && ens(r.result.fejl, []), r);
t("og den taeller det, den selv naaede (login'et var allerede vaek)", r.result?.slettet.videofiler === 1 && r.result.slettet.logins === 0
  && r.result.slettet.brugerdokumenter === 1 && r.result.slettet.spiller === 1 && r.result.slettet.anmodning === 1 && r.result.slettet.fodteknik === 0, r.result?.slettet);
t("nu er alt om Karl vaek", ens(await filer(), ANDRE_FILER) && !(await findesDok("players/s4")) && !(await findesDok(`users/${karl.uid}`))
  && !(await findesDok("deletionRequests/s4")));
t("og hans linje kommer ikke igen", !!await vent(async () => !(await findesDok("rangliste/s4")) && !(await top()).includes("s4")) && (await sov(3000), !(await findesDok("rangliste/s4"))));

const log = JSON.stringify(logbog);
t("loggen rummer id'er og antal, men ingen e-mails, navne eller filnavne",
  logbog.length >= 2 && log.includes("s4") && !/@|eksempel\.invalid|Karl|Fejl|\.mp4|2_b/.test(log), logbog);

console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
