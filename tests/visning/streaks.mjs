// Streaks paa Overblik (v15.85): hvert barn, traeneren eller admin ser, med aktuel streak,
// status i dag, joker der venter, naeste bonus og den laengste streak nogensinde.
// HELE index.html koeres uaendret mod efterligningen i stoette/firebase-stedfortraeder.js
// med et fast "nu" i dansk tid. Tallene skal vaere de samme, som barnet selv ser (her
// gennem admins "Se som spiller", der tegner barnets rigtige side) og som traenerens
// Registrering viser ("Streak: N dage") - de kommer alle fra footworkCurrentStreak.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const sted = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PV = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];
const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: "2026-11-01T10:00:00Z", privacyVersion: PV };
let ok = 0, fejlet = 0;
const t = (n, b, info) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (info !== undefined ? "\n         " + JSON.stringify(info).slice(0, 800) : ""))); };
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const browser = await chromium.launch();

// Fredag 27. november 2026 kl. 15 dansk tid: i dag er 27., i gaar 26.
const NU = "2026-11-27T15:00:00+01:00";
const spiller = (name, year, gender, ekstra = {}) => ({ name, year, gender, points: 0, passed: {}, history: [], ...ekstra });
// Dage fra og med a til og med b, hver med én gang toe-taps (findes i begge versioner).
const dage = (a, b) => { const ud = {}; for (let d = Number(a); d <= Number(b); d++) ud[`2026-11-${String(d).padStart(2, "0")}`] = { t: 1 }; return ud; };
const LANGT = "Dina Maximiliane Østergaard-Kristoffersen";
const BRUGERE = {
  tr:    { email: "t@x.invalid", role: "coach", years: ["2017", "2016"], ...ok_ },
  pg:    { email: "pg@x.invalid", role: "coach", years: ["2017"], yearGenders: { "2017": "pige" }, ...ok_ },
  admin: { email: "a@x.invalid", role: "admin", years: ["2017", "2016"], ...ok_ },
  sp:    { email: "s@x.invalid", role: "player", playerId: "p1", years: ["2017"], yearGenders: { "2017": "pige" }, ...ok_ }
};
const DATA = () => ({
  users: BRUGERE,
  players: {
    p1: spiller("Ada Test", "2017", "pige", { hasActiveLogin: true }),   // (a) traenet i dag
    p2: spiller("Bo Test", "2017", "dreng"),                               // (b) lever via i gaar + en laengere, gammel streak
    p3: spiller("Carl Test", "2017", "dreng"),                             // (c) brudt
    p4: spiller(LANGT, "2017", "pige"),                                    // (d) ingen - og et langt navn
    p5: spiller("Emil Test", "2017", "dreng"),                             // (e) godkendt joker bygger bro
    p6: spiller("Frida Test", "2017", "pige"),                             // (f) hviler paa en joker, der venter
    p7: spiller("Gustav Test", "2017", "dreng"),                           // (g) kun stigen
    p8: spiller("Hans Test", "2016", "dreng"),
    p9: spiller("Ida Test", "2016", "pige"),
    p10: spiller("Zoe Test", "2017", "pige")                               // joker i dag
  },
  footwork: {
    p1: { year: "2017", gender: "pige", days: dage(25, 27) },
    p2: { year: "2017", gender: "dreng", days: { ...dage(1, 8), ...dage(24, 26) } },
    p3: { year: "2017", gender: "dreng", days: dage(10, 14) },
    p5: { year: "2017", gender: "dreng", days: { ...dage(20, 22), ...dage(24, 27) }, jokers: { "2026-11-23": "approved" } },
    p6: { year: "2017", gender: "pige", days: { ...dage(22, 24), ...dage(26, 26) }, jokerRequests: { "2026-11-25": true } },
    p8: { year: "2016", gender: "dreng", days: dage(26, 27) },
    p9: { year: "2016", gender: "pige", days: dage(27, 27) },
    p10: { year: "2017", gender: "pige", days: dage(25, 26), jokers: { "2026-11-27": "approved" } }
  },
  footworkLog: {},
  // Gustav: fire dage i traek kun paa stigen - trin og et trick, aldrig fodteknik.
  juggleLadder: { p7: { year: "2017", gender: "dreng", mainStep: 3, weakStep: 0, tricks: ["oploft"],
    days: ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"] } },
  juggleLog: { p7: { year: "2017", gender: "dreng", entries: [
    { t: "main", v: 2, at: "2026-11-27T09:00:00Z" },
    { t: "trick", v: "oploft", at: "2026-11-26T16:00:00Z" },
    { t: "main", v: 1, at: "2026-11-25T16:00:00Z" },
    { t: "main", v: 0, at: "2026-11-24T16:00:00Z" }
  ] } }
});

async function aabn(uid){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "Europe/Copenhagen" });
  const page = await ctx.newPage(); const fejl = [];
  page.on("pageerror", e => fejl.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) fejl.push(m.text()); });
  page.on("dialog", async d => { fejl.push("native dialog: " + d.message()); await d.dismiss(); });
  await page.clock.setFixedTime(new Date(NU));
  await page.route("**/*", r => { const u = r.request().url();
    if (u === "https://app.test/") return r.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return r.fulfill({ contentType: "application/javascript", body: sted });
    return r.abort(); });
  await page.addInitScript(([d, br, pv]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; window.__lyt = []; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} },
    [DATA(), { uid, email: BRUGERE[uid].email }, PV]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const raekker = () => page.evaluate(() => [...document.querySelectorAll("#streakListe .streakrow")].map(r => ({
    pid: r.dataset.pid,
    navn: r.querySelector(".linkbtn").textContent.trim(),
    tal: Number(r.querySelector(".streaktal b").textContent),
    status: [...r.querySelectorAll(".streakstatus .pill")].map(x => x.textContent.trim()),
    linjer: [...r.querySelectorAll(":scope > div:first-child > .small")].map(x => x.textContent.replace(/\s+/g, " ").trim())
  })));
  const opsummering = () => page.evaluate(() => document.getElementById("streakSummary")?.textContent.replace(/\s+/g, " ").trim() || null);
  const vaelgAar = async v => { await page.selectOption("#streakYear", v); await page.waitForTimeout(150); };
  const bredde = () => page.evaluate(() => ({ side: document.documentElement.scrollWidth, krop: document.body.scrollWidth, vindue: window.innerWidth }));
  return { page, fejl, raekker, opsummering, vaelgAar, bredde, luk: () => ctx.close() };
}

