// Serverens kaaring af Maanedens spiller og Maanedens topscorer (functions/kaaring.js og
// kaarMaanedensSpiller i functions/server.js) paa smaa, haandregnede eksempler. Koden, der regnes med, er skaaret
// ud af index.html af functions/byg.mjs - koer `node ../functions/byg.mjs` foerst (npm run
// funktioner goer det).
//
// Koeres med en ANDEN tidszone end dansk (se package.json), saa testene beviser, at
// serverkoden selv saetter Europe/Copenhagen - ogsaa for, hvornaar "den 5." begynder.
const PROCESSENS_TZ = process.env.TZ;
const { kaaringerAtOprette, alleKaaringerAtOprette, topscorereAtOprette, MAANEDENS_FOERSTE, MAANEDENS_AFGOERES_DAG } = await import("../../functions/kaaring.js");
const { kaarMaanedensSpiller } = await import("../../functions/server.js");
import { readFileSync } from "node:fs";

let ok = 0, fejlet = 0;
const t = (navn, b, ekstra) => { b ? (ok++, console.log("  ok   " + navn)) : (fejlet++, console.log("  FEJL  " + navn + (ekstra !== undefined ? "  -> " + JSON.stringify(ekstra) : ""))); };
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

// Hjaelpere: spillere, fodteknik og dage.
const sp = (id, year = "2017", gender = "dreng", ekstra = {}) => ({ id, name: "Navn " + id, year, gender, ...ekstra });
const dage = (maaned, fra, til, pr = { t: 1 }) => Object.fromEntries(Array.from({ length: til - fra + 1 }, (_, i) => [`${maaned}-${String(fra + i).padStart(2, "0")}`, pr]));
const fw = (id, days, ekstra = {}) => ({ id, days, ...ekstra });
const DEC5 = new Date("2026-12-05T09:00:00+01:00");
const kaar = (data, nu = DEC5) => kaaringerAtOprette(data, nu);
const ider = liste => liste.map(k => k.id);
const vindere = (liste, id) => liste.find(k => k.id === id)?.post.vindere.map(v => v.id);

console.log("\nMaanedens spiller paa serveren · grundlaget");
t("processen startede i en anden tidszone (" + PROCESSENS_TZ + "), serverkoden satte dansk tid", PROCESSENS_TZ !== "Europe/Copenhagen" && process.env.TZ === "Europe/Copenhagen");
t("foerste maaned og afgoerelsesdag er dem i index.html",
  MAANEDENS_FOERSTE === /const MAANEDENS_FOERSTE = "([^"]+)";/.exec(html)[1] && MAANEDENS_AFGOERES_DAG === Number(/const MAANEDENS_AFGOERES_DAG = (\d+);/.exec(html)[1]));

console.log("\nHvornaar");
const basis = { spillere: [sp("p1"), sp("p2")], fodteknik: [fw("p1", dage("2026-11", 1, 8)), fw("p2", dage("2026-11", 1, 12))] };
t("4. december kl. 23:59:59 dansk tid: intet", kaar(basis, new Date("2026-12-04T22:59:59Z")).length === 0);
t("5. december kl. 00:00:00 dansk tid (23:00 UTC): november kaares", JSON.stringify(ider(kaar(basis, new Date("2026-12-04T23:00:00Z")))) === '["2026-11_2017"]');
t("i november (foer den foerste kaaring) kaares intet - heller ikke oktober", kaar(basis, new Date("2026-11-20T12:00:00+01:00")).length === 0);
t("5. januar kl. 00:00 dansk tid: november og december, i raekkefoelge",
  JSON.stringify(ider(kaar(basis, new Date("2027-01-04T23:00:00Z")))) === '["2026-11_2017","2026-12_2017"]');
t("4. januar kl. 23:59 dansk tid: kun november", JSON.stringify(ider(kaar(basis, new Date("2027-01-04T22:59:00Z")))) === '["2026-11_2017"]');

console.log("\nPosten");
let r = kaar(basis);
t("november: Ida-agtige p2 (12 dage) vinder over p1 (8)", JSON.stringify(vindere(r, "2026-11_2017")) === '["p2"]', r);
t("posten har maaned, aargang og vindere - beregnet saetter den, der skriver",
  JSON.stringify(Object.keys(r[0].post)) === '["maaned","aargang","vindere"]' && r[0].post.maaned === "2026-11" && r[0].post.aargang === "2017" && r[0].id === "2026-11_2017");
t("vinderen: id, navn, 12 dage, 18 min, 12 oevelser, 24 point (som appens egen test)",
  JSON.stringify(r[0].post.vindere[0]) === JSON.stringify({ id: "p2", navn: "Navn p2", dage: 12, minutter: 18, oevelser: 12, point: 24 }), r[0].post.vindere[0]);

