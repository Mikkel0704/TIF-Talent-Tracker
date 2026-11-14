// Fodteknik: øvelser uden instruktionsvideo skjules for spilleren - med to undtagelser:
// en øvelse med registreringer på den viste dag vises, og en kategori helt uden videoer
// vises hel. Træneren ser altid alle. Hele appen køres, med skiftedatoen 3 dage tilbage.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const iso = n => { const d = new Date(); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const original = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const html = original.replace(/const FOOTWORK_V2_FRA = "[0-9-]+";/, `const FOOTWORK_V2_FRA = "${iso(-3)}";`);
const sted = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PV = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];
const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: new Date().toISOString(), privacyVersion: PV };
const video = k => ({ url: "https://eksempel.invalid/guides/" + k + "/1.mp4", sti: "guides/" + k + "/1.mp4", lagt: new Date().toISOString() });
const DE_TOLV = ["t","s","d","v","p","o","y","j","l","k","c","q"];                 // dem, klubben har videoer til
const medVideoer = koder => Object.fromEntries(koder.map(k => ["f_" + k, video("f_" + k)]));

let ok = 0, fejlet = 0;
const t = (n, b, info) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (info !== undefined ? "\n         " + JSON.stringify(info) : ""))); };
const browser = await chromium.launch();
async function start(uid, videoer, dage){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const fejl = [];
  page.on("pageerror", e => fejl.push(e.message));
  await page.route("**/*", r => { const u = r.request().url();
    if (u === "https://app.test/") return r.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return r.fulfill({ contentType: "application/javascript", body: sted });
    return r.abort(); });
  const db = {
    users: { u: { email: "s@x.invalid", role: "player", playerId: "p1", years: ["2017"], ...ok_ },
             tr: { email: "t@x.invalid", role: "coach", years: ["2017"], ...ok_ } },
    players: { p1: { name: "Oscar Test", year: "2017", gender: "dreng", points: 0, passed: {}, history: [] } },
    footwork: { p1: { year: "2017", gender: "dreng", days: dage || {} } },
    clubConfig: videoer ? { guideVideos: videoer } : {} };
  await page.addInitScript(([d, br, pv]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} },
    [db, { uid, email: db.users[uid].email }, PV]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { page, fejl, luk: () => ctx.close() };
}
const pr = a => a.page.evaluate(() => { const ud = {}; let g = null;
  for (const e of document.querySelectorAll("#footworkArea .phasehead, #footworkArea .ladderrow")) {
    if (e.classList.contains("phasehead")) { g = e.childNodes[0].textContent.trim(); ud[g] = []; } else ud[g].push(e.querySelector("b").textContent); }
  return ud; });

console.log("\nMed de 12 videoer, klubben har lagt op");
let a = await start("u", medVideoer(DE_TOLV));
await a.page.click("#tab-footwork"); await a.page.waitForTimeout(250);
let g = await pr(a);
t("spilleren ser de 12 øvelser med video", Object.values(g).flat().length === 12, g);
t("Starter 4 · Let 2 · Mellem 3 · Svær 2 · Grundtræning 1",
  JSON.stringify(Object.values(g).map(x => x.length)) === "[4,2,3,2,1]", g);
t("de otte uden video er skjult", !["Toe-taps med kryds","Trommestikker + sålerul","V-rul inderside","E-rul","Step-over + V-rul","Aflevering mod mur","Inderside med træk mod mur","8-tal mellem kegler"].some(n => Object.values(g).flat().includes(n)));
t("ingen kategori er tom - 'én fra hvert niveau' kan stadig nås", Object.values(g).every(x => x.length > 0));
await a.page.evaluate(() => document.querySelectorAll("#footwork details").forEach(x => x.open = true)); await a.page.waitForTimeout(100);
const oversigt = await a.page.evaluate(() => document.querySelectorAll("#footworkExerciseArea .ladderrow").length);
t("'Øvelserne - hvad er hvad' viser også kun de 12", oversigt === 12, oversigt);

console.log("\nEn video lægges op, mens siden er åben");
await a.page.evaluate(async () => { const m = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
  await m.setDoc(m.doc({}, "clubConfig", "guideVideos"), { f_e: { url: "https://eksempel.invalid/guides/f_e/1.mp4", sti: "guides/f_e/1.mp4" } }, { merge: true }); });
await a.page.waitForTimeout(900);
g = await pr(a);
t("E-rul dukker op under Svær uden genindlæsning", (g["Svær"] || []).includes("E-rul"), g["Svær"]);
t("og i oversigten", await a.page.evaluate(() => [...document.querySelectorAll("#footworkExerciseArea .ladderrow b")].some(b => b.textContent === "E-rul")));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

console.log("\nEn skjult øvelse med registreringer på dagen vises");
a = await start("u", medVideoer(DE_TOLV), { [iso(0)]: { x: 2, t: 1 } });
await a.page.click("#tab-footwork"); await a.page.waitForTimeout(250);
g = await pr(a);
t("Toe-taps med kryds vises i dag, fordi den er registreret (2 gange)", (g["Let"] || []).includes("Toe-taps med kryds"), g["Let"]);
t("med sit tal, så den kan rettes", await a.page.evaluate(() => [...document.querySelectorAll("#footworkArea .ladderrow")].find(r => r.querySelector("b").textContent === "Toe-taps med kryds")?.querySelector(".counter b")?.textContent === "2"));
t("og pointene tæller: 2 × 3 + 2 = 8", /· 8 point/.test(await a.page.evaluate(() => document.querySelector("#footworkArea .exercise-block h3").textContent)));
await a.page.click("#footworkArea .daychip:nth-child(2)"); await a.page.waitForTimeout(200);
g = await pr(a);
t("men ikke på en dag uden registreringer", !(g["Let"] || []).includes("Toe-taps med kryds"), g["Let"]);
await a.luk();

console.log("\nEn kategori helt uden videoer vises hel");
a = await start("u", medVideoer(["t"]));
await a.page.click("#tab-footwork"); await a.page.waitForTimeout(250);
g = await pr(a);
t("Starter har én video, så kun Toe-taps vises dér", JSON.stringify(g["Starter"]) === JSON.stringify(["Toe-taps"]), g["Starter"]);
t("de andre kategorier har ingen videoer og vises hele", (g["Let"] || []).length === 4 && (g["Mellem"] || []).length === 4 && (g["Svær"] || []).length === 4 && (g["Grundtræning"] || []).length === 4, g);
await a.luk();
a = await start("u", null);
await a.page.click("#tab-footwork"); await a.page.waitForTimeout(250);
t("uden nogen videoer ser spilleren alle 20", Object.values(await pr(a)).flat().length === 20);
await a.luk();

console.log("\nTræneren ser alle øvelser");
a = await start("tr", medVideoer(DE_TOLV), { [iso(0)]: { t: 1 } });   // tabellen vises, når spilleren har registreret noget
await a.page.click("#tab-track"); await a.page.waitForTimeout(300);
await a.page.evaluate(() => { const s = document.querySelector("#trackPlayer, select"); if (s) { s.value = "p1"; s.dispatchEvent(new Event("change")); } });
await a.page.waitForTimeout(300);
const traenerRaekker = await a.page.evaluate(() => [...document.querySelectorAll("table tr")].filter(r => /starter|let|mellem|svær|grundtræning/.test(r.textContent)).length);
t("trænerens oversigt har alle 20 øvelser", traenerRaekker === 20, traenerRaekker);
t("træner: ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
