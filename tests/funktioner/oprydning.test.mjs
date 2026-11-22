// Morgenoprydningen (functions/oprydning.js) mod Firestore- og Storage-emulatoren: joker-
// begrundelser 3 døgn efter afgørelsen og videoer efter appens regler (videoSkalSlettes).
// Koeres af `npm run funktioner` inde i emulators:exec (auth 9199, firestore 8990, storage 9299)
// med et demo-projekt - intet her kan naa produktion. Koden kaldes direkte med et fast "nu",
// saa graenserne (2 døgn 23 timer mod 3 døgn, 6 mod 7 dage) kan proeves praecist; til sidst
// koeres selve den planlagte funktion (maanedensKaaring) med det rigtige ur.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createRequire } from "node:module";
import * as funktioner from "../../functions/index.js";
import * as oprydning from "../../functions/oprydning.js";
import { VIDEO_BOETTE } from "../../functions/sletning.js";

const PROJEKT = process.env.GCLOUD_PROJECT;
const FS = process.env.FIRESTORE_EMULATOR_HOST, LAGER = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if(!FS || !LAGER || !PROJEKT?.startsWith("demo-")) throw new Error("koeres kun i emulatorerne med et demo-projekt (npm run funktioner)");
const app = initializeApp({ projectId: PROJEKT }, "oprydning");
const db = getFirestore(app), boette = getStorage(app).bucket(VIDEO_BOETTE);
// Serverkoden bruger functions/'s egen firebase-admin (FieldValue skal passe til dens klient).
const fra = createRequire(new URL("../../functions/package.json", import.meta.url));
const fApp = fra("firebase-admin/app").initializeApp({ projectId: PROJEKT }, "oprydning-funktioner");
const fdb = fra("firebase-admin/firestore").getFirestore(fApp);
const fBoette = fra("firebase-admin/storage").getStorage(fApp).bucket(VIDEO_BOETTE);
const { FieldValue } = fra("firebase-admin/firestore");

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const logbog = [];
const logger = { info: (...a) => logbog.push(a), warn: (...a) => logbog.push(a), error: (...a) => logbog.push(a) };
const deps = (over = {}) => ({ db: fdb, bucket: fBoette, FieldValue, logger, ...over });

await fetch(`http://${FS}/emulator/v1/projects/${PROJEKT}/databases/(default)/documents`, { method: "DELETE" });
{ const [filer] = await boette.getFiles(); await Promise.all(filer.map(f => f.delete({ ignoreNotFound: true }))); }
const dok = async sti => { const s = await db.doc(sti).get(); return s.exists ? { ...s.data(), _tid: s.updateTime.toMillis() } : null; };
const filer = async () => (await boette.getFiles())[0].map(f => f.name).sort();
async function tider(){
  const ud = {};
  for(const c of ["footworkLog", "submissions", "submissionVideos"]) for(const d of (await db.collection(c).get()).docs) ud[c + "/" + d.id] = d.updateTime.toMillis();
  return ud;
}

const NU = new Date("2026-11-22T05:00:00+01:00"), MS = NU.getTime(), H = 3600 * 1000, DAG = 24 * H, MIN = 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const A = { year: "2017", gender: "dreng" };