console.log("\nAargange");
r = kaar({ spillere: [sp("a", "2016"), sp("b", "U9"), sp("c", "2017", "pige"), sp("d", "2018")],
  fodteknik: [fw("a", dage("2026-11", 1, 3)), fw("b", dage("2026-11", 1, 2)), fw("c", dage("2026-11", 1, 5)), fw("spoegelse", dage("2026-11", 1, 20))] });
t("hver aargang med spillere faar en post, nyeste aargang foerst (som allKnownYears)", JSON.stringify(ider(r)) === '["2026-11_2018","2026-11_2017","2026-11_2016"]', ider(r));
t("drenge og piger i samme aargang dyster sammen (U9 = 2017): pigen c vinder", JSON.stringify(vindere(r, "2026-11_2017")) === '["c"]');
t("en aargang med spillere, hvor ingen har traenet, faar en post uden vindere", JSON.stringify(vindere(r, "2026-11_2018")) === "[]");
t("fodteknik uden en spiller giver ingen aargang og ingen vinder", !r.some(k => k.post.vindere.some(v => v.id === "spoegelse")));
r = kaar({ spillere: [sp("e", "", "dreng", { note: "U10 nyt barn" }), sp("f", undefined)], fodteknik: [fw("e", dage("2026-11", 1, 2))] });
t("en spiller uden aargang faar den, noten peger paa - ellers 2017 (appens migratePlayer)", JSON.stringify(ider(r)) === '["2026-11_2017","2026-11_2016"]', ider(r));
t("ingen spillere: ingen poster", kaar({ spillere: [], fodteknik: [fw("x", dage("2026-11", 1, 9))] }).length === 0);

console.log("\nIndhaling og forrige maaned");
const tre = { spillere: [sp("p1"), sp("p2"), sp("p3", "2016")],
  fodteknik: [fw("p1", { ...dage("2026-11", 1, 8), ...dage("2026-12", 1, 5), ...dage("2027-01", 1, 9) }),
              fw("p2", { ...dage("2026-11", 1, 12), ...dage("2026-12", 1, 9), ...dage("2027-01", 1, 3) }),
              fw("p3", dage("2026-12", 1, 2))] };
r = kaar(tre, new Date("2027-02-05T05:00:00+01:00"));
t("ingen poster: november, december og januar for hver aargang, i raekkefoelge",
  JSON.stringify(ider(r)) === '["2026-11_2017","2026-12_2017","2027-01_2017","2026-11_2016","2026-12_2016","2027-01_2016"]', ider(r));
t("ikke samme vinder to maaneder i traek: p2 vinder november, p1 december (p2 sprunget over), p2 januar igen",
  JSON.stringify([vindere(r, "2026-11_2017"), vindere(r, "2026-12_2017"), vindere(r, "2027-01_2017")]) === '[["p2"],["p1"],["p2"]]');
t("i januar var p1 bedst, men vandt december - saa vinder p2 med 3 dage", r.find(k => k.id === "2027-01_2017").post.vindere[0].dage === 3);
t("2016: ingen i november, p3 i december, og ingen i januar (p3 vandt december og er den eneste)",
  JSON.stringify([vindere(r, "2026-11_2016"), vindere(r, "2026-12_2016"), vindere(r, "2027-01_2016")]) === '[[],["p3"],[]]');
const nov = { id: "2026-11_2017", maaned: "2026-11", aargang: "2017", vindere: [{ id: "p1", navn: "Navn p1" }] };
r = kaar({ ...tre, kaaringer: [nov] }, new Date("2027-02-06T05:00:00+01:00"));
t("to manglende maaneder hales ind: december og januar, november roeres ikke",
  JSON.stringify(ider(r).filter(i => i.endsWith("2017"))) === '["2026-12_2017","2027-01_2017"]', ider(r));
t("decembers 'forrige vinder' er den GEMTE (p1), ikke den, tallene ville give: p2 vinder december",
  JSON.stringify(vindere(r, "2026-12_2017")) === '["p2"]' && JSON.stringify(vindere(r, "2027-01_2017")) === '["p1"]', [vindere(r, "2026-12_2017"), vindere(r, "2027-01_2017")]);
