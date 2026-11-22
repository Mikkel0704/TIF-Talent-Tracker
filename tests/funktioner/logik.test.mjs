// Serverens beregning af én ranglistelinje (functions/rangliste.js) paa smaa, haandregnede
// eksempler. Koden, der regnes med, er skaaret ud af index.html af functions/byg.mjs -
// koer `node ../functions/byg.mjs` foerst (npm run funktioner goer det).
//
// Testene koeres med en ANDEN tidszone end dansk (se package.json), saa de beviser, at
// serverkoden selv saetter Europe/Copenhagen.
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beregnLinje, linjerEns, klubTop, topEns, POINTREGLER, CLUB_TOP_N } from "../../functions/rangliste.js";

let ok = 0, fejlet = 0;
const t = (navn, b, ekstra) => { b ? (ok++, console.log("  ok   " + navn)) : (fejlet++, console.log("  FEJL  " + navn + (ekstra !== undefined ? "  -> " + JSON.stringify(ekstra) : ""))); };
const ts = iso => { const d = new Date(iso); return { toDate: () => d }; };   // som en Firestore-Timestamp
const NU = new Date("2026-11-18T11:00:00Z");   // onsdag 18/11 kl. 12 dansk tid
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const linje = (data, nu = NU) => beregnLinje(data, nu);
const spiller = (ekstra = {}) => ({ id: "a", name: "Anna", year: "2017", gender: "pige", ...ekstra });

console.log("\nServerens ranglistelinje · grundlaget");
t("tidszonen er sat til dansk tid af serverkoden selv", process.env.TZ === "Europe/Copenhagen");
t("POINTREGLER er den, der staar i index.html", POINTREGLER === /const POINTREGLER = "([^"]+)";/.exec(html)[1]);
t("CLUB_TOP_N er 10 som i appen", CLUB_TOP_N === 10);

console.log("\nTomt barn");
let l = linje({ player: { id: "a", name: "Anna", year: "U9" } });
t("et barn uden noget registreret faar 0 overalt", l.total === 0 && l.uge.point === 0 && l.maaned.point === 0, l);
t("ugen starter mandag 16/11, maaneden 1/11", l.uge.fra === "2026-11-16" && l.maaned.fra === "2026-11-01", l);
t("aargangen normaliseres som i appen (U9 -> 2017)", l.year === "2017");
t("uden koen er gender null, uden login kan barnet ikke udfordres", l.gender === null && l.kanUdfordres === false);
t("linjen har netop de aftalte felter og ingen 'opdateret'",
  JSON.stringify(Object.keys(l).sort()) === JSON.stringify(["gender", "kanUdfordres", "maaned", "name", "regler", "total", "uge", "year"]), Object.keys(l));
t("regler-feltet er POINTREGLER", l.regler === POINTREGLER);
t("kanUdfordres kun ved hasActiveLogin === true",
  linje({ player: spiller({ hasActiveLogin: true }) }).kanUdfordres === true && linje({ player: spiller({ hasActiveLogin: "ja" }) }).kanUdfordres === false);

console.log("\nKun Talentmaerke");
const indsendelser = [
  { playerId: "a", status: "approved", reviewedAt: ts("2026-11-17T09:00:00Z"), pointsAwarded: 20 },  // denne uge
  { playerId: "a", status: "approved", reviewedAt: ts("2026-11-10T09:00:00Z"), pointsAwarded: 15 },  // forrige uge, samme maaned
  { playerId: "a", status: "approved", reviewedAt: ts("2026-10-30T09:00:00Z"), pointsAwarded: 7 },   // forrige maaned
  { playerId: "a", status: "pending", reviewedAt: ts("2026-11-17T09:00:00Z"), pointsAwarded: 99 },   // ikke godkendt
  { playerId: "a", status: "approved", pointsAwarded: 50 },                                          // intet reviewedAt
  { playerId: "b", status: "approved", reviewedAt: ts("2026-11-17T09:00:00Z"), pointsAwarded: 30 }   // et andet barn
];
l = linje({ player: spiller({ points: 45 }), submissions: indsendelser });
t("total er spillerens tildelte point (players.points)", l.total === 45, l);
t("ugen taeller kun godkendte indsendelser med reviewedAt i ugen", l.uge.point === 20, l.uge);
t("maaneden taeller ogsaa forrige uge, men ikke oktober", l.maaned.point === 35, l.maaned);
t("reviewedAt som tekst (gamle data) virker ogsaa",
  linje({ player: spiller(), submissions: [{ playerId: "a", status: "approved", reviewedAt: "2026-11-17T09:00:00Z", pointsAwarded: 4 }] }).uge.point === 4);