console.log("\nOprydning · joker-begrundelser");
await db.doc("footworkLog/j1").set({ ...A, entries: [], reasons: {
  "2026-11-10": { tekst: "syg", at: iso(MS - 5 * DAG), by: "u1", afgjort: "approved", afgjortAf: "t@x.invalid", afgjortAt: iso(MS - 3 * DAG - MIN) },
  "2026-11-11": { tekst: "ferie", at: iso(MS - 5 * DAG), by: "u1", afgjort: "rejected", afgjortAf: "t@x.invalid", afgjortAt: iso(MS - 3 * DAG + H) },
  "2026-11-12": { tekst: "til fest", at: iso(MS - 9 * DAG), by: "u1" },
  "2026-11-13": { tekst: "præcis", at: iso(MS - 5 * DAG), by: "u1", afgjort: "approved", afgjortAt: iso(MS - 3 * DAG) },
  "2026-11-01": { afgjort: "approved", afgjortAt: iso(MS - 20 * DAG) }
} });
await db.doc("footworkLog/j2").set({ ...A, entries: [], reasons: { "2026-11-14": { tekst: "syg", at: iso(MS - DAG), by: "u2" } } });
await db.doc("footworkLog/j3").set({ ...A, entries: [] });
let foer = await tider();
let svar = await oprydning.rydJokerBegrundelser(deps(), NU);
let j1 = await dok("footworkLog/j1");
t("svaret: 3 logge set, 1 begrundelse ryddet i 1 dokument, ingen fejl", ens(svar, { logge: 3, ryddet: 1, dokumenter: 1, fejl: [] }), svar);
t("afgjort for 3 døgn og 1 minut siden: teksten er væk", !("tekst" in j1.reasons["2026-11-10"]), j1.reasons["2026-11-10"]);
t("men afgørelsen, hvem og hvornår bliver (de bruges til streaken)", ens(Object.keys(j1.reasons["2026-11-10"]).sort(), ["afgjort", "afgjortAf", "afgjortAt", "at", "by"]));
t("afgjort for 2 døgn og 23 timer siden: teksten bliver", j1.reasons["2026-11-11"].tekst === "ferie");
t("præcis 3 døgn: bliver til næste morgen", j1.reasons["2026-11-13"].tekst === "præcis");
t("en ubehandlet anmodning beholder sin begrundelse, også efter 9 dage", j1.reasons["2026-11-12"].tekst === "til fest");
t("updatedAt er serverens tidsstempel, og loggens øvrige felter er urørte", j1.updatedAt instanceof Timestamp && j1.year === "2017" && ens(j1.entries, []));
let efter = await tider();
t("de andre logge er ikke skrevet", efter["footworkLog/j2"] === foer["footworkLog/j2"] && efter["footworkLog/j3"] === foer["footworkLog/j3"]);
foer = efter;
svar = await oprydning.rydJokerBegrundelser(deps(), NU);
t("en kørsel mere: intet at rydde, intet skrevet", svar.ryddet === 0 && ens(await tider(), foer), svar);
svar = await oprydning.rydJokerBegrundelser(deps(), new Date(MS + 2 * H));
j1 = await dok("footworkLog/j1");
t("to timer senere er 2 døgn 23 timer blevet til over 3 døgn - og præcis 3 døgn også", svar.ryddet === 2 && !("tekst" in j1.reasons["2026-11-11"]) && !("tekst" in j1.reasons["2026-11-13"]), svar);

console.log("\nOprydning · videoer");
const FIL = id => `submissions/u-oscar/${id}.mp4`;
const sub = (x) => ({ playerId: "p1", playerName: "Oscar", ...A, exercise: "Jonglering", stepIndex: 0, ...x });
const vid = (id, x = {}) => ({ playerId: "p1", ...A, videoURL: "https://eksempel.invalid/" + id, videoPath: FIL(id), decided: false, submittedAt: iso(MS - DAG), ...x });
const ts = ms => Timestamp.fromMillis(ms);
const DATA = {
  traening:   [sub({ status: "approved", submittedAt: iso(MS - DAG), reviewedAt: ts(MS - H), pointsAwarded: 25 }), vid("traening")],
  afvist:     [sub({ status: "rejected", submittedAt: iso(MS - DAG), reviewedAt: ts(MS - H), pointsAwarded: 0 }), vid("afvist")],
  gammel:     [sub({ status: "approved", submittedAt: iso(MS - DAG), reviewedAt: ts(MS - H), videoURL: "https://eksempel.invalid/gammel", videoPath: FIL("gammel") }), null],
  afventer6:  [sub({ status: "pending", submittedAt: iso(MS - 6 * DAG - 23 * H) }), vid("afventer6")],
  afventer7:  [sub({ status: "pending", submittedAt: iso(MS - 7 * DAG - MIN) }), vid("afventer7")],
  duelSet:    [sub({ status: "rejected", challengeId: "c1", submittedAt: iso(MS - DAG), reviewedAt: ts(MS - 5 * H) }), vid("duelSet", { decided: true, challengeId: "c1", viewedAt: ts(MS - 2 * H) })],
  duelSesNu:  [sub({ status: "approved", challengeId: "c1", submittedAt: iso(MS - DAG), reviewedAt: ts(MS - 5 * H) }), vid("duelSesNu", { decided: true, challengeId: "c1", viewedAt: ts(MS - 10 * MIN) })],
  duelFrist:  [sub({ status: "approved", challengeId: "c2", submittedAt: iso(MS - 3 * DAG), reviewedAt: ts(MS - 2 * DAG - MIN) }), vid("duelFrist", { decided: true, challengeId: "c2" })],
  duelUng:    [sub({ status: "approved", challengeId: "c3", submittedAt: iso(MS - 3 * DAG), reviewedAt: ts(MS - DAG - 23 * H) }), vid("duelUng", { decided: true, challengeId: "c3" })],
  duelVenter: [sub({ status: "pending", challengeId: "c4", submittedAt: iso(MS - DAG) }), vid("duelVenter", { challengeId: "c4" })],
  udenFil:    [sub({ status: "approved", submittedAt: iso(MS - DAG), reviewedAt: ts(MS - H) }), vid("udenFil")],
  ryddet:     [sub({ status: "pending", submittedAt: iso(MS - 9 * DAG) }), vid("ryddet", { videoURL: null, videoDeletedAt: ts(MS - 2 * DAG) })],
  guide:      [sub({ status: "approved", submittedAt: iso(MS - DAG), reviewedAt: ts(MS - H) }), vid("guide", { videoPath: "guides/f_v/1_guide.mp4" })],
  udenVideo:  [sub({ status: "approved", submittedAt: iso(MS - 30 * DAG), reviewedAt: ts(MS - 20 * DAG) }), null]
};
for(const [id, [s, v]] of Object.entries(DATA)){
  await db.doc("submissions/" + id).set(s);
  if(v) await db.doc("submissionVideos/" + id).set(v);
}
const VIDEO = Buffer.from("ikke en rigtig video");
const ALLE_FILER = [...Object.keys(DATA).filter(id => !["udenFil", "guide", "udenVideo"].includes(id)).map(FIL), "guides/f_v/1_guide.mp4", "submissions/u-anden/uden-link.mp4"];
await Promise.all(ALLE_FILER.map(sti => boette.file(sti).save(VIDEO, { contentType: "video/mp4" })));
foer = await tider();
logbog.length = 0;
svar = await oprydning.rydVideoer(deps(), NU);
t("svaret tæller hver grund: 5 behandlede træningsvideoer (én uden fil, én uden for videomappen), 1 udløbet, 1 set, 1 efter duel-fristen",
  ens(svar, { indsendelser: 14, slettet: { behandlet: 5, udloebet: 1, set: 1, duelfrist: 1 }, ugyldigSti: 1, fejl: [] }), svar);