const gemt = [nov, { id: "2026-12_2017", maaned: "2026-12", aargang: "2017", vindere: [] }, { id: "2026-11_2016", maaned: "2026-11", aargang: "2016", vindere: [] }];
r = kaar({ ...tre, kaaringer: gemt }, new Date("2027-01-10T05:00:00+01:00"));
t("en gemt kaaring regnes aldrig om - heller ikke naar tallene siger noget andet", JSON.stringify(ider(r)) === '["2026-12_2016"]', ider(r));
t("og en gemt post uden vindere taeller som forrige maaned (2016 december kaares)", JSON.stringify(vindere(r, "2026-12_2016")) === '["p3"]');
t("er alt kaaret, er der intet at goere", kaar({ ...tre, kaaringer: [...gemt, { id: "2026-12_2016", vindere: [] }] }, new Date("2027-01-10T05:00:00+01:00")).length === 0);
t("en vinder fra forrige maaned i en gammel post uden vindere-felt goer ingen skade",
  JSON.stringify(vindere(kaar({ ...tre, kaaringer: [{ id: "2026-11_2017" }] }, new Date("2027-01-10T05:00:00+01:00")), "2026-12_2017")) === '["p2"]');

console.log("\nDelt pris, jokere og fodteknik-versioner");
r = kaar({ spillere: [sp("zz"), sp("bb1", "2017", "pige"), sp("m")], fodteknik: [fw("zz", dage("2026-11", 1, 4)), fw("bb1", dage("2026-11", 11, 14)), fw("m", dage("2026-11", 1, 3))] });
// zz: 4 v1-dage a 2 point; bb1: 3 v1-dage (11-13) + 14/11 (v2: Starter 2) - ens paa alle fire tal.
// (Ingen "aa" i id'erne: appen ordner med localeCompare, og paa dansk er "aa" = "å" efter "z".)
t("helt lige: prisen deles, ordnet efter id", JSON.stringify(vindere(r, "2026-11_2017")) === '["bb1","zz"]', r[0].post.vindere);
r = kaar({ spillere: [sp("a"), sp("b")], fodteknik: [
  fw("a", dage("2026-11", 1, 5), { jokers: { "2026-11-02": "approved", "2026-11-03": "approved", "2026-11-09": "approved" } }),
  fw("b", dage("2026-11", 1, 4), { jokers: { "2026-11-02": "rejected" }, jokerRequests: { "2026-11-03": true } })] });
t("dage med en godkendt joker taeller ikke (a: 5 - 2 = 3 dage); afvist og ubehandlet joker taeller (b: 4)",
  JSON.stringify(vindere(r, "2026-11_2017")) === '["b"]' && r[0].post.vindere[0].dage === 4, r[0].post.vindere);
r = kaar({ spillere: [sp("a")], fodteknik: [fw("a", { "2026-11-10": { t: 3, x: 2 }, "2026-11-17": { t: 1, p: 1, v: 1, c: 1 }, "2026-10-31": { t: 9 }, "2026-12-01": { t: 9 } })] });
// 10/11 (version 1): x fandtes ikke -> 3 toe-taps: 3 oevelser, 9 halve min, 3x2 + kombi 2 = 8 point
// 17/11 (version 2): 4 oevelser, 12 halve min, 2+3+4+5 + én fra hvert niveau 7 = 21 point
t("version 1- og version 2-dage i samme maaned: 2 dage, 10,5 min, 7 oevelser, 29 point (oktober og december taeller ikke)",
  JSON.stringify(r[0].post.vindere[0]) === JSON.stringify({ id: "a", navn: "Navn a", dage: 2, minutter: 10.5, oevelser: 7, point: 29 }), r[0].post.vindere[0]);
r = kaar({ spillere: [sp("a")], fodteknik: [fw("a", { "2026-11-10": { j: 1 }, "2026-11-20": { j: 1, m: 2 } })] });
// 10/11: jongleringstraening (v1) 5 min, 8 point. 20/11: j 5 min + mur 2 x 5 min, 3 x 5 point.
t("jongleringstraening: 5 min og 8 point i version 1; grundtraening 5 min og 5 point i version 2",
  JSON.stringify(r[0].post.vindere[0]) === JSON.stringify({ id: "a", navn: "Navn a", dage: 2, minutter: 20, oevelser: 4, point: 23 }), r[0].post.vindere[0]);

console.log("\nMaanedens topscorer · hvornaar og i hvilken orden");
const orden = liste => liste.map(k => (k.samling === "maanedensSpiller" ? "S " : "T ") + k.id);
const alleKaar = (data, nu = DEC5) => alleKaaringerAtOprette(data, nu);
const top = (data, nu = DEC5) => topscorereAtOprette(data, nu);
t("4. december kl. 23:59:59 dansk tid: heller ingen topscorer", alleKaar(basis, new Date("2026-12-04T22:59:59Z")).length === 0);
t("5. december kl. 00:00 dansk tid: Maanedens spiller og lige efter topscoreren for samme maaned og aargang",
  JSON.stringify(orden(alleKaar(basis, new Date("2026-12-04T23:00:00Z")))) === '["S 2026-11_2017","T 2026-11_2017"]');
