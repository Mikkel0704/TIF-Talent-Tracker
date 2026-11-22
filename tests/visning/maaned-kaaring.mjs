// Månedens spiller og Månedens topscorer i hele appen: hvem regner kåringerne ud, hvornår,
// og at de gemmes rigtigt - topscoreren lige efter Månedens spiller for samme måned og årgang.
// Uret stilles med Playwright, så "5. december" kan testes nu.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const sted = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PV = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];
const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: "2026-11-01T10:00:00Z", privacyVersion: PV };

let ok = 0, fejlet = 0;
const t = (n, b, info) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (info !== undefined ? "\n         " + JSON.stringify(info) : ""))); };
const browser = await chromium.launch();
const dage = (maaned, fra, til, pr) => Object.fromEntries(Array.from({length: til - fra + 1}, (_, i)=>[`${maaned}-${String(fra + i).padStart(2, "0")}`, pr]));
const grund = () => ({
  users: {
    admin:  { email: "a@x.invalid", role: "admin", years: ["2017", "2016"], ...ok_ },
    hel:    { email: "h@x.invalid", role: "coach", years: ["2017"], ...ok_ },
    drenge: { email: "d@x.invalid", role: "coach", years: ["2017"], yearGenders: { "2017": "dreng" }, ...ok_ },
    sp:     { email: "s@x.invalid", role: "player", playerId: "p1", years: ["2017"], ...ok_ } },
  players: {
    p1: { name: "Oscar Test", year: "2017", gender: "dreng", points: 0, passed: {}, history: [] },
    p2: { name: "Ida Test",   year: "2017", gender: "pige",  points: 0, passed: {}, history: [] },
    p3: { name: "Carl Test",  year: "2016", gender: "dreng", points: 0, passed: {}, history: [] } },
  footwork: {
    p1: { year: "2017", gender: "dreng", days: { ...dage("2026-11", 1, 8, { t: 1 }), ...dage("2026-12", 1, 5, { t: 1 }) } },
    p2: { year: "2017", gender: "pige",  days: { ...dage("2026-11", 1, 12, { t: 1 }), ...dage("2026-12", 1, 9, { t: 1 }) } },
    p3: { year: "2016", gender: "dreng", days: dage("2026-11", 3, 4, { j: 1 }) } },
  // Topscoreren: medaljer efter godkendelsesdato og trin på stigen efter loggens dato.
  submissions: {
    s1: { playerId: "p1", year: "2017", gender: "dreng", status: "approved", reviewedAt: "2026-11-20T10:00:00+01:00", pointsAwarded: 25 },
    s2: { playerId: "p1", year: "2017", gender: "dreng", status: "approved", reviewedAt: "2026-10-20T10:00:00+01:00", pointsAwarded: 500 } },
  juggleLadder: { p1: { year: "2017", gender: "dreng", mainStep: 2 } },
  juggleLog: { p1: { year: "2017", gender: "dreng", entries: [{ t: "main", v: 1, at: "2026-11-25T10:00:00+01:00" }, { t: "main", v: 0, at: "2026-11-24T10:00:00+01:00" }] } }
});
async function aabn(uid, tid, ekstra = {}){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen" });
  const page = await ctx.newPage(); const fejl = [];
  page.on("pageerror", e => fejl.push(e.message));
  await page.clock.setFixedTime(new Date(tid));
  await page.route("**/*", r => { const u = r.request().url();
    if (u === "https://app.test/") return r.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return r.fulfill({ contentType: "application/javascript", body: sted });
    return r.abort(); });
  const db = grund(); Object.assign(db, ekstra);
  await page.addInitScript(([d, br, pv]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} },
    [db, { uid, email: db.users[uid].email }, PV]);
  await page.goto("https://app.test/");
  await page.waitForTimeout(2800);                    // kåringen venter, til alt er hentet
  const skrevet = navn => page.evaluate(n => window.__skrivninger.filter(x => x.navn === n).map(x => ({ id: x.id, vindere: x.data.vindere.map(v => v.id), data: x.data })), navn);
  const gemt = await skrevet("maanedensSpiller"), top = await skrevet("maanedensTopscorer");
  // Alle kåringer i den orden, siden skrev dem: "S" for Månedens spiller, "T" for topscorer.
  const orden = await page.evaluate(() => window.__skrivninger.filter(x => /^maanedens(Spiller|Topscorer)$/.test(x.navn)).map(x => (x.navn === "maanedensSpiller" ? "S " : "T ") + x.id));
  await ctx.close();
  return { gemt, top, orden, fejl };
}