console.log("\nJongleringsstigen");
const stige = { mainStep: 3, weakStep: 2, tricks: ["oploft", "oploft", "findesikke"] };
const stigelog = { entries: [
  { t: "main", v: 0, at: "2026-11-16T08:00:00Z" },
  { t: "main", v: 1, at: "2026-11-16T09:00:00Z" },
  { t: "main", v: 1, at: "2026-11-17T09:00:00Z" },     // samme trin igen: taeller kun én gang
  { t: "main", v: 7, at: "2026-11-17T09:00:00Z" },     // over det naaede: taeller ikke
  { t: "trick", v: "oploft", at: "2026-11-17T10:00:00Z" },
  { t: "trick", v: "oploft", at: "2026-11-17T11:00:00Z" },
  { t: "correct", at: "2026-11-17T12:00:00Z" },
  { t: "weak", v: 0, at: "2026-10-20T09:00:00Z" },     // forrige maaned
  { t: "weak", v: 1, at: "2026-11-05T09:00:00Z" }      // denne maaned, forrige uge
] };
l = linje({ player: spiller(), juggleLadderDoc: stige, juggleLogDoc: stigelog });
t("stigens total: 5+5+5 + 5+5 + oploeft 10 = 35 (dubletter og ukendte tricks taeller ikke)", l.total === 35, l.total);
t("ugen: trin 1 og 2 og oploeft én gang hver = 20", l.uge.point === 20, l.uge);
t("maaneden: + daarligt ben trin 2 (5) = 25", l.maaned.point === 25, l.maaned);
t("tildelte point og stigen laegges sammen", linje({ player: spiller({ points: 10 }), juggleLadderDoc: stige, juggleLogDoc: stigelog }).total === 45);

console.log("\nDe 16 tricks (pointreglerne 2026-11-23)");
const ALLE_TRICKS = ["oploft", "vrist", "skiftefod", "inderside5", "yderside5", "laarfod", "hoved", "gribfod", "inderside10", "yderside10",
  "haelbagom3", "jordenrundt", "hoved10", "inderside20", "yderside20", "haelbagom5"];
t("Jorden rundt giver 20 paa serveren (foer 15)", linje({ player: spiller(), juggleLadderDoc: { tricks: ["jordenrundt"] } }).total === 20);
t("de seks gamle tricks = 80 (foer 75)", linje({ player: spiller(), juggleLadderDoc: { tricks: ALLE_TRICKS.filter(x => ["oploft", "vrist", "skiftefod", "laarfod", "hoved", "jordenrundt"].includes(x)) } }).total === 80);
t("alle 16 tricks = 50 + 90 + 100 = 240", linje({ player: spiller(), juggleLadderDoc: { tricks: ALLE_TRICKS } }).total === 240);
t("hele stigen = 200 + 150 + 240 = 590", linje({ player: spiller(), juggleLadderDoc: { mainStep: 16, weakStep: 12, tricks: ALLE_TRICKS } }).total === 590);
l = linje({ player: spiller(), juggleLadderDoc: { mainStep: 1, tricks: ["inderside5", "inderside10", "hoved10"] }, juggleLogDoc: { entries: [
  { t: "trick", v: "inderside5", at: "2026-11-10T09:00:00Z" },    // forrige uge
  { t: "trick", v: "inderside10", at: "2026-11-17T09:00:00Z" },   // denne uge
  { t: "trick", v: "hoved10", at: "2026-11-17T10:00:00Z" },
  { t: "trick", v: "inderside20", at: "2026-11-17T11:00:00Z" },   // fortrudt igen: ikke i tricks, taeller ikke
  { t: "main", v: 0, at: "2026-11-17T09:00:00Z" }
] } });
t("nye tricks i vinduet efter loggens dato: uge 15 + 20 + trin 5 = 40, maaned + 10 = 50", l.uge.point === 40 && l.maaned.point === 50, [l.uge, l.maaned]);