r = alleKaar({ ...tre }, new Date("2027-02-05T05:00:00+01:00"));
t("tre maaneder i to aargange: aargang for aargang, maaned for maaned, S foer T",
  JSON.stringify(orden(r)) === JSON.stringify(["2026-11_2017", "2026-12_2017", "2027-01_2017", "2026-11_2016", "2026-12_2016", "2027-01_2016"].flatMap(id => ["S " + id, "T " + id])), orden(r));
t("kaaringerAtOprette giver stadig kun Maanedens spiller, i samme form som foer",
  JSON.stringify(kaaringerAtOprette(tre, new Date("2027-02-05T05:00:00+01:00"))) === JSON.stringify(r.filter(k => k.samling === "maanedensSpiller").map(({ samling, ...k }) => k)));
t("topscorer-posten har maaned, aargang og vindere", JSON.stringify(Object.keys(r[1].post)) === '["maaned","aargang","vindere"]' && r[1].post.maaned === "2026-11" && r[1].post.aargang === "2017");
const topV = (liste, id) => liste.find(k => k.samling === "maanedensTopscorer" && k.id === id)?.post.vindere.map(v => v.id);
t("november 2017: p2 er Maanedens spiller, saa p1 er topscorer", JSON.stringify(topV(r, "2026-11_2017")) === '["p1"]');
t("december 2017: p1 er Maanedens spiller (p2 sprunget over), saa p2 er topscorer - selvom p2 vandt november",
  JSON.stringify(topV(r, "2026-12_2017")) === '["p2"]');
t("januar 2017: p2 er Maanedens spiller igen, og p1 er topscorer igen", JSON.stringify(topV(r, "2027-01_2017")) === '["p1"]');
t("2016: p3 er den eneste med point og er Maanedens spiller i december -> ingen topscorer; ingen point -> ingen topscorer",
  JSON.stringify([topV(r, "2026-11_2016"), topV(r, "2026-12_2016"), topV(r, "2027-01_2016")]) === "[[],[],[]]");
t("vinderen: id, navn, point, oevelser, svaer, mellem, let, starter (p1 i november: 8 version 1-dage a 2 point + streak 3/5/7 = 36)",
  JSON.stringify(r[1].post.vindere[0]) === JSON.stringify({ id: "p1", navn: "Navn p1", point: 36, oevelser: 8, svaer: 0, mellem: 0, let: 8, starter: 0 }), r[1].post.vindere[0]);

console.log("\nMaanedens topscorer · alle point, efter maaned");
const ts = iso => ({ toDate: () => new Date(iso), seconds: Math.floor(new Date(iso) / 1000) });   // som Firestores Timestamp
const pointData = {
  spillere: [sp("a"), sp("b", "2017", "pige"), sp("c"), sp("v")],
  fodteknik: [fw("a", { "2026-11-20": { t: 1 } }), fw("b", { "2026-11-20": { k: 1 } }), fw("v", dage("2026-11", 1, 20))],
  indsendelser: [
    { id: "s1", playerId: "a", status: "approved", reviewedAt: ts("2026-11-30T22:59:59Z"), pointsAwarded: 25 },   // 30/11 23:59:59 dansk tid
    { id: "s2", playerId: "b", status: "approved", reviewedAt: ts("2026-11-30T23:00:00Z"), pointsAwarded: 80 },   // 1/12 - december
    { id: "s3", playerId: "c", status: "pending", reviewedAt: ts("2026-11-10T10:00:00Z"), pointsAwarded: 50 } ],
  stiger: [{ id: "c", mainStep: 2, weakStep: 1, tricks: ["oploft"] }],
  stigelogge: [{ id: "c", entries: [{ t: "trick", v: "oploft", at: "2026-11-12T10:00:00+01:00" }, { t: "weak", v: 0, at: "2026-11-11T10:00:00+01:00" },
    { t: "main", v: 1, at: "2026-11-09T10:00:00+01:00" }, { t: "main", v: 0, at: "2026-10-30T10:00:00+01:00" }] }]
};
r = alleKaar(pointData);
const tv = id => r.find(k => k.samling === "maanedensTopscorer" && k.id === id)?.post.vindere;
// a: 2 (starter) + 25 (medalje 30/11) = 27; b: 5 (svaer) - medaljen er godkendt i december; c: trin 2 og daarligt ben 1 (10) + Oploeft (10) = 20.
t("v er Maanedens spiller; a vinder med 27 point: fodteknik 2 + medalje godkendt 30/11 kl. 23:59:59 dansk tid (25)",
  JSON.stringify(tv("2026-11_2017")) === JSON.stringify([{ id: "a", navn: "Navn a", point: 27, oevelser: 1, svaer: 0, mellem: 0, let: 0, starter: 1 }]), tv("2026-11_2017"));
