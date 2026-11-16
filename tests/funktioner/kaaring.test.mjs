// Serverens kaaring af Maanedens spiller (functions/kaaring.js og kaarMaanedensSpiller i
// functions/server.js) paa smaa, haandregnede eksempler. Koden, der regnes med, er skaaret
// ud af index.html af functions/byg.mjs - koer `node ../functions/byg.mjs` foerst (npm run
// funktioner goer det).
//
// Koeres med en ANDEN tidszone end dansk (se package.json), saa testene beviser, at
// serverkoden selv saetter Europe/Copenhagen - ogsaa for, hvornaar "den 5." begynder.
const PROCESSENS_TZ = process.env.TZ;
const { kaaringerAtOprette, MAANEDENS_FOERSTE, MAANEDENS_AFGOERES_DAG } = await import("../../functions/kaaring.js");
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

console.log("\nIngen bivirkninger");
const inddata = { spillere: [sp("a", "U9")], fodteknik: [fw("a", dage("2026-11", 1, 2))], kaaringer: [] };
const foer = JSON.stringify(inddata);
kaar(inddata);
t("kalderens data roeres ikke (spillerens aargang staar stadig som U9)", JSON.stringify(inddata) === foer);
t("to kald paa samme data giver det samme", JSON.stringify(kaar(tre, new Date("2027-02-05T05:00:00+01:00"))) === JSON.stringify(kaar(tre, new Date("2027-02-05T05:00:00+01:00"))));
const gemtTz = process.env.TZ; process.env.TZ = "UTC";
let kastede = false; try { kaar(basis); } catch { kastede = true; }
process.env.TZ = gemtTz;
t("beregningen naegter at regne, hvis tidszonen ikke er dansk", kastede);

// --- kaarMaanedensSpiller mod en lille databaseefterligning ------------------------------
// Emulator-testen proever den mod en rigtig Firestore; her styres, hvad create() svarer.
function falskDb(data, { createFejl = {} } = {}){
  const laest = [], oprettet = [];
  return { laest, oprettet, collection: navn => ({
    get: async () => { laest.push(navn); return { docs: Object.entries(data[navn] || {}).map(([id, d]) => ({ id, data: () => d })) }; },
    doc: id => ({ create: async d => {
      if(createFejl[id]) throw Object.assign(new Error("fejl " + id), { code: createFejl[id] });
      if((data[navn] ||= {})[id]) throw Object.assign(new Error("findes"), { code: 6 });
      data[navn][id] = d; oprettet.push(id);
    } })
  }) };
}
const logbog = [];
const logger = { info: (...a) => logbog.push(a), error: (...a) => logbog.push(a) };
const dbData = () => ({
  players: { p1: { name: "Oscar Hemmelig", year: "2017" }, p2: { name: "Ida Hemmelig", year: "2017" }, p3: { name: "Carl Hemmelig", year: "2016" } },
  footwork: { p1: { days: dage("2026-11", 1, 8) }, p2: { days: { ...dage("2026-11", 1, 12), ...dage("2026-12", 1, 2) } }, p3: { days: dage("2026-11", 1, 2) } },
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
const igen = falskDb({ ...dbData(), maanedensSpiller: Object.fromEntries((await skrevet.get()).docs.map(d => [d.id, d.data()])) });
s = await kaarMaanedensSpiller(igen, new Date("2027-01-06T05:00:00+01:00"), logger);
t("anden koersel: intet at oprette, og fodteknikken hentes slet ikke", s.oprettet.length === 0 && igen.oprettet.length === 0 && !igen.laest.includes("footwork"), igen.laest);
fdb = falskDb(dbData());
s = await kaarMaanedensSpiller(fdb, new Date("2026-12-04T23:59:00+01:00"), logger);
t("4. december: intet oprettes, intet fodteknik hentes", fdb.oprettet.length === 0 && !fdb.laest.includes("footwork"));

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

console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
