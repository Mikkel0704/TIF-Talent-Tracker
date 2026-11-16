// Cloud Functions i emulatoren: de rigtige triggere (functions/index.js) mod en rigtig
// Firestore-emulator. Koeres af `npm run funktioner` inde i
//   firebase emulators:exec --config funktioner/firebase.json --only auth,firestore,functions,storage
// med egne porte (auth 9199, firestore 8990, functions 8995, hub 4410, logging 4510, eventarc 9310),
// saa den kan koere samtidig med `npm run regler`. Projektet er et demo-projekt: intet her
// kan naa produktion.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { createRequire } from "node:module";
import { beregnLinje, linjerEns, klubTop, POINTREGLER } from "../../functions/rangliste.js";
import * as funktioner from "../../functions/index.js";
import { kaarMaanedensSpiller } from "../../functions/server.js";
import { kaaringerAtOprette } from "../../functions/kaaring.js";
const { genberegn } = createRequire(import.meta.url)("../vaerktoej/genberegn-rangliste-logik.cjs");

const PROJEKT = process.env.GCLOUD_PROJECT;
if(!process.env.FIRESTORE_EMULATOR_HOST || !PROJEKT?.startsWith("demo-")) throw new Error("koeres kun i emulatoren med et demo-projekt (npm run funktioner)");
const db = getFirestore(initializeApp({ projectId: PROJEKT }));
// Serverkoden (server.js) bruger functions/'s egen firebase-admin; dens FieldValue skal
// skrives med en klient fra samme pakke. Til Maanedens spiller bruges derfor den.
const fra = createRequire(new URL("../../functions/package.json", import.meta.url));
const fdb = fra("firebase-admin/firestore").getFirestore(fra("firebase-admin/app").initializeApp({ projectId: PROJEKT }, "funktioner"));

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
const alleEnder = Object.entries(funktioner).map(([navn, f]) => ({ navn, e: f.__endpoint }));
const ender = alleEnder.filter(x => x.e?.eventTrigger);
const stier = ender.map(x => x.e?.eventTrigger?.eventFilterPathPatterns?.document).sort();
t("fem triggere: players, juggleLadder, juggleLog, footwork og submissions",
  JSON.stringify(stier) === JSON.stringify(["footwork/{id}", "juggleLadder/{id}", "juggleLog/{id}", "players/{id}", "submissions/{id}"]), stier);
t("ingen trigger paa rangliste eller klubRangliste - funktionen kan ikke udloese sig selv", !stier.some(s => /rangliste|klubRangliste/i.test(s)));
t("alle er onDocumentWritten, europe-west1, 256 MiB, 60 s, hoejst 3 instanser, ingen genforsoeg",
  ender.every(({ e }) => e.eventTrigger.eventType === "google.cloud.firestore.document.v1.written" && JSON.stringify(e.region) === '["europe-west1"]'
    && e.availableMemoryMb === 256 && e.timeoutSeconds === 60 && e.maxInstances === 3 && e.eventTrigger.retry === false && e.platform === "gcfv2"));
const planlagt = alleEnder.filter(({ e }) => e?.scheduleTrigger);
const kaldbare = alleEnder.filter(({ e }) => e?.callableTrigger);
t("netop én planlagt funktion ud over de fem, og det er maanedensKaaring",
  alleEnder.length - kaldbare.length === 6 && planlagt.length === 1 && planlagt[0].navn === "maanedensKaaring", alleEnder.map(x => x.navn));
t("og kun tre kaldbare funktioner: opretLogin og sletLogin (proeves i logins.test.mjs) og sletSpiller (sletning.test.mjs)",
  JSON.stringify(kaldbare.map(x => x.navn).sort()) === '["opretLogin","sletLogin","sletSpiller"]' && alleEnder.length === 9, kaldbare.map(x => x.navn));
const plan = funktioner.maanedensKaaring?.__endpoint;
t("maanedensKaaring koerer hver dag kl. 05:00 i Europe/Copenhagen",
  plan?.scheduleTrigger?.schedule === "0 5 * * *" && plan?.scheduleTrigger?.timeZone === "Europe/Copenhagen", plan?.scheduleTrigger);