const tal = topscorereAtOprette(pointData, DEC5);
{
  // Barnet alene med v, som er Maanedens spiller (og derfor ikke kan vinde topscorer).
  const kun = id => alleKaaringerAtOprette({ ...pointData, spillere: pointData.spillere.filter(p => p.id === id || p.id === "v") }, DEC5).find(k => k.samling === "maanedensTopscorer").post.vindere[0];
  t("b: kun svaer-oevelsen (5) - medaljen er godkendt 1/12 kl. 00:00 dansk tid og hoerer til december", JSON.stringify(kun("b")) === JSON.stringify({ id: "b", navn: "Navn b", point: 5, oevelser: 1, svaer: 1, mellem: 0, let: 0, starter: 0 }), kun("b"));
  t("c: hovedtrin 2 og daarligt ben 1 i november (5 + 5) + Oploeft (10) = 20 point, 2 oevelser (trick er ingen oevelse, oktobers trin taeller ikke, den ventende medalje heller ikke)",
    JSON.stringify(kun("c")) === JSON.stringify({ id: "c", navn: "Navn c", point: 20, oevelser: 2, svaer: 0, mellem: 0, let: 0, starter: 0 }), kun("c"));
}
t("topscorereAtOprette giver kun topscorer-posterne", tal.length === 1 && tal[0].id === "2026-11_2017" && !("samling" in tal[0]));

console.log("\nMaanedens topscorer · gemte poster");
const nov17 = { id: "2026-11_2017", maaned: "2026-11", aargang: "2017", vindere: [{ id: "p1", navn: "Navn p1" }] };
r = alleKaar({ ...tre, kaaringer: [nov17] }, DEC5);
t("findes Maanedens spiller allerede (en GEMT post med en anden vinder end tallene), kaares kun topscoreren - paa den gemte vinder",
  JSON.stringify(orden(r)) === '["T 2026-11_2017","S 2026-11_2016","T 2026-11_2016"]' && JSON.stringify(topV(r, "2026-11_2017")) === '["p2"]', orden(r));
r = alleKaar({ ...tre, kaaringer: [nov17], topscorere: [{ id: "2026-11_2017", vindere: [] }] }, DEC5);
t("findes begge, roeres 2017 ikke", JSON.stringify(orden(r)) === '["S 2026-11_2016","T 2026-11_2016"]', orden(r));
r = alleKaar({ ...tre, kaaringer: [{ id: "2026-12_2017", vindere: [] }] }, new Date("2027-01-10T05:00:00+01:00"));
t("mangler november, kaares hverken Maanedens spiller eller topscorer for december (aargangen stopper)",
  JSON.stringify(orden(r).filter(x => x.endsWith("_2017"))) === '["S 2026-11_2017","T 2026-11_2017","T 2026-12_2017"]', orden(r));
r = alleKaar({ ...tre, kaaringer: [{ id: "2026-11_2017" }] }, DEC5);
t("en gammel Maanedens spiller uden vindere-felt goer ingen skade: ingen udelukkes", JSON.stringify(topV(r, "2026-11_2017")) === '["p2"]');
r = alleKaar({ spillere: [sp("a"), sp("b")], fodteknik: [fw("a", dage("2026-11", 1, 5)), fw("b", dage("2026-11", 1, 5))] });
t("delt Maanedens spiller udelukker begge -> ingen andre har point -> topscorer-post uden vinder",
  JSON.stringify(r.map(k => [k.samling, k.post.vindere.map(v => v.id)])) === '[["maanedensSpiller",["a","b"]],["maanedensTopscorer",[]]]', r);
r = alleKaar({ spillere: [sp("a", "2016"), sp("b", "2017", "pige"), sp("c", "2017", "dreng"), sp("d", "2017")],
  fodteknik: [fw("a", dage("2026-11", 1, 30)), fw("b", { "2026-11-20": { k: 3 } }), fw("c", { "2026-11-20": { t: 1 } }), fw("d", dage("2026-11", 1, 9))] });
t("aargangene for sig, drenge og piger sammen: i 2017 er d Maanedens spiller, og pigen b slaar drengen c; 2016 har ingen topscorer",
  JSON.stringify([topV(r, "2026-11_2017"), topV(r, "2026-11_2016")]) === '[["b"],[]]', orden(r));

