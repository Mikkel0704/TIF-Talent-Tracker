// Omlaegningen af Jongleringsstigen (vaerktoej/omlaeg-stige-logik.cjs) i emulatoren, med de
// rigtige ranglistetriggere koerende. Koeres af `npm run funktioner` inde i
//   firebase emulators:exec --config funktioner/firebase.json --only auth,firestore,functions,storage
// Demo-projekt: intet her kan naa produktion.
//
// Tilfaeldene er de rigtige data fra 2026-11-20: et barn paa gammelt mainStep 13 (100
// jongleringer) og weakStep 10 (30 beroeringer) med en log over trin 0-12, fortryd og en
// traenerrettelse - og boern, hvis trin betyder det samme foer og efter (mainStep 6, weakStep 3).
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beregnLinje, linjerEns } from "../../functions/rangliste.js";
const L = createRequire(import.meta.url)("../vaerktoej/omlaeg-stige-logik.cjs");

const PROJEKT = process.env.GCLOUD_PROJECT;
if(!process.env.FIRESTORE_EMULATOR_HOST || !PROJEKT?.startsWith("demo-")) throw new Error("koeres kun i emulatoren med et demo-projekt (npm run funktioner)");
const db = getFirestore(initializeApp({ projectId: PROJEKT }, "omlaeg-stige"));

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sov = ms => new Promise(r => setTimeout(r, ms));
async function vent(hvad, maks = 20000){
  const slut = Date.now() + maks;
  for(;;){ const v = await hvad(); if(v || Date.now() > slut) return v; await sov(150); }
}
const hent = async (navn, id) => { const s = await db.collection(navn).doc(id).get(); return s.exists ? s.data() : null; };
const linje = id => hent("rangliste", id);
async function forventet(id){
  const h = async navn => { const s = await db.collection(navn).doc(id).get(); return s.exists ? { id, ...s.data() } : null; };
  return beregnLinje({ player: await h("players"), juggleLadderDoc: await h("juggleLadder"), juggleLogDoc: await h("juggleLog"),
    footworkDoc: await h("footwork"), submissions: [] }, new Date());
}
// Alle dokumenters opdateringstid - saa en toerkoersel kan bevises at skrive ingenting.
const tider = async () => {
  const ud = {};
  for(const n of ["juggleLadder", "juggleLog", "stigeOmlaegning"])
    (await db.collection(n).get()).docs.forEach(d => { ud[n + "/" + d.id] = d.updateTime.toMillis(); });
  return ud;
};