const SLETTES = ["traening", "afvist", "gammel", "afventer7", "duelSet", "duelFrist"].map(FIL);
t("filerne er væk - de andre ligger der stadig, også instruktionsvideoen, en indsendelse pegede på, og en fil uden link",
  ens(await filer(), ALLE_FILER.filter(f => !SLETTES.includes(f)).sort()), await filer());
t("træningsvideoerne (godkendt og afvist) har mistet hele submissionVideos-dokumentet - som når træneren godkender",
  !(await dok("submissionVideos/traening")) && !(await dok("submissionVideos/afvist")) && !(await dok("submissionVideos/udenFil")) && !(await dok("submissionVideos/guide")));
const udl = await dok("submissionVideos/afventer7"), set = await dok("submissionVideos/duelSet"), frist = await dok("submissionVideos/duelFrist");
t("den udløbne og duelvideoerne har fået linket fjernet (videoURL null, videoDeletedAt fra serveren) - stien og resten bliver, som i appen",
  [udl, set, frist].every(d => d && d.videoURL === null && d.videoDeletedAt instanceof Timestamp && typeof d.videoPath === "string" && d.playerId === "p1"), [udl, set, frist]);
const gl = await dok("submissions/gammel");
t("en gammel video (linket på selve indsendelsen) får linket fjernet dér", gl.videoURL === null && gl.videoDeletedAt instanceof Timestamp && gl.status === "approved" && gl.pointsAwarded === undefined);
efter = await tider();
const roert = Object.keys(efter).filter(k => efter[k] !== foer[k]).concat(Object.keys(foer).filter(k => !(k in efter))).sort();
t("intet andet er skrevet: de 7 dage minus et minut gamle, duelvideoen, der lige nu ses, den unge duel, den ventende duel og den allerede ryddede er urørte",
  ens(roert, ["submissionVideos/afventer7", "submissionVideos/afvist", "submissionVideos/duelFrist", "submissionVideos/duelSet", "submissionVideos/guide", "submissionVideos/traening", "submissionVideos/udenFil", "submissions/gammel"]), roert);
t("indsendelserne (status og point) er urørte - ranglisten er uændret", Object.keys(DATA).filter(id => id !== "gammel").every(id => efter["submissions/" + id] === foer["submissions/" + id]));
const log = JSON.stringify(logbog);
t("loggen rummer antal, ingen filnavne, tekster eller links", !/\.mp4|eksempel\.invalid|syg|ferie|u-oscar/.test(log), logbog);