console.log("\nIngen bivirkninger");
const inddata = { spillere: [sp("a", "U9")], fodteknik: [fw("a", dage("2026-11", 1, 2))], kaaringer: [] };
const foer = JSON.stringify(inddata);
kaar(inddata);
t("kalderens data roeres ikke (spillerens aargang staar stadig som U9)", JSON.stringify(inddata) === foer);
t("to kald paa samme data giver det samme", JSON.stringify(kaar(tre, new Date("2027-02-05T05:00:00+01:00"))) === JSON.stringify(kaar(tre, new Date("2027-02-05T05:00:00+01:00"))));
{
  const foerP = JSON.stringify(pointData);
  alleKaar(pointData); alleKaar(pointData);
  t("topscorer-beregningen roerer heller ikke kalderens data, og to kald giver det samme",
    JSON.stringify(pointData) === foerP && JSON.stringify(alleKaar(pointData)) === JSON.stringify(alleKaar(pointData)));
  // Et kald uden registreringer bagefter maa ikke se det forrige kalds indsendelser og stige.
  alleKaar(pointData);
  t("data fra et tidligere kald sniger sig ikke med i det naeste",
    JSON.stringify(alleKaar({ spillere: [sp("a")] }).find(k => k.samling === "maanedensTopscorer").post.vindere) === "[]");
}
const gemtTz = process.env.TZ; process.env.TZ = "UTC";
let kastede = false; try { kaar(basis); } catch { kastede = true; }
process.env.TZ = gemtTz;
t("beregningen naegter at regne, hvis tidszonen ikke er dansk", kastede);
process.env.TZ = "UTC"; kastede = false; try { alleKaar(basis); } catch { kastede = true; }
process.env.TZ = gemtTz;
t("ogsaa for topscoreren", kastede);

// --- kaarMaanedensSpiller mod en lille databaseefterligning ------------------------------
// Emulator-testen proever den mod en rigtig Firestore; her styres, hvad create() svarer.
// oprettet: id'erne paa Maanedens spiller, i orden. raekke: alt, der blev oprettet, som "S id"/"T id".
// createFejl: {id: kode} rammer Maanedens spiller; {"maanedensTopscorer/id": kode} topscoreren.
function falskDb(data, { createFejl = {} } = {}){
  const laest = [], oprettet = [], raekke = [];
  return { laest, oprettet, raekke, data, collection: navn => ({
    get: async () => { laest.push(navn); return { docs: Object.entries(data[navn] || {}).map(([id, d]) => ({ id, data: () => d })) }; },
    doc: id => ({ create: async d => {
      const kode = createFejl[navn + "/" + id] ?? (navn === "maanedensSpiller" ? createFejl[id] : undefined);
      if(kode) throw Object.assign(new Error("fejl " + id), { code: kode });
      if((data[navn] ||= {})[id]) throw Object.assign(new Error("findes"), { code: 6 });
      data[navn][id] = d;
      if(navn === "maanedensSpiller") oprettet.push(id);
      raekke.push((navn === "maanedensSpiller" ? "S " : "T ") + id);
    } })
  }) };
}
const TUNGE = ["footwork", "submissions", "juggleLadder", "juggleLog"];
const logbog = [];
const logger = { info: (...a) => logbog.push(a), error: (...a) => logbog.push(a) };
const dbData = () => ({
  players: { p1: { name: "Oscar Hemmelig", year: "2017" }, p2: { name: "Ida Hemmelig", year: "2017" }, p3: { name: "Carl Hemmelig", year: "2016" } },
  footwork: { p1: { days: dage("2026-11", 1, 8) }, p2: { days: { ...dage("2026-11", 1, 12), ...dage("2026-12", 1, 2) } }, p3: { days: dage("2026-11", 1, 2) } },
  submissions: { s1: { playerId: "p1", status: "approved", reviewedAt: "2026-11-30T12:00:00Z", pointsAwarded: 25 } },
  juggleLadder: { p1: { mainStep: 1 } },
  juggleLog: { p1: { entries: [{ t: "main", v: 0, at: "2026-12-03T10:00:00Z" }] } },
  maanedensSpiller: {}
});

console.log("\nSkrivningen (kaarMaanedensSpiller)");
let fdb = falskDb(dbData());
let s = await kaarMaanedensSpiller(fdb, new Date("2027-01-05T05:00:00+01:00"), logger);
t("opretter de manglende poster med create(), i appens orden", JSON.stringify(fdb.oprettet) === '["2026-11_2017","2026-12_2017","2026-11_2016","2026-12_2016"]' && JSON.stringify(s.oprettet) === JSON.stringify(fdb.oprettet), fdb.oprettet);
const skrevet = fdb.collection("maanedensSpiller");
const post = (await skrevet.get()).docs.find(d => d.id === "2026-11_2017").data();
t("posten har maaned, aargang, vindere og et servertidsstempel i beregnet",
  JSON.stringify(Object.keys(post)) === '["maaned","aargang","vindere","beregnet"]' && /ServerTimestamp/.test(post.beregnet?.constructor?.name), [Object.keys(post), post.beregnet?.constructor?.name]);
