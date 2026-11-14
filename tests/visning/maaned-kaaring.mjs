// Månedens spiller i hele appen: hvem regner kåringen ud, hvornår, og at den gemmes rigtigt.
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
    p3: { year: "2016", gender: "dreng", days: dage("2026-11", 3, 4, { j: 1 }) } }
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
  const gemt = await page.evaluate(() => window.__skrivninger.filter(x => x.navn === "maanedensSpiller").map(x => ({ id: x.id, vindere: x.data.vindere.map(v => v.id), data: x.data })));
  await ctx.close();
  return { gemt, fejl };
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

console.log("\nHvem må ikke, og hvornår ikke");
t("4. december kåres intet", (await aabn("admin", "2026-12-04T22:00:00+01:00")).gemt.length === 0);
t("en træner, der kun ser drengene, kårer ikke", (await aabn("drenge", "2026-12-06T09:00:00+01:00")).gemt.length === 0);
t("en træner, der ser hele 2017, kårer 2017", JSON.stringify((await aabn("hel", "2026-12-06T09:00:00+01:00")).gemt.map(g => g.id)) === '["2026-11_2017"]');
t("en spiller kårer ikke", (await aabn("sp", "2026-12-06T09:00:00+01:00")).gemt.length === 0);
const findes = { maanedensSpiller: { "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p1", navn: "Oscar Test" }] },
                                    "2026-11_2016": { maaned: "2026-11", aargang: "2016", vindere: [] } } };
t("en gemt kåring røres ikke igen - heller ikke når tallene siger noget andet",
  (await aabn("admin", "2026-12-06T09:00:00+01:00", findes)).gemt.length === 0);

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

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