// Som aabn, men skrivninger til én samling afvises (som reglerne ville).
async function aabnMedFejl(uid, tid, samling){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen" });
  const page = await ctx.newPage(); const fejl = [];
  page.on("pageerror", e => fejl.push(e.message));
  await page.clock.setFixedTime(new Date(tid));
  await page.route("**/*", r => { const u = r.request().url();
    if (u === "https://app.test/") return r.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return r.fulfill({ contentType: "application/javascript", body: sted });
    return r.abort(); });
  await page.addInitScript(([d, br, pv, s]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; window.__fejlVed = s; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} },
    [grund(), { uid, email: grund().users[uid].email }, PV, samling]);
  await page.goto("https://app.test/");
  await page.waitForTimeout(2800);
  const orden = await page.evaluate(() => window.__skrivninger.filter(x => /^maanedens/.test(x.navn)).map(x => x.navn + " " + x.id));
  await ctx.close();
  return { top: orden.filter(x => x.startsWith("maanedensTopscorer")), orden, fejl };
}

console.log("\nAdmin åbner appen 6. december");
let a = await aabn("admin", "2026-12-06T09:00:00+01:00");
t("november kåres i begge årgange", a.gemt.map(g => g.id).sort().join() === "2026-11_2016,2026-11_2017", a.gemt.map(g => g.id));
const k2017 = a.gemt.find(g => g.id === "2026-11_2017");
t("i 2017 vinder pigen Ida (12 dage) over Oscar (8) - drenge og piger sammen", JSON.stringify(k2017?.vindere) === '["p2"]', k2017?.vindere);
t("i 2016 vinder Carl", JSON.stringify(a.gemt.find(g => g.id === "2026-11_2016")?.vindere) === '["p3"]');
t("posten har præcis de felter, reglerne tillader", Object.keys(k2017?.data || {}).sort().join() === "aargang,beregnet,maaned,vindere");
t("og vinderens tal: 12 dage, 18 min, 12 øvelser, 24 point",
  JSON.stringify(k2017?.data.vindere[0]) === JSON.stringify({ id: "p2", navn: "Ida Test", dage: 12, minutter: 18, oevelser: 12, point: 24 }), k2017?.data.vindere[0]);
t("december kåres ikke - den er ikke afgjort", !a.gemt.some(g => g.id.startsWith("2026-12")));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);

console.log("\nMånedens topscorer kåres lige efter Månedens spiller");
t("rækkefølgen: årgang for årgang, og i hver Månedens spiller og så topscoreren",
  JSON.stringify(a.orden) === JSON.stringify(["S 2026-11_2017", "T 2026-11_2017", "S 2026-11_2016", "T 2026-11_2016"]), a.orden);
const t2017 = a.top.find(g => g.id === "2026-11_2017");
t("2017: Ida er Månedens spiller og kan ikke også være topscorer -> Oscar", JSON.stringify(t2017?.vindere) === '["p1"]', t2017?.vindere);
// Oscar i november: 8 dage × 2 + streak 3/5/7 dage (5 + 5 + 10) = 36, medaljen 20/11 (25), trin 1 og 2 (5 + 5) = 71.
// Medaljen fra oktober tæller ikke. Øvelser: 8 toe-taps + 2 trin = 10. 1.-8. november er
// version 1-dage, hvor toe-taps var "let" (starter kom med version 2).
t("og hans tal: 71 point (fodteknik med streak 36, medalje 25, to trin 10), 10 øvelser, 8 lette (version 1-dage)",
  JSON.stringify(t2017?.data.vindere[0]) === JSON.stringify({ id: "p1", navn: "Oscar Test", point: 71, oevelser: 10, svaer: 0, mellem: 0, let: 8, starter: 0 }), t2017?.data.vindere[0]);
t("topscorer-posten har præcis de felter, reglerne tillader", Object.keys(t2017?.data || {}).sort().join() === "aargang,beregnet,maaned,vindere");
t("2016: Carl er Månedens spiller og den eneste med point -> ingen topscorer", JSON.stringify(a.top.find(g => g.id === "2026-11_2016")?.vindere) === "[]");

console.log("\nMidnat før den 5. december, dansk tid");
t("4. december kl. 23:59: intet kåres", (await aabn("admin", "2026-12-04T23:59:00+01:00")).gemt.length === 0);
t("5. december kl. 00:01: november kåres", (await aabn("admin", "2026-12-05T00:01:00+01:00")).gemt.some(g => g.id === "2026-11_2017"));