console.log("\nDaglig fodteknik");
l = linje({ player: spiller(), footworkDoc: { days: { "2026-11-10": { t: 3, x: 2 } } } });
t("version 1-dag (foer FOOTWORK_V2_FRA): 3 toe-taps a 2 + kombi 2 = 8; en ny oevelse taeller ikke", l.total === 8, l);
t("og den ligger i forrige uge, men i maaneden", l.uge.point === 0 && l.maaned.point === 8, l);
l = linje({ player: spiller(), footworkDoc: { days: { "2026-11-17": { t: 1, p: 1, v: 1, c: 1 } } } });
t("version 2-dag: starter 2 + let 3 + mellem 4 + svaer 5 + ét fra hvert niveau 7 = 21", l.total === 21 && l.uge.point === 21 && l.maaned.point === 21, l);
l = linje({ player: spiller(), footworkDoc: { days: { "2026-11-17": { j: 3 } } } });
t("version 2: jongleringstraening 3 gange = 15 + samme oevelse 3 gange 5 = 20", l.total === 20, l);
l = linje({ player: spiller(), footworkDoc: { days: { "2026-11-17": { t: 25, p: 1.5, v: -2 }, "ikke-en-dato": { t: 3 } } } });
t("loftet paa 10 pr. oevelse holder, og skrald taeller ikke", l.total === linje({ player: spiller(), footworkDoc: { days: { "2026-11-17": { t: 10 } } } }).total, l);

console.log("\nStreak og joker");
l = linje({ player: spiller(), footworkDoc: { days: { "2026-11-14": { t: 1 }, "2026-11-15": { t: 1 }, "2026-11-16": { t: 1 } } } });
t("tre dage i traek: 3 x 2 + streak-bonus 5 = 11", l.total === 11, l);
t("bonussen hoerer til dagen, milepaelen blev naaet (mandag) - ugen faar 2 + 5", l.uge.point === 7, l.uge);
l = linje({ player: spiller(), footworkDoc: { days: { "2026-11-16": { t: 1 }, "2026-11-17": { t: 1 } } }, juggleLadderDoc: { mainStep: 0, days: ["2026-11-15"] } });
t("en dag paa stigen taeller som aktiv dag i streaken", l.total === 2 + 2 + 5, l);
const jokerFw = { days: { "2026-11-12": { t: 1 }, "2026-11-13": { t: 1 }, "2026-11-14": { t: 1 }, "2026-11-15": { t: 1 }, "2026-11-17": { t: 1 } },
  jokers: { "2026-11-14": "approved" }, jokerRequests: { "2026-11-16": true } };
l = linje({ player: spiller(), footworkDoc: jokerFw });
// 12 (v1: 2) + 13 (v1: 2) + 14 joker -> 0, bygger bro + 15 (v2: 2) = 6, forloeb 12-15 har 3 aktive dage -> +5.
// 16 er kun en ubehandlet anmodning: den bygger IKKE bro, saa 17 (2) staar alene.
t("godkendt joker: dagen giver 0, men bygger bro i streaken", l.total === 2 + 2 + 0 + 2 + 5 + 2, l);
t("en ubehandlet joker bygger ikke bro i pointene", l.uge.point === 2, l.uge);
l = linje({ player: spiller(), footworkDoc: { ...jokerFw, jokers: { "2026-11-14": "approved", "2026-11-16": "approved" } } });
t("godkendes den anden joker ogsaa, vokser forloebet til 4 aktive dage (ingen ny milepael)", l.total === 2 + 2 + 2 + 5 + 2, l);