// Det, vi ventede, regnet i haanden: [pid, navn, aktuel, status, venter, naeste bonus, laengste, ekstra linje]
const datoTekst = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Copenhagen" }); };
const FORVENTET = [
  ["p5", "Emil Test", 7, "Trænet i dag", false, "Næste bonus: 10 dage giver +10", 7],
  ["p6", "Frida Test", 4, "Mangler i dag", true, "Næste bonus: 5 dage giver +5", 4],   // laengste er mindst den aktuelle
  ["p7", "Gustav Test", 4, "Trænet i dag", false, "Næste bonus: 5 dage giver +5", 4],
  ["p1", "Ada Test", 3, "Trænet i dag", false, "Næste bonus: 5 dage giver +5", 3],
  ["p2", "Bo Test", 3, "Mangler i dag", false, "Næste bonus: 5 dage giver +5", 8],
  ["p8", "Hans Test", 2, "Trænet i dag", false, "Næste bonus: 3 dage giver +5", 2],
  ["p10", "Zoe Test", 2, "Joker i dag", false, "Næste bonus: 3 dage giver +5", 2],
  ["p9", "Ida Test", 1, "Trænet i dag", false, "Næste bonus: 3 dage giver +5", 1],
  ["p3", "Carl Test", 0, "Brudt", false, null, 5, "Sidst 5 dage, sluttede " + datoTekst("2026-11-14")],
  ["p4", LANGT, 0, "Ingen streak endnu", false, null, 0]
];
const dagTxt = n => `${n} ${n === 1 ? "dag" : "dage"}`;
function tjekRaekker(navn, fik, forventet){
  t(navn + ": rækkefølgen (længst først, så navn)", ens(fik.map(r => r.pid), forventet.map(f => f[0])), fik.map(r => r.navn));
  for (const [pid, n, aktuel, status, venter, naeste, laengste, ekstra] of forventet) {
    const r = fik.find(x => x.pid === pid);
    if (!r) { t(`${navn}: ${n} står på listen`, false); continue; }
    const linjer = [`2017|2016`, ...(naeste ? [naeste] : []), ...(ekstra ? [ekstra] : []), `Længste streak: ${dagTxt(laengste)}`];
    t(`${navn}: ${n} · ${aktuel} · ${status}${venter ? " · venter på joker" : ""}`,
      r.navn === n && r.tal === aktuel && r.status[0] === status && (r.status[1] === "Venter på joker") === venter && r.status.length === (venter ? 2 : 1)
      && /^(2017|2016) · Aktuel streak: /.test(r.linjer[0]) && r.linjer[0].endsWith("Aktuel streak: " + dagTxt(aktuel))
      && ens(r.linjer.slice(1), linjer.slice(1)), r);
  }
}

