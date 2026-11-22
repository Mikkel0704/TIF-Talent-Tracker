// Se som spiller (Admin): admin vaelger et barn og ser Daglig fodteknik, Jongleringsstigen og
// Ranglisten, PRAECIS som barnet ser dem - med barnets egne data og den rangliste, barnets
// login ville faa (egen aargang, og kun eget koen, naar loginnet er begraenset til ét koen).
// HELE index.html koeres uaendret mod efterligningen i stoette/firebase-stedfortraeder.js.
// Testen aabner foerst appen som barnet selv og gemmer, hvad der staar paa de tre sider -
// og kraever saa, at admins visning af samme barn siger ordret det samme. Ingen skrivning
// maa ske i visningen (window.__skrivninger), og "Tilbage til admin" skal give admin sine
// faner, sin side og sine lyttere tilbage, som de var.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const sted = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PV = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];
const REGLER = /const POINTREGLER = "([^"]+)"/.exec(html)[1];
const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: "2026-11-01T10:00:00Z", privacyVersion: PV };
let ok = 0, fejlet = 0;
const t = (n, b, info) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (info !== undefined ? "\n         " + JSON.stringify(info).slice(0, 600) : ""))); };
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const browser = await chromium.launch();

// Torsdag 10. december 2026: ugen startede mandag 7., maaneden 1. december, og november er
// kaaret (den 5.). Kaaringerne for november ligger klar for begge aargange, saa admins egen
// reserve-kaaring ikke har noget at skrive.
const NU = "2026-12-10T12:00:00+01:00";
const UGE = "2026-12-07", MAANED = "2026-12-01";
const linje = (name, year, gender, total, uge, maaned) =>
  ({ name, year, gender, kanUdfordres: true, total, uge: { fra: UGE, point: uge }, maaned: { fra: MAANED, point: maaned }, regler: REGLER });
const spiller = (name, year, gender, ekstra = {}) => ({ name, year, gender, points: 0, passed: {}, history: [], ...ekstra });
const BRUGERE = {
  admin: { email: "a@x.invalid", role: "admin", years: ["2017", "2016"], ...ok_ },
  // Ida: et rigtigt spillerlogin, begraenset til pigerne i 2017.
  ida:   { email: "i@x.invalid", role: "player", playerId: "p1", years: ["2017"], yearGenders: { "2017": "pige" }, ...ok_ },
  // Oscar: et spillerlogin uden koensbegraensning - ser hele aargangen.
  oscar: { email: "o@x.invalid", role: "player", playerId: "p2", years: ["2017"], ...ok_ },
  tr:    { email: "t@x.invalid", role: "coach", years: ["2017", "2016"], ...ok_ }
};
const DATA = () => ({
  users: BRUGERE,
  players: {
    p1: spiller("Ida Test", "2017", "pige", { hasActiveLogin: true }),
    p2: spiller("Oscar Test", "2017", "dreng", { hasActiveLogin: true }),
    p3: spiller("Bo Test", "2017", "dreng"),
    p4: spiller("Anna Test", "2017", "pige"),
    p5: spiller("Lis Test", "2016", "pige"),          // intet login
    p6: spiller("Mads Test", "2016", "dreng"),
    p7: spiller("Sofie Test", "2016", "pige")
  },
  // Ida: tre dage i traek (streak 3), toe-taps 3 gange i dag, og en joker, der venter.
  footwork: {
    p1: { year: "2017", gender: "pige", days: { "2026-12-10": { t: 3 }, "2026-12-09": { t: 1 }, "2026-12-08": { t: 2 } }, jokerRequests: { "2026-12-05": true } },
    p2: { year: "2017", gender: "dreng", days: { "2026-12-10": { t: 1 } } },
    p5: { year: "2016", gender: "pige", days: { "2026-12-09": { t: 1 } } }
  },
  footworkLog: { p1: { year: "2017", gender: "pige", entries: [], reasons: { "2026-12-05": { tekst: "syg", at: "2026-12-05T10:00:00Z" } } } },
  // Ida: 5 trin paa hovedstigen, 2 paa daarligt ben, Opløft og Yderside 5 - Inderside 10 er laast.
  juggleLadder: {
    p1: { year: "2017", gender: "pige", mainStep: 5, weakStep: 2, tricks: ["oploft", "yderside5"], days: ["2026-12-09"] },
    p2: { year: "2017", gender: "dreng", mainStep: 2, weakStep: 0, tricks: [], days: ["2026-12-10"] }
  },
  juggleLog: { p1: { year: "2017", gender: "pige", entries: [] } },
  rangliste: {
    p1: linje("Ida Test", "2017", "pige", 120, 30, 60),
    p2: linje("Oscar Test", "2017", "dreng", 200, 10, 90),
    p3: linje("Bo Test", "2017", "dreng", 50, 5, 20),
    p4: linje("Anna Test", "2017", "pige", 80, 40, 40),
    p5: linje("Lis Test", "2016", "pige", 40, 4, 8),
    p6: linje("Mads Test", "2016", "dreng", 90, 9, 30),
    p7: linje("Sofie Test", "2016", "pige", 10, 1, 2)
  },
  klubRangliste: { top: { top: [
    { id: "p2", name: "Oscar Test", year: "2017", total: 200 },
    { id: "p1", name: "Ida Test", year: "2017", total: 120 },
    { id: "p6", name: "Mads Test", year: "2016", total: 90 }
  ], regler: REGLER } },
  maanedensSpiller: {
    "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p1", navn: "Ida Test", dage: 14, minutter: 21, oevelser: 14, point: 28 }] },
    "2026-11_2016": { maaned: "2026-11", aargang: "2016", vindere: [{ id: "p6", navn: "Mads Test", dage: 9, minutter: 13.5, oevelser: 9, point: 18 }] }
  },
  maanedensTopscorer: {
    "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p2", navn: "Oscar Test", point: 90, oevelser: 12, svaer: 3, mellem: 2, let: 1, starter: 0 }] },
    "2026-11_2016": { maaned: "2026-11", aargang: "2016", vindere: [{ id: "p5", navn: "Lis Test", point: 40, oevelser: 5, svaer: 0, mellem: 1, let: 2, starter: 2 }] }
  }
});