t("december 2017: kun p2 traenede, men p2 vandt november - posten faar ingen vindere",
  JSON.stringify((await skrevet.get()).docs.find(d => d.id === "2026-12_2017").data().vindere) === "[]");
const logTekst = JSON.stringify(logbog);
t("loggen rummer id'er og antal, aldrig navne", logbog.length > 0 && !/Hemmelig|Oscar|Ida|Carl/.test(logTekst), logbog.slice(0, 3));
logbog.length = 0;
let igen = falskDb({ ...dbData(), maanedensSpiller: Object.fromEntries((await skrevet.get()).docs.map(d => [d.id, d.data()])), maanedensTopscorer: { ...fdb.data.maanedensTopscorer } });
s = await kaarMaanedensSpiller(igen, new Date("2027-01-06T05:00:00+01:00"), logger);
t("anden koersel: intet at oprette, og fodteknikken hentes slet ikke", s.oprettet.length === 0 && igen.oprettet.length === 0 && !igen.laest.includes("footwork"), igen.laest);
fdb = falskDb(dbData());
s = await kaarMaanedensSpiller(fdb, new Date("2026-12-04T23:59:00+01:00"), logger);
t("4. december: intet oprettes, intet fodteknik hentes", fdb.oprettet.length === 0 && !fdb.laest.includes("footwork"));

console.log("\nSkrivningen af Maanedens topscorer");
fdb = falskDb(dbData());
s = await kaarMaanedensSpiller(fdb, new Date("2027-01-05T05:00:00+01:00"), logger);
t("i samme koersel: hver topscorer lige efter Maanedens spiller for samme maaned og aargang",
  JSON.stringify(fdb.raekke) === JSON.stringify(["2026-11_2017", "2026-12_2017", "2026-11_2016", "2026-12_2016"].flatMap(id => ["S " + id, "T " + id])), fdb.raekke);
t("svaret holder de to slags hver for sig", JSON.stringify(s.oprettet) === '["2026-11_2017","2026-12_2017","2026-11_2016","2026-12_2016"]'
  && JSON.stringify(s.topscorer) === JSON.stringify({ oprettet: ["2026-11_2017", "2026-12_2017", "2026-11_2016", "2026-12_2016"], findesAllerede: [], fejlet: [] }), s);
const tpost = fdb.data.maanedensTopscorer["2026-11_2017"];
t("topscorer-posten har maaned, aargang, vindere og et servertidsstempel i beregnet",
  JSON.stringify(Object.keys(tpost)) === '["maaned","aargang","vindere","beregnet"]' && /ServerTimestamp/.test(tpost.beregnet?.constructor?.name), Object.keys(tpost));
// p1 i november: 8 version 1-dage a 2 + streak 3/5/7 (5 + 5 + 10) + medaljen 30/11 (25) = 61. Trinnet er fra december.
t("november 2017: Ida (p2) er Maanedens spiller, saa Oscar (p1) er topscorer med fodteknik, streak og medalje",
  JSON.stringify(tpost.vindere) === JSON.stringify([{ id: "p1", navn: "Oscar Hemmelig", point: 61, oevelser: 8, svaer: 0, mellem: 0, let: 8, starter: 0 }]), tpost.vindere);
// december: Maanedens spiller er tom (p2 vandt november). p2: 1/12 (v2) + 2/12, starter 2 + 2 = 4; p1: trinnet 3/12 (5).
t("december 2017: ingen Maanedens spiller, og p1's trin (5 point) slaar p2's to dage (4)",
  JSON.stringify(fdb.data.maanedensTopscorer["2026-12_2017"].vindere.map(v => [v.id, v.point, v.oevelser])) === '[["p1",5,1]]', fdb.data.maanedensTopscorer["2026-12_2017"].vindere);
t("2016: Carl er Maanedens spiller og den eneste med point -> topscorer-poster uden vinder",
  JSON.stringify([fdb.data.maanedensTopscorer["2026-11_2016"].vindere, fdb.data.maanedensTopscorer["2026-12_2016"].vindere]) === "[[],[]]");