// ------------------------------------------------------------------ traener, begge aargange
console.log("\nTræner med 2017 og 2016 (begge køn)");
let a = await aabn("tr");
await a.page.click("#tab-overview"); await a.page.waitForTimeout(200);
t("Overblik har en sektion Streaks med forklaringen", await a.page.evaluate(() => {
  const k = document.getElementById("streakCard");
  return !!k && k.offsetParent !== null && k.querySelector("h2").textContent === "Streaks"
    && k.querySelector("p.small").textContent === "En dag tæller, når barnet har lavet fodteknik eller taget et trin på Jongleringsstigen. Godkendte jokere bygger bro.";
}));
t("årgangsvalget har 'Alle mine årgange' og begge årgange, og står på alle",
  ens(await a.page.evaluate(() => [...document.querySelectorAll("#streakYear option")].map(o => o.value + "=" + o.textContent)), ["all=Alle mine årgange", "2017=2017", "2016=2016"])
  && await a.page.evaluate(() => document.getElementById("streakYear").value) === "all");
let r = await a.raekker();
tjekRaekker("alle", r, FORVENTET);
t("opsummeringen", await a.opsummering() === "8 børn har en aktiv streak · 2 mangler at træne i dag", await a.opsummering());
{
  const b = await a.bredde();
  t("ingen vandret scroll ved 390 px (også med et langt navn)", b.side <= b.vindue && b.krop <= b.vindue, b);
  const kant = await a.page.evaluate(() => [...document.querySelectorAll("#streakListe .streakrow, #streakListe .streaktal")].every(e => e.getBoundingClientRect().right <= window.innerWidth));
  t("og hver række og hvert tal ligger inden for skærmen", kant);
}

// Samme tal som Registrering: "Streak: N dage" (footworkCurrentStreak) for hvert barn.
{
  const reg = {};
  for (const [pid] of FORVENTET) {
    reg[pid] = await a.page.evaluate(id => { selectProfileForTracking(id); const m = /Streak: (\d+) dag(e)?( \(ingen aktuel streak\))?( · hviler på en joker, du ikke har afgjort)?/.exec(document.getElementById("trackingArea").innerText); return m ? { n: Number(m[1]), lever: !m[3], venter: !!m[4] } : null; }, pid);
  }
  t("Registrering viser samme længde, samme levende/brudt og samme joker-ventetid som Streaks",
    FORVENTET.every(([pid, , aktuel, status, venter]) => reg[pid] && reg[pid].n === aktuel && reg[pid].venter === venter && reg[pid].lever === !["Brudt", "Ingen streak endnu"].includes(status)), reg);
}

// Et klik paa navnet aabner barnet paa Registrering (i dag - siden har ingen dagvaelger).
await a.page.click("#tab-overview"); await a.page.waitForTimeout(150);
await a.page.click('#streakListe .streakrow[data-pid="p6"] .linkbtn'); await a.page.waitForTimeout(200);
t("klik på Frida åbner Registrering med Frida valgt", await a.page.evaluate(() =>
  !document.getElementById("track").classList.contains("hidden") && document.getElementById("trackPlayer").value === "p6"
  && /Streak: 4 dage · hviler på en joker, du ikke har afgjort/.test(document.getElementById("trackingArea").innerText)));

