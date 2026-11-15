// Cloud Functions i emulatoren: de rigtige triggere (functions/index.js) mod en rigtig
// Firestore-emulator. Koeres af `npm run funktioner` inde i
//   firebase emulators:exec --config funktioner/firebase.json --only firestore,functions
// med egne porte (firestore 8990, functions 8995, hub 4410, logging 4510, eventarc 9310),
// saa den kan koere samtidig med `npm run regler`. Projektet er et demo-projekt: intet her
// kan naa produktion.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { createRequire } from "node:module";
import { beregnLinje, linjerEns, klubTop, POINTREGLER } from "../../functions/rangliste.js";
import * as funktioner from "../../functions/index.js";
const { genberegn } = createRequire(import.meta.url)("../vaerktoej/genberegn-rangliste-logik.cjs");

const PROJEKT = process.env.GCLOUD_PROJECT;
if(!process.env.FIRESTORE_EMULATOR_HOST || !PROJEKT?.startsWith("demo-")) throw new Error("koeres kun i emulatoren med et demo-projekt (npm run funktioner)");
const db = getFirestore(initializeApp({ projectId: PROJEKT }));

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };
const sov = ms => new Promise(r => setTimeout(r, ms));
async function vent(hvad, maks = 20000){
  const slut = Date.now() + maks;
  for(;;){ const v = await hvad(); if(v || Date.now() > slut) return v; await sov(150); }
}
const linje = async id => { const s = await db.collection("rangliste").doc(id).get(); return s.exists ? { ...s.data(), _tid: s.updateTime.toMillis() } : null; };
const top = async () => { const s = await db.collection("klubRangliste").doc("top").get(); return s.exists ? { ...s.data(), _tid: s.updateTime.toMillis() } : null; };
const iDag = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
// Det, linjen SKAL vaere: samme beregning paa de raa dokumenter, laest direkte.
async function forventet(id){
  const hent = async navn => { const s = await db.collection(navn).doc(id).get(); return s.exists ? { id, ...s.data() } : null; };
  const subs = (await db.collection("submissions").where("playerId", "==", id).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  return beregnLinje({ player: await hent("players"), juggleLadderDoc: await hent("juggleLadder"), juggleLogDoc: await hent("juggleLog"),
    footworkDoc: await hent("footwork"), submissions: subs }, new Date());
}
const stemmer = async id => linjerEns(await linje(id), await forventet(id));

await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJEKT}/databases/(default)/documents`, { method: "DELETE" });

console.log("\nCloud Functions · det, der udrulles");
const ender = Object.entries(funktioner).map(([navn, f]) => ({ navn, e: f.__endpoint }));
const stier = ender.map(x => x.e?.eventTrigger?.eventFilterPathPatterns?.document).sort();
t("fem triggere: players, juggleLadder, juggleLog, footwork og submissions",
  JSON.stringify(stier) === JSON.stringify(["footwork/{id}", "juggleLadder/{id}", "juggleLog/{id}", "players/{id}", "submissions/{id}"]), stier);
t("ingen trigger paa rangliste eller klubRangliste - funktionen kan ikke udloese sig selv", !stier.some(s => /rangliste|klubRangliste/i.test(s)));
t("alle er onDocumentWritten, europe-west1, 256 MiB, 60 s, hoejst 3 instanser, ingen genforsoeg",
  ender.every(({ e }) => e.eventTrigger.eventType === "google.cloud.firestore.document.v1.written" && JSON.stringify(e.region) === '["europe-west1"]'
    && e.availableMemoryMb === 256 && e.timeoutSeconds === 60 && e.maxInstances === 3 && e.eventTrigger.retry === false && e.platform === "gcfv2"));
t("ingen planlagt koersel", !ender.some(({ e }) => e.scheduleTrigger));

console.log("\nCloud Functions · en ny spiller og registreringer");
await db.collection("players").doc("a").set({ name: "Anna", year: "U9", gender: "pige", points: 10, hasActiveLogin: true });
let l = await vent(() => linje("a"));
t("en ny spiller faar en linje", !!l);
t("med navn, aargang (normaliseret), koen, kanUdfordres, total og pointregler",
  l && l.name === "Anna" && l.year === "2017" && l.gender === "pige" && l.kanUdfordres === true && l.total === 10 && l.regler === POINTREGLER, l);
t("og et opdateret-tidsstempel fra serveren", l?.opdateret instanceof Timestamp);
let tp = await vent(() => top());
t("klubRangliste/top foelger med", tp && tp.top.length === 1 && tp.top[0].id === "a" && tp.top[0].total === 10 && tp.regler === POINTREGLER, tp);

await db.collection("footwork").doc("a").set({ year: "2017", days: { [iDag]: { t: 3 } } });
l = await vent(async () => { const x = await linje("a"); return x && x.total > 10 && x; });
t("en fodteknik-registrering i dag flytter total, uge og maaned", l && l.total === 10 + 3 * 2 + 5 && l.uge.point === 11 && l.maaned.point === 11, l);
t("linjen er det samme, som beregningen giver paa de raa data", await stemmer("a"));

await db.collection("submissions").doc("s1").set({ playerId: "a", status: "approved", reviewedAt: Timestamp.now(), pointsAwarded: 25 });
l = await vent(async () => { const x = await linje("a"); return x && x.uge.point === 36 && x; });
t("en godkendt indsendelse taeller i uge og maaned (total kommer fra players.points)", l && l.total === 21 && l.maaned.point === 36, l);

await db.collection("juggleLadder").doc("a").set({ year: "2017", mainStep: 2, days: [iDag] });
await db.collection("juggleLog").doc("a").set({ year: "2017", entries: [{ t: "main", v: 1, at: new Date().toISOString() }, { t: "main", v: 0, at: new Date().toISOString() }] });
l = await vent(async () => { const x = await linje("a"); return x && x.uge.point === 36 + 8 && x; });
t("stigen og stigeloggen giver point i total og uge", l && l.total === 21 + 8, l);
t("og linjen stemmer stadig med beregningen", await stemmer("a"));

console.log("\nCloud Functions · intet at skrive");
await sov(2500);
const foer = await linje("a"), topFoer = await top();
await sov(2500);
t("linjen hviler: funktionen skriver ikke igen af sig selv", (await linje("a"))._tid === foer._tid);
await db.collection("players").doc("a").set({ note: "ikke noget, ranglisten viser" }, { merge: true });
await db.collection("footwork").doc("a").set({ updatedAt: Timestamp.now() }, { merge: true });
await sov(4000);
t("en skrivning, der ikke aendrer linjen, skriver intet", (await linje("a"))._tid === foer._tid);
t("og roerer ikke klubbens top 10", (await top())._tid === topFoer._tid);

console.log("\nCloud Functions · flere boern og klubbens top 10");
await db.collection("players").doc("b").set({ name: "Bo", year: "2014", points: 100 });
tp = await vent(async () => { const x = await top(); return x && x.top.length === 2 && x; });
t("en spiller med flere point gaar forrest", tp && tp.top.map(r => r.id).join() === "b,a", tp?.top);
for(let i = 0; i < 11; i++) await db.collection("players").doc("c" + String(i).padStart(2, "0")).set({ name: "C" + i, year: "2016", points: 20 });
tp = await vent(async () => { const x = await top(); return x && x.top.length === 10 && x.top.filter(r => r.total === 20).length === 8 && x; });
const alle = (await db.collection("rangliste").get()).docs.map(d => ({ id: d.id, ...d.data() }));
t("hoejst 10, og ved lige point afgoeres det efter id som i appen",
  tp && JSON.stringify(tp.top.map(r => r.id)) === JSON.stringify(klubTop(alle).map(r => r.id)), { db: tp?.top.map(r => r.id), forventet: klubTop(alle).map(r => r.id) });
t("toppen rummer kun id, navn, aargang og total", tp && tp.top.every(r => JSON.stringify(Object.keys(r).sort()) === '["id","name","total","year"]'));

console.log("\nCloud Functions · flytning, mange skrivninger og sletning");
await db.collection("submissions").doc("s1").update({ playerId: "b" });
l = await vent(async () => { const x = await linje("b"); return x && x.uge.point === 25 && x; });
t("flyttes en indsendelse til et andet barn, faar det barn pointene", !!l, await linje("b"));
t("og det foerste barn mister dem", await vent(async () => (await linje("a"))?.uge.point === 19));
await Promise.all(Array.from({ length: 8 }, (_, i) => db.collection("footwork").doc("b").set({ year: "2014", days: { [iDag]: { c: i + 1 } } })));
await db.collection("footwork").doc("b").set({ year: "2014", days: { [iDag]: { c: 4, t: 1 } } });
t("mange skrivninger lige efter hinanden ender i den rigtige linje", await vent(() => stemmer("b"), 30000), { db: await linje("b"), forventet: await forventet("b") });
await db.collection("players").doc("a").delete();
t("slettes spilleren, slettes linjen", await vent(async () => (await linje("a")) === null));
tp = await vent(async () => { const x = await top(); return x && !x.top.some(r => r.id === "a") && x; });
t("og barnet forsvinder fra klubbens top 10", !!tp, (await top())?.top.map(r => r.id));
await db.collection("footwork").doc("a").set({ year: "2017", days: { [iDag]: { t: 5 } } });
await sov(3000);
t("en registrering paa et slettet barn giver ingen ny linje", (await linje("a")) === null);

console.log("\nGenberegningsvaerktoejet mod emulatoren");
await sov(1500);
let r = await genberegn(db, { udfoer: false, FieldValue });
t("efter triggerne er der intet at rette", r.oprettes.length + r.aendres.length + r.slettes.length === 0 && !r.topAendres && r.uaendret === r.spillere, r);
await db.collection("rangliste").doc("b").delete();
await db.collection("rangliste").doc("c00").set({ total: 999, name: "forkert" }, { merge: true });
await db.collection("rangliste").doc("spoegelse").set({ name: "x", year: "2017", total: 5 });
await sov(1500);
r = await genberegn(db, { udfoer: false, FieldValue });
t("toerkoerslen finder én at oprette, én at rette og én at slette", r.oprettes.join() === "b" && r.aendres.join() === "c00" && r.slettes.join() === "spoegelse", r);
t("og den skriver intet", (await linje("b")) === null && (await linje("c00")).total === 999);
r = await genberegn(db, { udfoer: true, FieldValue });
t("--udfoer skriver dem", r.skrevet >= 3, r);
const bSkrevet = (await linje("b"))?._tid;
r = await genberegn(db, { udfoer: false, FieldValue });
t("laest tilbage stemmer alt", r.oprettes.length + r.aendres.length + r.slettes.length === 0 && !r.topAendres, r);
t("og linjerne er de samme, som triggerne ville skrive", await stemmer("b") && await stemmer("c00"));
await sov(3000);
t("vaerktoejets skrivninger udloeser ingen funktion (linjen hviler)", (await linje("b"))?._tid === bSkrevet && await stemmer("b"));

console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