async function aabn(uid){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "Europe/Copenhagen" });
  const page = await ctx.newPage(); const fejl = []; let nativ = 0;
  page.on("pageerror", e => fejl.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) fejl.push(m.text()); });
  page.on("dialog", async d => { nativ++; await d.dismiss(); });
  await page.clock.setFixedTime(new Date(NU));
  await page.route("**/*", r => { const u = r.request().url();
    if (u === "https://app.test/") return r.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return r.fulfill({ contentType: "application/javascript", body: sted });
    return r.abort(); });
  await page.addInitScript(([d, br, pv]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; window.__lyt = []; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} },
    [DATA(), { uid, email: BRUGERE[uid].email }, PV]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  // Admins reserve-kaaring kigger efter 1,2 sekunder - den skal vaere faerdig (og have
  // fundet, at alt er kaaret), foer vi taeller skrivninger.
  await page.waitForTimeout(1800);
  // Synlige faner efter det, brugeren faktisk ser (en fane kan skjules af en klasse eller af CSS).
  const faner = () => page.evaluate(() => [...document.querySelectorAll("#mainNav button")].filter(b => getComputedStyle(b).display !== "none").map(b => b.id.replace("tab-", "")));
  const side = () => page.evaluate(() => [...document.querySelectorAll(".page")].filter(p => !p.classList.contains("hidden")).map(p => p.id));
  const gaaTil = async id => { await page.click("#tab-" + id); await page.waitForTimeout(150); };
  const tekst = s => page.evaluate(x => document.querySelector(x)?.innerText || "", s);
  const dialog = () => page.evaluate(() => { const d = document.getElementById("appDialog"); return d && !d.classList.contains("hidden") ? document.getElementById("dialogTekst").textContent : null; });
  const lukDialog = async () => { for (let i = 0; i < 5 && await dialog() !== null; i++) { await page.click("#dialogNej:not(.hidden), #dialogJa").catch(() => {}); await page.waitForTimeout(120); } };
  const skrivninger = () => page.evaluate(() => JSON.stringify(window.__skrivninger));
  const lyt = () => page.evaluate(() => window.__lyt.length);
  const klik = async (sektion, tekst_) => { await page.evaluate(([s, x]) => [...document.querySelectorAll(s + " button")].find(b => b.textContent.replace(/\s+/g, " ").includes(x)).click(), [sektion, tekst_]); await page.waitForTimeout(150); };
  return { page, fejl, nativ: () => nativ, faner, side, gaaTil, tekst, dialog, lukDialog, skrivninger, lyt, klik, luk: () => ctx.close() };
}