await a.page.click("#tab-overview"); await a.page.waitForTimeout(150);
await a.vaelgAar("2016");
r = await a.raekker();
tjekRaekker("kun 2016", r, FORVENTET.filter(f => ["p8", "p9"].includes(f[0])));
t("opsummeringen følger årgangen", await a.opsummering() === "2 børn har en aktiv streak · 0 mangler at træne i dag", await a.opsummering());
await a.vaelgAar("2017");
r = await a.raekker();
tjekRaekker("kun 2017", r, FORVENTET.filter(f => !["p8", "p9"].includes(f[0])));
t("opsummeringen for 2017", await a.opsummering() === "6 børn har en aktiv streak · 2 mangler at træne i dag", await a.opsummering());
// Valget overlever en ny optegning af hele appen (et sideskift tegner alt forfra).
await a.page.click("#tab-players"); await a.page.waitForTimeout(100);
await a.page.click("#tab-overview"); await a.page.waitForTimeout(150);
t("årgangsvalget står stadig på 2017 efter en ny optegning", await a.page.evaluate(() => document.getElementById("streakYear").value) === "2017");
t("ingen skrivninger fra Overblik", await a.page.evaluate(() => window.__skrivninger.length) === 0, await a.page.evaluate(() => window.__skrivninger));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.page.screenshot({ path: new URL("./streaks.png", import.meta.url).pathname, fullPage: true });
await a.luk();

// ------------------------------------------------------------------ koensbegraenset traener
console.log("\nTræner med kun pigerne i 2017");
a = await aabn("pg");
await a.page.click("#tab-overview"); await a.page.waitForTimeout(200);
t("årgangsvalget har kun 2017", ens(await a.page.evaluate(() => [...document.querySelectorAll("#streakYear option")].map(o => o.value)), ["all", "2017"]));
r = await a.raekker();
tjekRaekker("piger 2017", r, FORVENTET.filter(f => ["p6", "p1", "p10", "p4"].includes(f[0])));
t("ingen drenge og ingen 2016", !r.some(x => ["p2", "p3", "p5", "p7", "p8", "p9"].includes(x.pid)));
t("opsummeringen tæller kun pigerne", await a.opsummering() === "3 børn har en aktiv streak · 1 mangler at træne i dag", await a.opsummering());
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

// ------------------------------------------------------------------ spiller
console.log("\nSpilleren ser aldrig Streaks");
a = await aabn("sp");
t("Overblik-fanen er skjult for spilleren", await a.page.evaluate(() => document.getElementById("tab-overview").classList.contains("hidden")));
t("og sektionen er tom - heller ikke i den skjulte side", await a.page.evaluate(() => { renderStreakOverview(); return document.getElementById("streakArea").innerHTML === ""; }));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

// ------------------------------------------------------------------ admin + Se som spiller
console.log("\nAdmin: Streaks og Se som spiller");
a = await aabn("admin");
await a.page.click("#tab-overview"); await a.page.waitForTimeout(200);
r = await a.raekker();
tjekRaekker("admin", r, FORVENTET);
// Barnets egen side, tegnet med barnets data af "Se som spiller": samme længde og joker.
const barnet = {};
for (const [pid] of FORVENTET) {
  await a.page.evaluate(id => startSeSomSpiller(id), pid); await a.page.waitForTimeout(150);
  barnet[pid] = await a.page.evaluate(() => { const b = document.querySelector("#footwork .streakbox > div"); return b ? { tekst: b.querySelector("b").textContent.trim(), info: b.querySelector(".small").textContent.trim() } : null; });
  await a.page.evaluate(() => stopSeSomSpiller()); await a.page.waitForTimeout(100);
}
t("barnets egen fodteknikside viser samme streak og samme joker-ventetid",
  FORVENTET.every(([pid, , aktuel, status, venter]) => barnet[pid] && barnet[pid].tekst === dagTxt(aktuel)
    && barnet[pid].info.startsWith(["Brudt", "Ingen streak endnu"].includes(status) ? "ingen streak lige nu" : "aktuel streak")
    && barnet[pid].info.includes("afventer joker") === venter), barnet);
t("Se som spiller skrev intet", await a.page.evaluate(() => window.__skrivninger.length) === 0);
await a.page.click("#tab-overview"); await a.page.waitForTimeout(150);
t("efter Tilbage til admin står Streaks som før", ens((await a.raekker()).map(x => x.pid), FORVENTET.map(f => f[0])));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