foer = await tider();
const filerFoer = await filer();
svar = await oprydning.rydVideoer(deps(), NU);
t("en kørsel mere har intet at gøre og skriver intet", ens(svar.slettet, { behandlet: 0, udloebet: 0, set: 0, duelfrist: 0 }) && ens(await tider(), foer) && ens(await filer(), filerFoer), svar);
svar = await oprydning.rydVideoer(deps(), new Date(MS + 2 * H));
t("to timer senere: 6 dage 23 timer er over 7 dage, den sete duelvideo er over en time, og den unge duel er over 2 døgn",
  ens(svar.slettet, { behandlet: 0, udloebet: 1, set: 1, duelfrist: 1 }) && !(await filer()).some(f => /afventer6|duelSesNu|duelUng/.test(f)), svar);
t("den ventende duel (ingen afgørelse, 1 dag gammel) ligger der stadig", (await filer()).includes(FIL("duelVenter")));

console.log("\nOprydning · en fejl stopper ikke resten - og aldrig kåringen");
await db.doc("submissions/f1").set(sub({ status: "approved", submittedAt: iso(MS - DAG), reviewedAt: ts(MS - H) }));
await db.doc("submissionVideos/f1").set(vid("f1"));
await db.doc("submissions/f2").set(sub({ status: "approved", submittedAt: iso(MS - DAG), reviewedAt: ts(MS - H) }));
await db.doc("submissionVideos/f2").set(vid("f2"));
await Promise.all(["f1", "f2"].map(id => boette.file(FIL(id)).save(VIDEO, { contentType: "video/mp4" })));
const fejlendeBoette = { file: sti => (sti === FIL("f1") ? { delete: async () => { throw Object.assign(new Error("simuleret fejl " + sti), { code: 503 }); } } : fBoette.file(sti)) };
logbog.length = 0;
svar = await oprydning.rydVideoer(deps({ bucket: fejlendeBoette }), NU);
t("filen, der ikke kunne slettes, meldes med id - og dens dokument står, så næste morgen prøver igen", ens(svar.fejl, ["f1"]) && !!(await dok("submissionVideos/f1"))?.videoURL, svar);
t("den anden blev ryddet alligevel", svar.slettet.behandlet === 1 && !(await dok("submissionVideos/f2")) && !(await filer()).includes(FIL("f2")));
t("fejlen logges uden filnavn", !/\.mp4|simuleret/.test(JSON.stringify(logbog)), logbog);
const fejlendeDb = { collection: n => (n === "footworkLog" ? { get: async () => { throw Object.assign(new Error("nede"), { code: 14 }); } } : fdb.collection(n)) };
let kastet = null, alt = null;
try{ alt = await oprydning.rydOp(deps({ db: fejlendeDb }), NU); }catch(e){ kastet = e; }
t("rydOp kaster aldrig: joker-delen fejlede, videodelen kørte alligevel", !kastet && alt?.joker?.fejlet === true && alt?.video?.fejl?.length === 0 && alt.video.slettet.behandlet === 1, { kastet: String(kastet), alt });

console.log("\nOprydning · den planlagte funktion rydder op hver morgen");
await db.doc("footworkLog/j9").set({ ...A, reasons: { "2026-11-01": { tekst: "syg", afgjort: "approved", afgjortAt: iso(Date.now() - 4 * DAG) } } });
await db.doc("submissions/rigtigNu").set(sub({ status: "pending", submittedAt: iso(Date.now() - 8 * DAG) }));
await db.doc("submissionVideos/rigtigNu").set(vid("rigtigNu", { submittedAt: iso(Date.now() - 8 * DAG) }));
await boette.file(FIL("rigtigNu")).save(VIDEO, { contentType: "video/mp4" });
kastet = null;
try{ await funktioner.maanedensKaaring.run({ scheduleTime: new Date().toISOString() }); }catch(e){ kastet = String(e?.message || e); }
t("maanedensKaaring kører uden fejl", kastet === null, kastet);
t("og har ryddet joker-begrundelsen og den udløbne video med det rigtige ur",
  !("tekst" in (await dok("footworkLog/j9")).reasons["2026-11-01"]) && (await dok("submissionVideos/rigtigNu")).videoURL === null && !(await filer()).includes(FIL("rigtigNu")));

console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