console.log("\nUge- og maanedsgraenser i dansk tid");
// Mandag 16/11 kl. 00:00:30 dansk tid = soendag 23:00:30 UTC. Regnet i UTC ville ugen starte 9/11.
const MANDAG = new Date("2026-11-15T23:00:30Z");
l = linje({
  player: spiller(),
  submissions: [
    { playerId: "a", status: "approved", reviewedAt: ts("2026-11-15T22:59:59Z"), pointsAwarded: 1 },   // soendag 23:59:59
    { playerId: "a", status: "approved", reviewedAt: ts("2026-11-15T23:00:00Z"), pointsAwarded: 10 }   // mandag 00:00:00
  ],
  juggleLadderDoc: { mainStep: 1 }, juggleLogDoc: { entries: [{ t: "main", v: 0, at: "2026-11-15T23:00:10Z" }] },
  // Registreret bagud: soendagen ligger i forrige uge, selv om den skrives nu.
  footworkDoc: { days: { "2026-11-15": { j: 1 } } }
}, MANDAG);
t("mandag kl. 00:00:30 er ugen den nye uge (fra 16/11)", l.uge.fra === "2026-11-16", l.uge);
t("indsendelse godkendt mandag 00:00:00 taeller i ugen, soendag 23:59:59 ikke", l.uge.point === 10 + 5, l.uge);
t("en bagudregistrering paa soendagen havner i forrige uge, men i maaneden", l.maaned.point === 1 + 10 + 5 + 5, l.maaned);
const DEC = new Date("2026-11-30T23:05:00Z");   // tirsdag 1/12 kl. 00:05
l = linje({
  player: spiller(),
  submissions: [{ playerId: "a", status: "approved", reviewedAt: ts("2026-11-30T22:59:00Z"), pointsAwarded: 10 }],   // 30/11 kl. 23:59
  juggleLadderDoc: { mainStep: 1 }, juggleLogDoc: { entries: [{ t: "main", v: 0, at: "2026-11-30T23:01:00Z" }] }       // 1/12 kl. 00:01
}, DEC);
t("1/12 kl. 00:05: maaneden er december, ugen startede mandag 30/11", l.maaned.fra === "2026-12-01" && l.uge.fra === "2026-11-30", l);
t("30/11 kl. 23:59 taeller i ugen, ikke i maaneden", l.uge.point === 15 && l.maaned.point === 5, l);
const VINTERTID = new Date("2026-10-25T23:30:00Z");   // mandag 26/10 kl. 00:30, dagen efter skiftet til vintertid
l = linje({ player: spiller(), submissions: [
  { playerId: "a", status: "approved", reviewedAt: ts("2026-10-25T22:59:59Z"), pointsAwarded: 1 },
  { playerId: "a", status: "approved", reviewedAt: ts("2026-10-25T23:00:00Z"), pointsAwarded: 10 }
] }, VINTERTID);
t("efter skiftet til vintertid starter ugen stadig mandag kl. 00:00 dansk tid", l.uge.fra === "2026-10-26" && l.uge.point === 10, l.uge);

console.log("\nSlettet spiller og huskelisten");
t("findes spilleren ikke, er der ingen linje (den skal slettes)", linje({ player: null, footworkDoc: { days: { "2026-11-17": { t: 1 } } } }) === null);
const A = { player: spiller(), footworkDoc: { days: { "2026-11-17": { t: 3 } } } };
const B = { player: spiller({ id: "b", name: "Bo" }), footworkDoc: { days: { "2026-11-17": { c: 2 } } }, juggleLadderDoc: { mainStep: 5 } };
const a1 = linje(A), b1 = linje(B), a2 = linje(A);
t("to boern regnet skiftevis paavirker ikke hinanden", linjerEns(a1, a2) && !linjerEns(a1, b1) && b1.total === 10 + 30, { a1, b1, a2 });
const A2 = { ...A, footworkDoc: { days: { "2026-11-17": { t: 4 } } } };
t("nye data for samme barn samme dag giver nyt svar (footworkStamp haeves)", linje(A2).total === 4 * 2 + 5 && a1.total === 3 * 2 + 5, linje(A2));
t("en indsendelse til et andet barn i listen taeller ikke", linje({ ...A, submissions: [{ playerId: "b", status: "approved", reviewedAt: ts("2026-11-17T09:00:00Z"), pointsAwarded: 9 }] }).total === a1.total);
const gemt = process.env.TZ; process.env.TZ = "UTC";
let kastede = false; try { linje(A); } catch { kastede = true; }
process.env.TZ = gemt;
t("beregningen naegter at regne, hvis tidszonen ikke er dansk", kastede);

console.log("\nLinjer der er ens");
t("ens linjer er ens, ogsaa med et opdateret-felt paa den ene", linjerEns(a1, { ...a1, opdateret: { seconds: 1 } }));
t("andre ugepoint er en aendring", !linjerEns(a1, { ...a1, uge: { ...a1.uge, point: a1.uge.point + 1 } }));
t("en ny uge er en aendring", !linjerEns(a1, { ...a1, uge: { ...a1.uge, fra: "2026-11-09" } }));
t("ingen linje mod ingen linje er ens, ingen mod én er ikke", linjerEns(null, null) && !linjerEns(null, a1));