console.log("\nHvem må ikke, og hvornår ikke");
t("4. december kåres intet", (await aabn("admin", "2026-12-04T22:00:00+01:00")).gemt.length === 0);
a = await aabn("drenge", "2026-12-06T09:00:00+01:00");
t("en træner, der kun ser drengene, kårer ikke - hverken Månedens spiller eller topscorer", a.gemt.length === 0 && a.top.length === 0);
a = await aabn("hel", "2026-12-06T09:00:00+01:00");
t("en træner, der ser hele 2017, kårer 2017 - begge priser", JSON.stringify(a.orden) === '["S 2026-11_2017","T 2026-11_2017"]', a.orden);
t("med de samme vindere som admin", JSON.stringify([a.gemt[0]?.vindere, a.top[0]?.vindere]) === '[["p2"],["p1"]]');
a = await aabn("sp", "2026-12-06T09:00:00+01:00");
t("en spiller kårer ikke", a.gemt.length === 0 && a.top.length === 0);
const findes = { maanedensSpiller: { "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p1", navn: "Oscar Test" }] },
                                    "2026-11_2016": { maaned: "2026-11", aargang: "2016", vindere: [] } } };
a = await aabn("admin", "2026-12-06T09:00:00+01:00", findes);
t("en gemt kåring røres ikke igen - heller ikke når tallene siger noget andet", a.gemt.length === 0);
t("men mangler topscoreren, kåres den på den GEMTE Månedens spiller: Oscar er gemt som vinder, så Ida bliver topscorer",
  JSON.stringify(a.orden) === '["T 2026-11_2017","T 2026-11_2016"]' && JSON.stringify(a.top[0]?.vindere) === '["p2"]', a.orden);
t("og i 2016, hvor den gemte post har ingen vinder, er Carl topscorer", JSON.stringify(a.top[1]?.vindere) === '["p3"]', a.top[1]);
a = await aabn("admin", "2026-12-06T09:00:00+01:00", { ...findes, maanedensTopscorer: { "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [] }, "2026-11_2016": { maaned: "2026-11", aargang: "2016", vindere: [] } } });
t("findes begge kåringer, skrives intet", a.gemt.length === 0 && a.top.length === 0, a.orden);

console.log("\nIkke to måneder i træk");
a = await aabn("admin", "2027-01-06T09:00:00+01:00", { maanedensSpiller: { "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p2", navn: "Ida Test" }] },
                                                                          "2026-11_2016": { maaned: "2026-11", aargang: "2016", vindere: [{ id: "p3", navn: "Carl Test" }] } } });
const dec = a.gemt.find(g => g.id === "2026-12_2017");
t("Ida vandt november og er nr. 1 i december igen -> Oscar vinder december", JSON.stringify(dec?.vindere) === '["p1"]', dec?.vindere);
t("i 2016 har kun Carl trænet, og han vandt november -> ingen vinder i december",
  JSON.stringify(a.gemt.find(g => g.id === "2026-12_2016")?.vindere) === "[]", a.gemt.find(g => g.id === "2026-12_2016"));
a = await aabn("admin", "2027-01-06T09:00:00+01:00");
t("åbner ingen appen før januar, kåres november først og så december - med novembers vinder sprunget over",
  JSON.stringify(a.gemt.filter(g => g.id.endsWith("_2017")).map(g => [g.id, g.vindere])) === JSON.stringify([["2026-11_2017", ["p2"]], ["2026-12_2017", ["p1"]]]),
  a.gemt.map(g => [g.id, g.vindere]));
t("topscoreren følger hver måned lige efter Månedens spiller",
  JSON.stringify(a.orden.filter(x => x.endsWith("_2017"))) === '["S 2026-11_2017","T 2026-11_2017","S 2026-12_2017","T 2026-12_2017"]', a.orden);
t("december 2017: Oscar er Månedens spiller, så Ida er topscorer - selvom hun vandt Månedens spiller i november",
  JSON.stringify(a.top.find(g => g.id === "2026-12_2017")?.vindere) === '["p2"]', a.top);

console.log("\nFejler Månedens spiller, venter topscoreren");
{
  a = await aabnMedFejl("admin", "2026-12-06T09:00:00+01:00", "maanedensSpiller");
  t("kan Månedens spiller ikke gemmes, kåres topscoreren for samme måned og årgang ikke", a.top.length === 0, a.orden);
}

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
