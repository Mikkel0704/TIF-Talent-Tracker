// Sikkerhedsgennemgangen i hele appen: hvad appen SENDER og hvad den BEDER OM efter stramningen.
// (Reglerne selv testes i tests/regler/haerdning.rules.test.mjs.)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const sted = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PV = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];
const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: "2026-11-01T10:00:00Z", privacyVersion: PV };
let ok = 0, fejlet = 0;
const t = (n, b, info) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (info !== undefined ? "\n         " + JSON.stringify(info) : ""))); };
const browser = await chromium.launch();
const A17 = { year: "2017", gender: "dreng" };
async function aabn(uid, ekstra = {}){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen" });
  const page = await ctx.newPage(); const fejl = []; let nativ = 0;
  page.on("pageerror", e => fejl.push(e.message));
  page.on("dialog", async d => { nativ++; await d.dismiss(); });
  await page.clock.setFixedTime(new Date("2026-12-10T12:00:00+01:00"));
  await page.route("**/*", r => { const u = r.request().url();
    if (u === "https://app.test/") return r.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return r.fulfill({ contentType: "application/javascript", body: sted });
    return r.abort(); });
  const db = {
    users: { sp: { email: "foraelder@x.invalid", role: "player", playerId: "p1", years: ["2017"], ...ok_ },
             demo: { email: "demo@x.invalid", role: "player", playerId: "p9", years: ["2017"], demo: true, ...ok_ },
             tr: { email: "t@x.invalid", role: "coach", years: ["2017"], ...ok_ },
             admin: { email: "a@x.invalid", role: "admin", years: ["2017"], ...ok_ } },
    players: { p1: { name: "Oscar Test", ...A17, points: 0, passed: {}, history: [] },
               p2: { name: "Ida Test", year: "2017", gender: "pige", points: 0, passed: {}, history: [] },
               p9: { name: "Demo Test", ...A17, points: 0, passed: {}, history: [] } },
    footworkLog: { p1: { ...A17, entries: [], reasons: {} }, p2: { year: "2017", gender: "pige", entries: [], reasons: { "2026-12-09": { tekst: "syg" } } } },
    juggleLog: { p2: { year: "2017", gender: "pige", entries: [{ by: "u-x" }] } },
    maanedensSpiller: {
      "2026-10_2017": { maaned: "2026-10", aargang: "2017", vindere: [{ id: "p2", navn: "Ida Test", dage: 9, minutter: 13.5, oevelser: 9, point: 18 }, { id: "p1", navn: "Oscar Test", dage: 9, minutter: 13.5, oevelser: 9, point: 18 }] },
      "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p2", navn: "Ida Test", dage: 12, minutter: 18, oevelser: 12, point: 24 }] } },
    ...ekstra };
  await page.addInitScript(([d, br, pv]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; window.__lyt = []; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} },
    [db, { uid, email: db.users[uid].email }, PV]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const lyt = navn => page.evaluate(n => window.__lyt.filter(l => l.navn === n), navn);
  const dialog = () => page.evaluate(() => { const d = document.getElementById("appDialog"); return d && !d.classList.contains("hidden") ? document.getElementById("dialogTekst").textContent : null; });
  return { page, fejl, nativ: () => nativ, lyt, dialog, luk: () => ctx.close() };
}

console.log("\nEn spiller beder kun om sin egen log");
let a = await aabn("sp");
for (const navn of ["footworkLog", "juggleLog"]) {
  const l = await a.lyt(navn);
  t(`${navn}: ét opslag, på spillerens eget dokument - ingen årgangsforespørgsel`, l.length === 1 && l[0].kind === "doc" && l[0].id === "p1", l);
}
t("en spiller uden stige-log får ingen fejl", a.fejl.length === 0, a.fejl);
await a.luk();
a = await aabn("demo");
t("demo-loginnet beder også kun om sit eget", (await a.lyt("footworkLog")).every(l => l.kind === "doc" && l.id === "p9") && (await a.lyt("juggleLog")).every(l => l.kind === "doc" && l.id === "p9"));
await a.luk();
a = await aabn("tr");
t("en træner henter stadig årgangens logge", (await a.lyt("footworkLog")).some(l => l.kind === "col" && l.filtre.includes("year==2017")) && (await a.lyt("juggleLog")).some(l => l.kind === "col"), await a.lyt("footworkLog"));
await a.luk();

console.log("\nIndsendelsen rummer ingen e-mail");
const klip = new URL("./haerdning-klip.mp4", import.meta.url); writeFileSync(klip, "ikke en rigtig video");
a = await aabn("sp");
await a.page.click("#tab-training"); await a.page.waitForTimeout(200);
await a.page.setInputFiles('#trainingArea input[type="file"]', klip.pathname);
await a.page.click('#trainingArea button[id^="uploadbtn_"]'); await a.page.waitForTimeout(500);
const ind = (await a.page.evaluate(() => window.__skrivninger)).find(x => x.navn === "submissions");
t("indsendelsen har præcis de felter, reglerne tillader",
  Object.keys(ind?.data || {}).sort().join() === "challengeId,challengerId,createdAt,exercise,gender,level,medal,opponentId,playerId,playerName,status,stepIndex,submittedAt,year", Object.keys(ind?.data || {}).sort());
t("og forælderens e-mail står ingen steder i den", !JSON.stringify(ind?.data || {}).includes("foraelder@x.invalid"));
await a.luk();

console.log("\nSletning af et barn fjerner det fra Månedens spiller");
a = await aabn("admin");
await a.page.evaluate(() => { deletePlayer("p2"); }); await a.page.waitForTimeout(600);
let tekst = await a.dialog();
t("bekræftelsen nævner de to kåringer", /2 kåringer som Månedens spiller/.test(tekst || ""), tekst);
await a.page.click("#dialogJa"); await a.page.waitForTimeout(300);
await a.page.fill("#dialogInput", "Ida Test"); await a.page.click("#dialogJa"); await a.page.waitForTimeout(900);
const w = (await a.page.evaluate(() => window.__skrivninger)).filter(x => x.navn === "maanedensSpiller");
const okt = w.find(x => x.id === "2026-10_2017"), nov = w.find(x => x.id === "2026-11_2017");
t("i den delte måned bliver den anden vinder stående", JSON.stringify(okt?.data.vindere.map(v => v.id)) === '["p1"]' && okt?.merge === true, okt?.data);
t("måneden, hvor barnet vandt alene, står uden vinder - posten slettes ikke", JSON.stringify(nov?.data.vindere) === "[]" && nov?.type === "set", nov);
t("skrivningen rører kun vinderlisten og et rettet-stempel", w.every(x => Object.keys(x.data).sort().join() === "rettet,vindere"), w.map(x => Object.keys(x.data)));
t("barnets navn står ikke længere i nogen kåring", !(await a.page.evaluate(() => JSON.stringify(window.__db.maanedensSpiller))).includes("Ida Test"));
t("admin: ingen JS-fejl og ingen browserbokse", a.fejl.length === 0 && a.nativ() === 0, a.fejl);
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