// De tre sider, som de staar: fodteknik, stigen og ranglisten i alle fire visninger.
async function fang(a){
  const ud = {};
  await a.gaaTil("footwork"); ud.fodteknik = await a.tekst("#footworkArea");
  await a.gaaTil("juggle"); ud.stige = await a.tekst("#juggleArea");
  await a.gaaTil("leaderboard");
  ud.maaned = await a.tekst("#maanedensArea");
  ud.alle = await a.tekst("#leaderboardArea");
  await a.klik("#leaderboard", "Denne uge"); ud.uge = await a.tekst("#leaderboardArea");
  await a.klik("#leaderboard", "Denne måned"); ud.maanedPoint = await a.tekst("#leaderboardArea");
  await a.klik("#leaderboard", "Hele klubben"); ud.klub = await a.tekst("#leaderboardArea");
  await a.klik("#leaderboard", "Min årgang"); await a.klik("#leaderboard", "All-time");
  ud.vaelger = await a.tekst("#leaderboardScopeArea") + "|" + await a.tekst("#leaderboardPeriodArea") + "|" + await a.tekst("#leaderboardFilter");
  return ud;
}
const navneI = s => s.split("\n").filter(l => /Test/.test(l)).map(l => l.replace(/^\S+\s/, "").trim());

// ------------------------------------------------------------------ barnet selv
console.log("\nBarnet selv (det, visningen skal ligne)");
let a = await aabn("ida");
const IDA = await fang(a);
t("Ida: tre dage i træk og 3 toe-taps i dag", /3 dage\s+aktuel streak/.test(IDA.fodteknik) && /I dag\s*3 ✓/.test(IDA.fodteknik), IDA.fodteknik.slice(0, 300));
t("Ida: stigen står på 5/16, 2/12 og 2 tricks", IDA.stige.includes("Hovedstigen 5/16 · Dårligt ben 2/12 · Tricks 2/16"));
t("Ida: ranglisten er pigerne i 2017", ens(navneI(IDA.alle), ["Ida Test", "Anna Test"]), navneI(IDA.alle));
t("Ida: ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();
a = await aabn("oscar");
const OSCAR = await fang(a);
t("Oscar: ranglisten er hele 2017, begge køn", ens(navneI(OSCAR.alle), ["Oscar Test", "Ida Test", "Anna Test", "Bo Test"]), navneI(OSCAR.alle));
await a.luk();

// ------------------------------------------------------------------ admin
console.log("\nAdmin · Se som spiller");
a = await aabn("admin");
const fanerFoer = await a.faner();
t("admin ser sine egne faner", fanerFoer.includes("admin") && fanerFoer.includes("players") && !fanerFoer.includes("footwork"), fanerFoer);
// Admin har selv valgt "Denne uge" paa ranglisten - det skal staa der igen bagefter.
await a.gaaTil("leaderboard"); await a.klik("#leaderboard", "Denne uge");
const adminRangFoer = await a.tekst("#leaderboardPeriodArea") + "|" + await a.page.evaluate(() => document.querySelector("#leaderboardPeriodArea .current")?.textContent);
await a.gaaTil("admin");
t("accordionen 'Se som spiller' står under Admin", /Se som spiller/.test(await a.tekst("#adminSeSomSpiller summary")));
await a.page.evaluate(() => { document.getElementById("adminSeSomSpiller").open = true; });
const valg = await a.page.evaluate(() => [...document.querySelectorAll("#seSomSpillerValg optgroup")].map(g => g.label + ": " + [...g.querySelectorAll("option")].map(o => o.textContent).join(", ")));
t("vælgeren har alle børn, grupperet efter årgang, med navn · årgang · køn",
  ens(valg, ["2017: Anna Test · 2017 · pige, Bo Test · 2017 · dreng, Ida Test · 2017 · pige, Oscar Test · 2017 · dreng",
             "2016: Lis Test · 2016 · pige, Mads Test · 2016 · dreng, Sofie Test · 2016 · pige"]), valg);
const skrevetFoer = await a.skrivninger(), lytFoer = await a.lyt();

await a.page.selectOption("#seSomSpillerValg", "p1");
await a.page.click('#adminSeSomSpiller button:has-text("Vis som spiller")'); await a.page.waitForTimeout(250);
t("banneret står øverst: 'Du ser appen som Ida Test (2017) – intet kan ændres her'",
  (await a.tekst("#seSomSpillerBanner")).includes("Du ser appen som Ida Test (2017) – intet kan ændres her"), await a.tekst("#seSomSpillerBanner"));
t("Ida har et login - banneret siger ikke andet", !/intet login/.test(await a.tekst("#seSomSpillerBanner")));
t("kun fanerne Fodteknik, Jonglering og Rangliste", ens(await a.faner(), ["footwork", "juggle", "leaderboard"]), await a.faner());
t("visningen åbner på Daglig fodteknik", ens(await a.side(), ["footwork"]), await a.side());
const VIS = await fang(a);
for (const [k, navn] of [["fodteknik", "Daglig fodteknik"], ["stige", "Jongleringsstigen"], ["maaned", "Månedens spiller og topscorer"], ["alle", "ranglisten all-time"],
  ["uge", "ranglisten denne uge"], ["maanedPoint", "ranglisten denne måned"], ["klub", "klubbens top 10"], ["vaelger", "rangliste-knapperne"]])
  t(`${navn}: ordret det samme, som Ida selv ser`, VIS[k] === IDA[k], { vis: VIS[k].slice(0, 300), ida: IDA[k].slice(0, 300) });
t("fodteknikken har Idas dag: 3 toe-taps og streaken på 3 dage", /3 dage\s+aktuel streak/.test(VIS.fodteknik) && /I dag\s*3 ✓/.test(VIS.fodteknik));
t("og Idas joker, der venter", /afventer/.test(VIS.fodteknik));
t("stigen: Hovedstigen 5/16, Dårligt ben 2/12, Tricks 2/16", VIS.stige.includes("Hovedstigen 5/16 · Dårligt ben 2/12 · Tricks 2/16"));
t("det låste trick står med grunden: Tag Inderside 5 først", /Inderside 10[\s\S]*Tag Inderside 5 først/.test(VIS.stige));
t("ranglisten er kun Idas årgang og køn (login begrænset til piger)", ens(navneI(VIS.alle), ["Ida Test", "Anna Test"]), navneI(VIS.alle));
t("denne uge: Anna 40 over Ida 30", /Anna Test[\s\S]*40 point[\s\S]*Ida Test[\s\S]*30 point/.test(VIS.uge), VIS.uge);
t("klubbens top 10 er klubbens", ens(navneI(VIS.klub), ["Oscar Test", "Ida Test", "Mads Test"]), navneI(VIS.klub));
t("kortet: Ida er Månedens spiller - 'det er dig!'", /Ida Test - det er dig!/.test(VIS.maaned), VIS.maaned);
t("og Oscar er topscorer", /Oscar Test[\s\S]*Månedens topscorer/.test(VIS.maaned));
t("ingen vandret scroll ved 390 px", await a.page.evaluate(() => document.documentElement.scrollWidth <= 390));

// ---- intet kan skrives
console.log("\nVisningen skriver intet");
const skrivende = /^(registerJuggle|undoJuggle|undoJuggleTrick|registerFootwork|requestFootworkJoker|cancelFootworkJoker)\(/;
for (const s of ["footwork", "juggle"]) {
  await a.gaaTil(s);
  const knapper = await a.page.evaluate(([sid, re]) => [...document.querySelectorAll("#" + sid + " button")].filter(b => new RegExp(re).test(b.getAttribute("onclick") || ""))
    .map(b => b.disabled), [s, skrivende.source]);
  t(`${s}: alle ${knapper.length} knapper, der ville skrive, er slået fra`, knapper.length > 3 && knapper.every(Boolean), knapper);
}
await a.gaaTil("footwork");
t("+ og Søg/Træk tilbage er der stadig - grå, ikke væk", await a.page.evaluate(() => !!document.querySelector('#footworkArea .counter button[aria-label^="Tilføj"]')));
// Hver eneste knap paa de tre sider trykkes - ogsaa dem, der er slaaet fra.
let trykket = 0;
for (const s of ["footwork", "juggle", "leaderboard"]) {
  await a.gaaTil(s);
  const antal = await a.page.evaluate(sid => document.querySelectorAll("#" + sid + " button").length, s);
  for (let i = 0; i < antal; i++) {
    await a.page.evaluate(([sid, n]) => document.querySelectorAll("#" + sid + " button")[n]?.click(), [s, i]);
    trykket++;
    await a.page.waitForTimeout(30);
    await a.lukDialog();
  }
  // Dagvaelgeren er der stadig (et tryk paa en dag skriver intet), saa siden er tegnet om
  // undervejs - og stadig paa den rigtige side.
  t(`${s}: ${antal} knapper trykket, siden er der stadig`, ens(await a.side(), [s]), await a.side());
}
t(`${trykket} tryk - ingen skrivning`, (await a.skrivninger()) === skrevetFoer, (await a.skrivninger()).slice(0, 400));
// Et vildfarent tryk paa en knap, der alligevel ikke er slaaet fra, naar ikke databasen.
await a.gaaTil("footwork");
await a.page.evaluate(() => { const b = document.querySelector('#footworkArea .counter button[aria-label^="Tilføj"]'); b.disabled = false; b.click(); });
await a.page.waitForTimeout(150);
t("et tryk på + uden spærring giver beskeden 'Det her er kun en visning'", /^Det her er kun en visning/.test(await a.dialog() || ""), await a.dialog());
await a.lukDialog();
const direkte = [
  ["registerFootwork", "registerFootwork('t', 1)"], ["registerFootwork(-1)", "registerFootwork('t', -1)"],
  ["requestFootworkJoker", "requestFootworkJoker()"], ["cancelFootworkJoker", "cancelFootworkJoker()"],
  ["registerJuggle(main)", "registerJuggle('main', 5)"], ["registerJuggle(weak)", "registerJuggle('weak', 2)"], ["registerJuggle(trick)", "registerJuggle('trick', 'yderside10')"],
  ["undoJuggle", "undoJuggle('main')"], ["undoJuggleTrick", "undoJuggleTrick('oploft')"],
  ["createChallenge", "createChallenge('p1')"], ["respondChallenge", "respondChallenge('x', true)"], ["submitChallengeVideo", "submitChallengeVideo('x')"],
  ["submitTraining", "submitTraining('p1', 0, 'x')"], ["requestOwnDeletion", "requestOwnDeletion()"], ["cancelOwnDeletionRequest", "cancelOwnDeletionRequest()"],
  ["correctJuggle", "correctJuggle('p1', 'main')"], ["correctJuggleTrick", "correctJuggleTrick('p1', 'oploft')"], ["correctFootwork", "correctFootwork('p1', '2026-12-10', 't')"],
  ["correctFootworkDay", "correctFootworkDay('p1', '2026-12-10')"], ["resetFootworkDay", "resetFootworkDay('p1', '2026-12-10')"],
  ["decideFootworkJoker", "decideFootworkJoker('p1', '2026-12-05', true)"], ["clearFootworkJoker", "clearFootworkJoker('p1', '2026-12-05')"]
];
for (const [navn, kald] of direkte) {
  await a.page.evaluate(k => { new Function(k.replace(/^(\w+)/, "window.$1"))(); }, kald);
  await a.page.waitForTimeout(80);
  t(`${navn} kaldt direkte: 'Det her er kun en visning'`, /^Det her er kun en visning/.test(await a.dialog() || ""), await a.dialog());
  await a.lukDialog();
}
t("stadig ingen skrivning", (await a.skrivninger()) === skrevetFoer, (await a.skrivninger()).slice(0, 400));

// ---- tilbage
console.log("\nTilbage til admin");
await a.page.click('#seSomSpillerBanner button:has-text("Tilbage til admin")'); await a.page.waitForTimeout(250);
t("admin-siden er tilbage", ens(await a.side(), ["admin"]), await a.side());
t("admins faner er præcis som før", ens(await a.faner(), fanerFoer), await a.faner());
t("banneret er væk", await a.page.evaluate(() => getComputedStyle(document.getElementById("seSomSpillerBanner")).display === "none"));
t("ingen lytter er startet eller stoppet for visningen", (await a.lyt()) === lytFoer);
// Admin har ingen Fodteknik-fane; siden aabnes, som en knap i appen ville goere det.
await a.page.evaluate(() => window.showPage("footwork")); await a.page.waitForTimeout(150);
t("Fodteknik er igen admins (til spillere)", /Fodteknik er til spillere/.test(await a.tekst("#footworkArea")));
await a.gaaTil("leaderboard");
t("ranglisten er admins egen igen: årgangsvælger og 'Denne uge', som admin havde valgt",
  (await a.tekst("#leaderboardPeriodArea") + "|" + await a.page.evaluate(() => document.querySelector("#leaderboardPeriodArea .current")?.textContent)) === adminRangFoer
  && await a.page.evaluate(() => !!document.getElementById("leaderboardYear")));
{
  const admins = await a.tekst("#leaderboardArea");
  t("og admins liste rummer begge årgange og begge køn", ["Mads Test", "Ida Test", "Oscar Test", "Lis Test"].every(n => admins.includes(n)), admins.slice(0, 300));
}

// ---- Oscar: login uden koensbegraensning
console.log("\nOscar (login uden kønsbegrænsning)");
await a.gaaTil("admin");
await a.page.selectOption("#seSomSpillerValg", "p2");
await a.page.click('#adminSeSomSpiller button:has-text("Vis som spiller")'); await a.page.waitForTimeout(250);
t("banneret: Oscar Test (2017)", (await a.tekst("#seSomSpillerBanner")).includes("Du ser appen som Oscar Test (2017) – intet kan ændres her"));
const VO = await fang(a);
t("ranglisten viser begge køn i 2017 - som Oscars eget login", ens(navneI(VO.alle), ["Oscar Test", "Ida Test", "Anna Test", "Bo Test"]), navneI(VO.alle));
for (const k of ["fodteknik", "stige", "maaned", "alle", "uge", "maanedPoint", "klub"]) t(`Oscar · ${k}: ordret som Oscars eget login`, VO[k] === OSCAR[k], { vis: VO[k].slice(0, 200), oscar: OSCAR[k].slice(0, 200) });
t("Oscars stige er hans egen: Hovedstigen 2/16", VO.stige.includes("Hovedstigen 2/16 · Dårligt ben 0/12 · Tricks 0/16"));
await a.klik("#seSomSpillerBanner", "Tilbage til admin");

// ---- Lis: intet login
console.log("\nLis (intet login)");
await a.page.selectOption("#seSomSpillerValg", "p5");
await a.page.click('#adminSeSomSpiller button:has-text("Vis som spiller")'); await a.page.waitForTimeout(250);
const banner = await a.tekst("#seSomSpillerBanner");
t("banneret siger, at barnet intet login har", banner.includes("Du ser appen som Lis Test (2016) – intet kan ændres her") && banner.includes("(barnet har intet login - vist som en spiller med samme køn)"), banner);
const VL = await fang(a);
t("ranglisten: pigerne i 2016", ens(navneI(VL.alle), ["Lis Test", "Sofie Test"]), navneI(VL.alle));
t("kortet viser 2016: Lis er topscorer - 'det er dig!'", /Lis Test - det er dig!/.test(VL.maaned) && /Mads Test/.test(VL.maaned) && !/Ida Test/.test(VL.maaned), VL.maaned);
t("fodteknikken er Lis' egen (én dag)", /I går\s*1 ✓/.test(VL.fodteknik) && !/I dag\s*\d ✓/.test(VL.fodteknik));
await a.klik("#seSomSpillerBanner", "Tilbage til admin");
t("admins faner er stadig som før", ens(await a.faner(), fanerFoer));
t("hele vejen: ingen skrivning", (await a.skrivninger()) === skrevetFoer);
t("og ingen nye lyttere", (await a.lyt()) === lytFoer);
t("browserens egne bokse blev aldrig brugt", a.nativ() === 0);
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

// ------------------------------------------------------------------ ikke-admin
console.log("\nKun admin");
for (const uid of ["tr", "ida"]) {
  a = await aabn(uid);
  t(`${uid}: ingen Admin-fane og ingen 'Se som spiller'`, !(await a.faner()).includes("admin")
    && await a.page.evaluate(() => { const d = document.getElementById("adminSeSomSpiller"); return !d || !d.offsetParent; }));
  const fanerF = await a.faner();
  // Svaret er beskedens promise - det ventes der ikke paa (dialogen lukkes nedenfor).
  await a.page.evaluate(() => { window.startSeSomSpiller("p1"); });
  await a.page.waitForTimeout(150);
  t(`${uid}: kaldt direkte siger den nej og ændrer intet`, /Kun admin/.test(await a.dialog() || "") && ens(await a.faner(), fanerF)
    && await a.page.evaluate(() => getComputedStyle(document.getElementById("seSomSpillerBanner")).display === "none"), await a.dialog());
  await a.lukDialog();
  t(`${uid}: ingen JS-fejl`, a.fejl.length === 0, a.fejl);
  await a.luk();
}

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