console.log("\nKlubbens top 10");
const linjer = [
  ["k", 50], ["c", 90], ["a", 90], ["m", 10], ["b", 5], ["z", 5], ["d", 70], ["e", 60], ["f", 40], ["g", 30], ["h", 20], ["i", 5], ["j", 1]
].map(([id, total]) => ({ id, name: "N" + id, year: "2017", total, uge: {}, ekstra: "skal ikke med" }));
const top = klubTop(linjer);
// Appens egen sortering paa listen i dokument-id-orden, som Firestore leverer den.
const appens = [...linjer].sort((x, y) => (x.id < y.id ? -1 : 1)).sort((x, y) => y.total - x.total).slice(0, CLUB_TOP_N).map(x => x.id);
t("hoejst 10 og sorteret efter total", top.length === 10 && top.every((r, i) => i === 0 || top[i - 1].total >= r.total));
t("samme raekkefoelge som appens sort((a,b)=>b.total-a.total).slice(0, 10)", JSON.stringify(top.map(r => r.id)) === JSON.stringify(appens), top.map(r => r.id));
t("lige point afgoeres efter id: a foer c, og ved graensen kommer b med, i og z ikke", top[0].id === "a" && top[1].id === "c" && top[9].id === "b" && !top.some(r => r.id === "i" || r.id === "z"));
t("hver plads har kun id, name, year og total", top.every(r => JSON.stringify(Object.keys(r).sort()) === '["id","name","total","year"]'));
t("toppen er uafhaengig af den orden, linjerne kommer i", JSON.stringify(klubTop([...linjer].reverse())) === JSON.stringify(top));
t("topEns ser forskel paa én plads", topEns({ top, regler: "x" }, { top, regler: "x" }) && !topEns({ top, regler: "x" }, { top: [...top].reverse(), regler: "x" }));
t("faerre end 10 boern giver en kortere liste", klubTop(linjer.slice(0, 3)).length === 3 && klubTop([]).length === 0);