t("ingen genforsoeg ud over standarden (retryConfig er tom)", JSON.stringify(plan?.scheduleTrigger?.retryConfig) === "{}", plan?.scheduleTrigger?.retryConfig);
t("europe-west1, 256 MiB, 60 s, hoejst 3 instanser, gcfv2",
  JSON.stringify(plan?.region) === '["europe-west1"]' && plan.availableMemoryMb === 256 && plan.timeoutSeconds === 60 && plan.maxInstances === 3 && plan.platform === "gcfv2", plan);
t("den kraever Cloud Scheduler-API'et", JSON.stringify(funktioner.maanedensKaaring.__requiredAPIs?.map(a => a.api)) === '["cloudscheduler.googleapis.com"]');

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

console.log("\nMaanedens spiller mod emulatoren");
await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJEKT}/databases/(default)/documents`, { method: "DELETE" });
const dage = (maaned, fra_, til, pr = { t: 1 }) => Object.fromEntries(Array.from({ length: til - fra_ + 1 }, (_, i) => [`${maaned}-${String(fra_ + i).padStart(2, "0")}`, pr]));
const boern = {
  k1: [{ name: "Oscar Kaaring", year: "2017", gender: "dreng" }, { year: "2017", days: { ...dage("2026-11", 1, 8), ...dage("2026-12", 1, 5) } }],
  k2: [{ name: "Ida Kaaring", year: "U9", gender: "pige" }, { year: "2017", days: { ...dage("2026-11", 1, 12), ...dage("2026-12", 1, 9) } }],
  k3: [{ name: "Carl Kaaring", year: "2016", gender: "dreng" }, { year: "2016", days: dage("2026-11", 3, 4, { j: 1 }), jokers: { "2026-11-04": "approved" } }],
  k4: [{ name: "Bo Kaaring", year: "2018", gender: "dreng" }, null]
};
for(const [id, [spiller, fodteknik]] of Object.entries(boern)){
  await db.collection("players").doc(id).set({ ...spiller, points: 0 });
  if(fodteknik) await db.collection("footwork").doc(id).set(fodteknik);
}
const KNU = new Date("2027-01-07T05:00:00+01:00");
const laesAlle = async navn => (await db.collection(navn).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const forventet_ = kaaringerAtOprette({ spillere: await laesAlle("players"), fodteknik: await laesAlle("footwork"), kaaringer: await laesAlle("maanedensSpiller") }, KNU);
const logbog = [];
const logger = { info: (...a) => logbog.push(a), error: (...a) => logbog.push(a) };
let ks = await kaarMaanedensSpiller(fdb, KNU, logger);
t("foerste koersel opretter november og december for 2018, 2017 og 2016",
  JSON.stringify(ks.oprettet) === '["2026-11_2018","2026-12_2018","2026-11_2017","2026-12_2017","2026-11_2016","2026-12_2016"]' && !ks.fejlet.length, ks);
const poster = Object.fromEntries((await db.collection("maanedensSpiller").get()).docs.map(d => [d.id, { data: d.data(), tid: d.updateTime.toMillis() }]));
t("posterne i databasen er dem, beregningen giver (felt for felt, undtagen beregnet)",
  forventet_.every(k => { const { beregnet, ...rest } = poster[k.id]?.data || {}; return JSON.stringify(rest) === JSON.stringify(k.post); }) && Object.keys(poster).length === forventet_.length,
  { db: Object.fromEntries(Object.entries(poster).map(([id, p]) => [id, p.data.vindere?.map(v => v.id)])) });
t("hver post har et servertidsstempel i beregnet", Object.values(poster).every(p => p.data.beregnet instanceof Timestamp));
t("Ida vinder november, Oscar december (Ida sprunget over); Carls jokerdag taeller ikke",
  poster["2026-11_2017"]?.data.vindere.map(v => v.id).join() === "k2" && poster["2026-12_2017"]?.data.vindere.map(v => v.id).join() === "k1"
  && poster["2026-11_2016"]?.data.vindere[0]?.dage === 1 && poster["2026-11_2018"]?.data.vindere.length === 0);
t("loggen naevner ingen navne", !/Kaaring"|Oscar|Ida|Carl|Bo /.test(JSON.stringify(logbog)), logbog.slice(-2));
await sov(1000);
ks = await kaarMaanedensSpiller(fdb, new Date("2027-01-08T05:00:00+01:00"), logger);
const efter = Object.fromEntries((await db.collection("maanedensSpiller").get()).docs.map(d => [d.id, d.updateTime.toMillis()]));
t("anden koersel skriver intet", ks.oprettet.length === 0 && Object.entries(poster).every(([id, p]) => efter[id] === p.tid), ks);

// En admins browser naar det foerst: posten skrives, efter at serveren har regnet, men foer
// den opretter. create() maa ikke overskrive den - heller ikke naar indholdet er et andet.
await db.collection("players").doc("k5").set({ name: "Ny Kaaring", year: "2015", points: 0 });
await db.collection("footwork").doc("k5").set({ year: "2015", days: dage("2026-11", 1, 3) });
const browserensPost = { maaned: "2026-11", aargang: "2015", vindere: [{ id: "k5", navn: "Ny Kaaring", dage: 99, minutter: 1, oevelser: 1, point: 1 }], beregnet: FieldValue.serverTimestamp() };
const kaploeb = { collection: navn => {
  const c = fdb.collection(navn);
  if(navn !== "maanedensSpiller") return c;
  return { get: () => c.get(), doc: id => ({ create: async d => {
    if(id === "2026-11_2015") await db.collection(navn).doc(id).set(browserensPost);
    return c.doc(id).create(d);
  } }) };
} };
ks = await kaarMaanedensSpiller(kaploeb, KNU, logger);
const k15 = (await db.collection("maanedensSpiller").doc("2026-11_2015").get()).data();
t("findes posten allerede ved create(), overskrives den ikke (dage 99 staar der stadig)", k15?.vindere?.[0]?.dage === 99, k15);
t("og aargangen stopper: december 2015 regnes ikke paa en november, serveren ikke kender",
  JSON.stringify(ks.findesAllerede) === '["2026-11_2015"]' && !ks.oprettet.length && !(await db.collection("maanedensSpiller").doc("2026-12_2015").get()).exists, ks);
ks = await kaarMaanedensSpiller(fdb, KNU, logger);
const dec15 = (await db.collection("maanedensSpiller").doc("2026-12_2015").get()).data();
t("naeste koersel bygger videre paa den gemte november: december 2015 uden vindere (k5 vandt november)",
  JSON.stringify(ks.oprettet) === '["2026-12_2015"]' && JSON.stringify(dec15?.vindere) === "[]", { ks, dec15 });

// Selve den planlagte funktion, kaldt direkte (som Cloud Scheduler ville). I dag (testens
// rigtige ur) er alt afgjort allerede kaaret, saa den skal intet skrive - og ikke fejle.
const foerKald = Object.fromEntries((await db.collection("maanedensSpiller").get()).docs.map(d => [d.id, d.updateTime.toMillis()]));
let kastet = null;
try{ await funktioner.maanedensKaaring.run({ scheduleTime: new Date().toISOString() }); }catch(e){ kastet = String(e?.message || e); }
const efterKald = Object.fromEntries((await db.collection("maanedensSpiller").get()).docs.map(d => [d.id, d.updateTime.toMillis()]));
const afgjorte = kaaringerAtOprette({ spillere: await laesAlle("players"), fodteknik: await laesAlle("footwork"), kaaringer: [] }, new Date()).length;
t("den planlagte funktions handler koerer mod emulatoren uden fejl og skriver kun det, der mangler",
  kastet === null && Object.entries(foerKald).every(([id, tid]) => efterKald[id] === tid)
  && Object.keys(efterKald).length === Math.max(Object.keys(foerKald).length, afgjorte) , { kastet, foer: Object.keys(foerKald).length, efter: Object.keys(efterKald).length, afgjorte });

console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