await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJEKT}/databases/(default)/documents`, { method: "DELETE" });

console.log("\nOmlaegning · reglen");
t("de gamle stiger er frosset, som de stod", ens(L.OLD_MAIN, [3,5,7,10,15,20,25,30,35,40,55,75,100,125,150]) && ens(L.OLD_WEAK, [2,3,5,7,10,13,15,20,25,30])
  && Object.isFrozen(L.OLD_MAIN) && Object.isFrozen(L.OLD_WEAK));
t("de nye stiger er dem, index.html har", L.tjekIndex(readFileSync(new URL("../../index.html", import.meta.url), "utf8")).length === 0);
t("og vaerktoejet stopper, hvis index.html har andre", L.tjekIndex("\nconst JUGGLE_MAIN = [3,5];\nconst JUGGLE_WEAK = [2];").length === 2);
t("hovedstigen: gammel 25 -> 6 trin, 100 -> 11, 150 -> 13, 0 forbliver 0",
  ens([7, 13, 15, 0, 6].map(n => L.nytAntal(n, "main")), [6, 11, 13, 0, 6]));
t("daarligt ben: gammel 30 (trin 10) -> 8, 5 (trin 3) -> 3, 13 (trin 6) -> 5",
  ens([10, 3, 6].map(n => L.nytAntal(n, "weak")), [8, 3, 5]));
t("et haandskrevet trin over stigen klippes, som appen goer (99 -> 13)", L.nytAntal(99, "main") === 13);
t("logindeks: gammel 25 (6) -> nyt trin 20 (5), 55 (10) -> 50 (8), 150 (14) -> 150 (12)",
  ens([6, 10, 14].map(v => L.nytIndeks(v, "main")), [5, 8, 12]));
t("ingen faar et trin, de ikke har klaret: det nye tal er aldrig hoejere end det gamle",
  L.OLD_MAIN.every((n, v) => L.NEW_MAIN[L.nytIndeks(v, "main")] <= n) && L.OLD_WEAK.every((n, v) => L.NEW_WEAK[L.nytIndeks(v, "weak")] <= n));

// --- data som i produktion --------------------------------------------------------------
const nu = new Date().toISOString();
const SP = { year: "2017", gender: "dreng" };
const m13Log = [
  { t: "trick", v: "oploft", at: nu, by: "u1" },
  ...Array.from({ length: 13 }, (_, v) => ({ t: "main", v, at: nu, by: "u1" })),
  ...Array.from({ length: 10 }, (_, v) => ({ t: "weak", v, at: nu, by: "u1" })),
  { t: "undo", stige: "main", fra: 13, til: 12, at: nu, by: "u1" },
  { t: "main", v: 12, at: nu, by: "u1" },
  { t: "undo", stige: "weak", fra: 10, til: 9, at: nu, by: "u1" },
  { t: "weak", v: 9, at: nu, by: "u1" },
  { t: "correct", stige: "main", fra: 10, til: 13, at: nu, by: "t1", af: "traener@example.invalid" },
  { t: "correct", stige: "trick", trick: "vrist", til: "fjernet", at: nu, by: "t1", af: "traener@example.invalid" }
].reverse();   // nyeste foerst, som appen gemmer den
const m6Log = [...Array.from({ length: 6 }, (_, v) => ({ t: "main", v, at: nu })), ...Array.from({ length: 3 }, (_, v) => ({ t: "weak", v, at: nu }))].reverse();
for(const [id, navn] of [["m13", "A"], ["m6", "B"], ["w3", "C"], ["m7", "D"], ["rul", "E"]])
  await db.collection("players").doc(id).set({ name: "Test " + navn, year: "2017", gender: "dreng", points: 0 });
await db.collection("juggleLadder").doc("m13").set({ ...SP, mainStep: 13, weakStep: 10, tricks: ["oploft"] });
await db.collection("juggleLog").doc("m13").set({ ...SP, entries: m13Log });
await db.collection("juggleLadder").doc("m6").set({ ...SP, mainStep: 6, weakStep: 3, tricks: ["oploft"] });
await db.collection("juggleLog").doc("m6").set({ ...SP, entries: m6Log });
await db.collection("juggleLadder").doc("w3").set({ ...SP, weakStep: 3 });                 // kun daarligt ben
await db.collection("juggleLadder").doc("m7").set({ ...SP, mainStep: 7, tricks: ["oploft"] });   // gammel 25, ingen log
await db.collection("juggleLadder").doc("rul").set({ ...SP, mainStep: 2 });                // traeneren rullede tilbage fra 9
await db.collection("juggleLog").doc("rul").set({ ...SP, entries: [{ t: "correct", stige: "main", fra: 9, til: 2, at: nu }, { t: "main", v: 8, at: nu }] });
await vent(async () => (await linje("rul")) && (await linje("m13")) && (await linje("m7")));
await sov(1500);   // triggerne fra oprettelsen faar ro

console.log("\nOmlaegning · toerkoersel");
const foerToer = await tider();
const toer = await L.omlaeg(db, { udfoer: false, FieldValue });
t("toerkoerslen skriver intet", ens(await tider(), foerToer) && toer.skrevet === 0 && !(await hent("stigeOmlaegning", "koersel")));
t("den finder m13 (13 -> 11, 10 -> 8) og m7 (7 -> 6) - og ikke m6 eller w3",
  ens(toer.stigeAendres, [{ id: "m13", mainStep: [13, 11], weakStep: [10, 8] }, { id: "m7", mainStep: [7, 6], weakStep: null }]), toer.stigeAendres);
t("logge: m13 og rul aendres, m6 ikke", ens(toer.logAendres.map(x => x.id), ["m13", "rul"]), toer.logAendres);
t("rapporten rummer kun id'er og tal", !/Test|example|@/.test(L.resume(toer, false)), L.resume(toer, false));

console.log("\nOmlaegning · udfoer");
const foerUdf = await tider();
const r = await L.omlaeg(db, { udfoer: true, FieldValue });
const s13 = await hent("juggleLadder", "m13"), l13 = await hent("juggleLog", "m13");
t("m13: mainStep 13 -> 11 og weakStep 10 -> 8", s13.mainStep === 11 && s13.weakStep === 8, s13);
t("og stigen har stadig KUN appens felter (ingen kopi dér - reglerne ville afvise barnets naeste skrivning)",
  Object.keys(s13).sort().join() === "gender,mainStep,tricks,weakStep,year", Object.keys(s13));
t("kopien ligger paa loggen: stigeFoer {mainStep 13, weakStep 10, fra 2026-11-20, omlagt}",
  l13.stigeFoer?.mainStep === 13 && l13.stigeFoer?.weakStep === 10 && l13.stigeFoer?.fra === "2026-11-20" && !!l13.stigeFoer?.omlagt, l13.stigeFoer);
t("og entriesFoer er den gamle log, uroert", ens(l13.entriesFoer, m13Log));
const vMain = l13.entries.filter(e => e.t === "main").map(e => e.v), vWeak = l13.entries.filter(e => e.t === "weak").map(e => e.v);
t("hovedstigens poster: v 0..12 -> 0,1,2,3,4,5,5,6,6,7,8,9,10 (+ 10 for det gentagne trin)",
  ens(vMain.slice().reverse(), [0,1,2,3,4,5,5,6,6,7,8,9,10,10]), vMain);
t("daarligt bens poster: v 0..9 -> 0,1,2,3,4,4,5,6,6,7 (+ 7)", ens(vWeak.slice().reverse(), [0,1,2,3,4,4,5,6,6,7,7]), vWeak);
const undo = l13.entries.filter(e => e.t === "undo"), korr = l13.entries.filter(e => e.t === "correct");
t("fortryd: main 13 -> 12 bliver 11 -> 10, weak 10 -> 9 bliver 8 -> 7",
  ens(undo.map(e => [e.stige, e.fra, e.til]).reverse(), [["main", 11, 10], ["weak", 8, 7]]), undo);
t("traenerens rettelse 10 -> 13 bliver 8 -> 11, og trick-rettelsen er uroert",
  ens(korr.map(e => [e.stige, e.fra, e.til]).reverse(), [["main", 8, 11], ["trick", undefined, "fjernet"]]) && korr[0].af === "traener@example.invalid", korr);
t("tidspunkter, by og andre felter staar, som de stod", l13.entries.every((e, i) => e.at === m13Log[i].at && e.by === m13Log[i].by && e.t === m13Log[i].t));
const s7 = await hent("juggleLadder", "m7"), l7 = await hent("juggleLog", "m7");
t("m7 (gammel 25): mainStep 7 -> 6, og en log oprettes med aargang, koen og kopien",
  s7.mainStep === 6 && l7?.year === "2017" && l7?.gender === "dreng" && l7?.stigeFoer?.mainStep === 7 && l7?.stigeFoer?.weakStep === null && !("entries" in l7), l7);
const lr = await hent("juggleLog", "rul");
t("rul: et tilbagerullet trin i loggen (v 8) bliver v 6, rettelsen 9 -> 2 bliver 7 -> 2, stigen er uroert",
  ens(lr.entries.map(e => [e.t, e.v, e.fra, e.til]), [["correct", undefined, 7, 2], ["main", 6, undefined, undefined]])
  && !lr.stigeFoer && Array.isArray(lr.entriesFoer) && foerUdf["juggleLadder/rul"] === (await db.collection("juggleLadder").doc("rul").get()).updateTime.toMillis(), lr);
const tUdf = await tider();
t("m6 (mainStep 6, weakStep 3) og w3 (weakStep 3) er ikke roert",
  ["juggleLadder/m6", "juggleLog/m6", "juggleLadder/w3"].every(k => tUdf[k] === foerUdf[k]), { foerUdf, tUdf });
t("stigeOmlaegning/koersel er skrevet (dato og antal, ingen boernedata)",
  ens(Object.keys(await hent("stigeOmlaegning", "koersel")).sort(), ["fra", "logs", "omlagt", "stiger"]) && (await hent("stigeOmlaegning", "koersel")).fra === "2026-11-20");
t("rapporten: 2 stiger og 2 logge omlagt (6 skrivninger med koersel-dokumentet)", r.stigeAendres.length === 2 && r.logAendres.length === 2 && r.skrevet === 6, r);

console.log("\nOmlaegning · ranglisten bagefter");
// m13 med de nye trin: (4x5 + 4x10 + 3x15) + (3x5 + 3x10 + 2x15) + oploeft 10 = 105 + 75 + 10 = 190.
let l = await vent(async () => { const x = await linje("m13"); return x && x.total === 190 && x; });
t("serverens linje for m13 er 190 i alt", l?.total === 190, await linje("m13"));
t("og 190 i ugen og maaneden: hvert nyt trin taeller én gang, selv om loggen har dubletter",
  l?.uge?.point === 190 && l?.maaned?.point === 190, l);
t("og den stemmer med beregningen paa de raa data", linjerEns(l, await forventet("m13")));
l = await vent(async () => { const x = await linje("m7"); return x && x.total === 50 && x; });
t("m7: 6 trin (4x5 + 2x10) + oploeft = 50", l?.total === 50, await linje("m7"));
l = await linje("m6");
t("m6 er uaendret: 4x5 + 2x10 + 3x5 + oploeft = 65", l?.total === 65, l);

console.log("\nOmlaegning · igen");
await sov(1500);
const foerIgen = await tider();
const igen = await L.omlaeg(db, { udfoer: true, FieldValue });
t("en ny koersel ser koersel-dokumentet og roerer intet", !!igen.alleredeKoert && igen.skrevet === 0 && ens(await tider(), foerIgen), igen);
t("og melder alle som sprunget over", igen.sprungetStige.length === 5 && igen.sprungetLog.length === 4 && /allerede koert/.test(L.resume(igen, true)));
// Er koersel-dokumentet vaek, er kopierne paa loggene det andet vaern.
await db.collection("stigeOmlaegning").doc("koersel").delete();
const uden = await L.omlaeg(db, { udfoer: false, FieldValue });
t("uden koersel-dokumentet springes m13 og m7 over paa stigeFoer, m13 og rul paa entriesFoer",
  ens(uden.sprungetStige, ["m13", "m7"]) && ens(uden.sprungetLog, ["m13", "rul"]) && !uden.stigeAendres.length && !uden.logAendres.length, uden);
t("og resten er uaendret", uden.uaendret === 2, uden);

console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