console.log("\nbyg.mjs fejler hoejlydt");
const mappe = mkdtempSync(join(tmpdir(), "byg-"));
const BYG = fileURLToPath(new URL("../../functions/byg.mjs", import.meta.url));
const byg = (navn, aendret) => {
  const kilde = join(mappe, navn + ".html"), maal = join(mappe, navn + ".mjs");
  writeFileSync(kilde, aendret);
  const r = spawnSync(process.execPath, [BYG, kilde, maal], { encoding: "utf8" });
  return { kode: r.status, tekst: r.stdout + r.stderr, skrevet: existsSync(maal) };
};
let b = byg("uaendret", html);
t("en uaendret kopi af index.html bygger", b.kode === 0 && b.skrevet, b.tekst.slice(0, 300));
b = byg("mangler", html.replace("function ladderPointsInWindow(", "function ladderPointsIVindue("));
t("mangler en funktion, stopper den med navnet", b.kode !== 0 && /mangler function ladderPointsInWindow/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
b = byg("dobbelt", html.replace("function startOfMonth(", "function startOfWeek(d){ return d; }\nfunction startOfMonth("));
t("er en funktion defineret to gange, stopper den", b.kode !== 0 && /startOfWeek er defineret 2 gange/.test(b.tekst), b.tekst.slice(0, 300));
b = byg("regler", html.replace(/const POINTREGLER = "[^"]+";/, "const POINTREGLER = undefined;"));
t("staar POINTREGLER ikke som en tekst, stopper den", b.kode !== 0 && /POINTREGLER/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
b = byg("blok", html.replace("// DAGLIG FODTEKNIK", "// FODTEKNIK"));
t("er fodteknik-blokken flyttet, stopper den", b.kode !== 0 && /DAGLIG FODTEKNIK/.test(b.tekst), b.tekst.slice(0, 300));
b = byg("flyttet", html.replace("function iDagISO(", "function iDagISO2(") .replace("\nconst CHALLENGE_BONUS", "\nfunction iDagISO(){ return dagsISO(new Date()); }\nconst CHALLENGE_BONUS"));
t("ligger iDagISO ikke i blokken laengere, stopper den", b.kode !== 0 && /iDagISO ligger ikke i fodteknik-blokken/.test(b.tekst), b.tekst.slice(0, 300));
b = byg("kaster", html.replace("function totalPoints(p){", "function totalPoints(p){ return udefineretNavn;"));
t("kan den byggede kode ikke regne, stopper den ogsaa - og der ligger ingen halv fil", b.kode !== 0 && /udefineretNavn/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));

console.log("\nbyg.mjs fejler hoejlydt · Maanedens spiller");
for(const navn of ["maanedPlus", "forrigeMaaned", "maanedAfgoeres", "maanederTilKaaring", "maanedStat", "maanedSammenlign", "maanedensSpillerRangering"]){
  b = byg("m-" + navn, html.replace("function " + navn + "(", "function " + navn + "Omdoebt("));
  t(`mangler ${navn} i blokken, stopper den med navnet`, b.kode !== 0 && new RegExp(navn + " ligger ikke i fodteknik-blokken").test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
}
for(const navn of ["MAANEDENS_FOERSTE", "MAANEDENS_AFGOERES_DAG", "FOOTWORK_V2_FRA"]){
  b = byg("k-" + navn, html.replace("const " + navn + " =", "const " + navn + "_FLYTTET ="));
  t(`mangler const ${navn} i blokken, stopper den`, b.kode !== 0 && new RegExp("const " + navn + " ligger ikke i fodteknik-blokken").test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
}
for(const navn of ["migratePlayer", "inferYearFromNote"]){
  b = byg("f-" + navn, html.replace("function " + navn + "(", "function " + navn + "Omdoebt("));
  t(`mangler function ${navn}, stopper den med navnet`, b.kode !== 0 && new RegExp("mangler function " + navn).test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
}
b = byg("m-kaster", html.replace("function maanedStat(pid, maaned){", "function maanedStat(pid, maaned){ return udefineretMaaned;"));
t("kan kaaringen ikke regnes i den byggede kode, stopper den - og der ligger ingen halv fil", b.kode !== 0 && /udefineretMaaned/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
b = byg("m-forkert", html.replace("const MAANEDENS_AFGOERES_DAG = 5;", "const MAANEDENS_AFGOERES_DAG = 6;"));
t("regner kaaringen forkert paa proeveeksemplet, stopper den", b.kode !== 0 && /maanederTilKaaring virker ikke/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));

console.log("\nbyg.mjs fejler hoejlydt · Maanedens topscorer");
for(const navn of ["maanedTopscorerStat", "maanedTopscorerSammenlign", "maanedensTopscorerRangering", "topscorerVinder"]){
  b = byg("t-" + navn, html.replace("function " + navn + "(", "function " + navn + "Omdoebt("));
  t(`mangler ${navn} i blokken, stopper den med navnet`, b.kode !== 0 && new RegExp(navn + " ligger ikke i fodteknik-blokken").test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
}
b = byg("t-TOPSCORER_FELTER", html.replace("const TOPSCORER_FELTER =", "const TOPSCORER_FELTER_FLYTTET ="));
t("mangler const TOPSCORER_FELTER i blokken, stopper den", b.kode !== 0 && /const TOPSCORER_FELTER ligger ikke i fodteknik-blokken/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
b = byg("t-trin", html.replace("function ladderTrinIVindue(", "function ladderTrinIVindueOmdoebt("));
t("mangler function ladderTrinIVindue, stopper den med navnet", b.kode !== 0 && /mangler function ladderTrinIVindue/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
b = byg("t-kaster", html.replace("function maanedTopscorerStat(pid, maaned){", "function maanedTopscorerStat(pid, maaned){ return udefineretTopscorer;"));
t("kan topscoreren ikke regnes i den byggede kode, stopper den - og der ligger ingen halv fil", b.kode !== 0 && /udefineretTopscorer/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
b = byg("t-forkert", html.replace("(b.point - a.point) || (b.oevelser - a.oevelser)", "(a.point - b.point) || (b.oevelser - a.oevelser)"));
t("regner topscoreren forkert paa proeveeksemplet (faerrest point vinder), stopper den", b.kode !== 0 && /proeven paa Maanedens topscorer gav/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
b = byg("t-medaljer", html.replace("const vindue = since=>pointsInWindow(pid, since) + ladderPointsInWindow", "const vindue = since=>ladderPointsInWindow"));
t("glemmer topscoreren medaljepointene, stopper den ogsaa", b.kode !== 0 && /proeven paa Maanedens topscorer gav/.test(b.tekst) && !b.skrevet, b.tekst.slice(0, 300));
rmSync(mappe, { recursive: true, force: true });

console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