t("indsendelser, stige og stigelog hentes, naar noget skal kaares", TUNGE.every(n => fdb.laest.includes(n)), fdb.laest);
t("loggen rummer stadig kun id'er og antal", !/Hemmelig|Oscar|Ida|Carl/.test(JSON.stringify(logbog)));
igen = falskDb({ ...dbData(), maanedensSpiller: { ...fdb.data.maanedensSpiller }, maanedensTopscorer: { ...fdb.data.maanedensTopscorer } });
s = await kaarMaanedensSpiller(igen, new Date("2027-01-06T05:00:00+01:00"), logger);
t("anden koersel: intet at oprette, og hverken fodteknik, indsendelser, stige eller stigelog hentes",
  !igen.raekke.length && !s.topscorer.oprettet.length && !TUNGE.some(n => igen.laest.includes(n)), igen.laest);
igen = falskDb({ ...dbData(), maanedensSpiller: { ...fdb.data.maanedensSpiller } });
s = await kaarMaanedensSpiller(igen, new Date("2027-01-06T05:00:00+01:00"), logger);
t("findes Maanedens spiller, men ikke topscoreren (som efter udrulningen), oprettes kun topscorerne - paa de gemte vindere",
  JSON.stringify(igen.raekke) === '["T 2026-11_2017","T 2026-12_2017","T 2026-11_2016","T 2026-12_2016"]' && !s.oprettet.length
  && JSON.stringify(igen.data.maanedensTopscorer["2026-11_2017"].vindere.map(v => v.id)) === '["p1"]' && TUNGE.every(n => igen.laest.includes(n)), igen.raekke);

console.log("\nEn admins browser naaede det foerst");
fdb = falskDb(dbData(), { createFejl: { "2026-11_2017": 6 } });
s = await kaarMaanedensSpiller(fdb, new Date("2027-01-05T05:00:00+01:00"), logger);
t("findes november 2017 allerede ved create, stopper 2017: december 2017 skrives IKKE (forrige maaned mangler i det, der blev regnet)",
  !fdb.oprettet.some(id => id.endsWith("_2017")) && JSON.stringify(s.findesAllerede) === '["2026-11_2017"]', s);
t("og 2016 fortsaetter", JSON.stringify(fdb.oprettet) === '["2026-11_2016","2026-12_2016"]', fdb.oprettet);
t("det er ikke en fejl", s.fejlet.length === 0);
fdb = falskDb(dbData(), { createFejl: { "2026-11_2016": 7 } });
s = await kaarMaanedensSpiller(fdb, new Date("2027-01-05T05:00:00+01:00"), logger);
t("en anden fejl stopper ogsaa kun den aargang - og meldes som fejlet",
  JSON.stringify(s.fejlet) === '["2026-11_2016"]' && JSON.stringify(fdb.oprettet) === '["2026-11_2017","2026-12_2017"]', s);
t("og topscoreren for den stoppede aargang skrives heller ikke", !fdb.raekke.some(x => x.endsWith("_2016")), fdb.raekke);
fdb = falskDb(dbData(), { createFejl: { "2026-11_2017": 6 } });
s = await kaarMaanedensSpiller(fdb, new Date("2027-01-05T05:00:00+01:00"), logger);
t("fandtes Maanedens spiller allerede ved create, kaares topscoreren for den aargang ikke (den gemte vinder kendes ikke)",
  !fdb.raekke.some(x => x.endsWith("_2017")) && !s.topscorer.oprettet.some(id => id.endsWith("_2017")), fdb.raekke);

console.log("\nEn admins browser naaede topscoreren foerst");
fdb = falskDb(dbData(), { createFejl: { "maanedensTopscorer/2026-11_2017": 6 } });
s = await kaarMaanedensSpiller(fdb, new Date("2027-01-05T05:00:00+01:00"), logger);
t("findes topscoreren allerede ved create(), stopper aargangen: Maanedens spiller for november er skrevet, december ikke",
  JSON.stringify(fdb.raekke.filter(x => x.endsWith("_2017"))) === '["S 2026-11_2017"]' && JSON.stringify(s.topscorer.findesAllerede) === '["2026-11_2017"]', { raekke: fdb.raekke, s });
t("det er ikke en fejl, og 2016 fortsaetter", !s.fejlet.length && !s.topscorer.fejlet.length && fdb.raekke.filter(x => x.endsWith("_2016")).length === 4);
fdb = falskDb(dbData(), { createFejl: { "maanedensTopscorer/2026-12_2016": 7 } });
s = await kaarMaanedensSpiller(fdb, new Date("2027-01-05T05:00:00+01:00"), logger);
t("en anden fejl paa topscoreren meldes som fejlet under topscorer - og resten skrives",
  JSON.stringify(s.topscorer.fejlet) === '["2026-12_2016"]' && !s.fejlet.length && fdb.raekke.length === 7, { s, raekke: fdb.raekke });

console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
