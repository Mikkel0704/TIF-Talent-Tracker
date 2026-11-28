// Ranglisten fra serveren: et spillerlogin henter kun det om andre boern, ranglisten skal
// bruge - linjerne i rangliste/ for egen aargang og klubbens top 10 i klubRangliste/top.
// Hele appen koeres uaendret mod efterligningen i stoette/firebase-stedfortraeder.js, som
// husker hver lytter i window.__lyt. Reglerne selv testes i tests/regler.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const sted = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PV = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];
const REGLER = /const POINTREGLER = "([^"]+)"/.exec(html)[1];
const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: "2026-11-01T10:00:00Z", privacyVersion: PV };
let ok = 0, fejlet = 0;
const t = (n, b, info) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (info !== undefined ? "\n         " + JSON.stringify(info) : ""))); };
const browser = await chromium.launch();

// Onsdag 18. november 2026: ugen startede mandag 16., maaneden 1. november.
const NU = "2026-11-18T12:00:00+01:00";
const UGE = "2026-11-16", MAANED = "2026-11-01";
const linje = (name, year, gender, kanUdfordres, total, uge, maaned, regler = REGLER) =>
  ({ name, year, gender, kanUdfordres, total, uge: { fra: uge[0], point: uge[1] }, maaned: { fra: maaned[0], point: maaned[1] }, regler });
const BRUGERE = {
  sp:    { email: "o@x.invalid", role: "player", playerId: "p1", years: ["2017"], ...ok_ },
  demo:  { email: "d@x.invalid", role: "player", playerId: "p9", years: ["2017"], demo: true, ...ok_ },
  // Som de rigtige spillerlogins: begraenset til barnets eget koen i aargangen.
  spd:   { email: "od@x.invalid", role: "player", playerId: "p1", years: ["2017"], yearGenders: { "2017": "dreng" }, ...ok_ },
  tr:    { email: "t@x.invalid", role: "coach", years: ["2017"], ...ok_ },
  dr:    { email: "dr@x.invalid", role: "coach", years: ["2017"], yearGenders: { "2017": "dreng" }, ...ok_ },
  admin: { email: "a@x.invalid", role: "admin", years: ["2017", "2016"], ...ok_ }
};
// Linjerne for 2017 og én fra 2016, som en spiller i 2017 aldrig maa se.
const LINJER = {
  p1: linje("Oscar Test", "2017", "dreng", true, 40, [UGE, 12], [MAANED, 30]),
  p2: linje("Bo Test",    "2017", "dreng", true, 450, ["2026-11-09", 50], [MAANED, 20]),   // uge-starten er gammel
  p3: linje("Ida Test",   "2017", "pige",  true, 160, [UGE, 5], ["2026-10-01", 70]),       // maaneds-starten er gammel
  p4: linje("Carl Test",  "2017", "dreng", false, 0, [UGE, 0], [MAANED, 0]),               // har intet aktivt login
  p5: linje("Kim Test",   "2017", null,    true, 3, [UGE, 0], [MAANED, 3]),                // koen ikke sat
  p6: linje("Anna Test",  "2016", "dreng", true, 999, [UGE, 9], [MAANED, 9]),
  p9: linje("Demo Test",  "2017", "dreng", false, 7, [UGE, 2], [MAANED, 7])                // barnet bag demo-loginnet: intet rigtigt login
};
const TOP = { top: [
  { id: "p2", name: "Bo Test", year: "2017", total: 450 },
  { id: "x9", name: "Zara Anden", year: "2014", total: 300 },
  { id: "p1", name: "Oscar Test", year: "2017", total: 40 }
], regler: REGLER };

async function aabn(uid, db, tid = NU){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "Europe/Copenhagen" });
  const page = await ctx.newPage(); const fejl = []; let nativ = 0;
  page.on("pageerror", e => fejl.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) fejl.push(m.text()); });
  page.on("dialog", async d => { nativ++; await d.dismiss(); });
  await page.clock.setFixedTime(new Date(tid));
  await page.route("**/*", r => { const u = r.request().url();
    if (u === "https://app.test/") return r.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return r.fulfill({ contentType: "application/javascript", body: sted });
    return r.abort(); });
  const alt = { users: BRUGERE, ...db };
  await page.addInitScript(([d, br, pv]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; window.__lyt = []; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} },
    [alt, { uid, email: BRUGERE[uid].email }, PV]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const lyt = () => page.evaluate(() => window.__lyt.map(l => `${l.navn}|${l.kind}|${l.id || ""}|${l.filtre.join("&")}`));
  const gaaTil = async id => { await page.click("#tab-" + id); await page.waitForTimeout(200); };
  const raekker = () => page.evaluate(() => [...document.querySelectorAll("#leaderboardArea .player")].map(r => ({
    navn: r.querySelector("b").textContent.replace(/^\S+\s/, "").trim(), point: r.querySelector(".pill").textContent.trim(), info: r.querySelector(".small").textContent.trim() })));
  const klik = async tekst => { await page.evaluate(x => [...document.querySelectorAll("#leaderboard button")].find(b => b.textContent.replace(/\s+/g, " ").includes(x)).click(), tekst); await page.waitForTimeout(150); };
  const tekst = s => page.evaluate(x => document.querySelector(x)?.innerText || "", s);
  const dialog = () => page.evaluate(() => { const d = document.getElementById("appDialog"); return d && !d.classList.contains("hidden") ? document.getElementById("dialogTekst").textContent : null; });
  return { page, fejl, nativ: () => nativ, lyt, gaaTil, raekker, klik, tekst, dialog, luk: () => ctx.close() };
}
const OSCAR = { p1: { name: "Oscar Test", year: "2017", gender: "dreng", points: 40, passed: {}, history: [], hasActiveLogin: true } };

// ------------------------------------------------------------------ lyttere
console.log("\nEt spillerlogin beder kun om det, kontrakten tillader");
let a = await aabn("sp", { players: OSCAR, rangliste: LINJER, klubRangliste: { top: TOP } });
const forventet = [
  "players|doc|p1|",
  "rangliste|col||year==2017&kanUdfordres==true", "rangliste|doc|p1|",
  "klubRangliste|doc|top|",
  "submissions|col||playerId==p1", "submissions|col||challengerId==p1", "submissions|col||opponentId==p1",
  "submissionVideos|col||playerId==p1", "submissionVideos|col||opponentId==p1&decided==true", "submissionVideos|col||challengerId==p1&decided==true",
  "challenges|col||challengerId==p1", "challenges|col||opponentId==p1",
  "juggleLadder|doc|p1|", "juggleLog|doc|p1|", "footwork|doc|p1|", "footworkLog|doc|p1|",
  "deletionRequests|doc|p1|", "clubConfig|doc|modules|", "clubConfig|doc|guideVideos|", "maanedensSpiller|col||", "maanedensTopscorer|col||"
].sort();
let lyt = await a.lyt();
t("præcis lytterne i kontraktens tabel - hverken flere eller færre", JSON.stringify([...lyt].sort()) === JSON.stringify(forventet),
  { mangler: forventet.filter(x => !lyt.includes(x)), ekstra: lyt.filter(x => !forventet.includes(x)) });
t("ingen lytter på clubRanking", !lyt.some(x => x.startsWith("clubRanking|")));
t("ingen lytter på hele footwork, juggleLadder, players, submissions eller challenges",
  !lyt.some(x => /^(footwork|juggleLadder|players|submissions|challenges|juggleLog|footworkLog)\|col\|\|$/.test(x)));
t("hvert enkeltdokument om et barn er spillerens eget - også ranglistelinjen",
  lyt.filter(x => /^(players|juggleLadder|juggleLog|footwork|footworkLog|deletionRequests|rangliste)\|doc\|/.test(x)).every(x => x.split("|")[2] === "p1"));
t("årgangens linjer hentes kun for børn med login (kanUdfordres == true)", lyt.filter(x => x.startsWith("rangliste|col")).every(x => /kanUdfordres==true/.test(x)), lyt.filter(x => x.startsWith("rangliste")));
t("og hver forespørgsel på registreringer er bundet til spillerens id",
  lyt.filter(x => /^(submissions|submissionVideos|challenges)\|col/.test(x)).every(x => /Id==p1/.test(x)));
await a.gaaTil("leaderboard");
t("lytterne ændrer sig ikke, når ranglisten åbnes", JSON.stringify([...(await a.lyt())].sort()) === JSON.stringify(forventet));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

a = await aabn("demo", { players: { p9: { name: "Demo Test", year: "2017", gender: "dreng", points: 0, passed: {}, history: [] } }, rangliste: LINJER });
lyt = await a.lyt();
t("demo-loginnet beder om det samme - på sit eget id",
  JSON.stringify([...lyt].sort()) === JSON.stringify(forventet.map(x => x.replace(/p1/g, "p9")).sort()), lyt);
await a.luk();

console.log("\nEt login, der er begrænset til ét køn, spørger kun efter det køn");
a = await aabn("spd", { players: OSCAR, rangliste: LINJER, klubRangliste: { top: TOP } });
lyt = await a.lyt();
t("ranglisten hentes med årgang OG køn - og kun børn med login", lyt.includes("rangliste|col||year==2017&gender==dreng&kanUdfordres==true"), lyt.filter(x => x.startsWith("rangliste")));
t("og ikke for hele årgangen", !lyt.some(x => /^rangliste\|col\|\|year==2017(&kanUdfordres==true)?$/.test(x)));
t("plus egen linje som et enkeltdokument", lyt.includes("rangliste|doc|p1|"));
await a.gaaTil("leaderboard");
await a.klik("All-time");
{
  const navne = (await a.raekker()).map(r => r.navn);
  t("drengene med login i årgangen står på listen", ["Oscar Test", "Bo Test"].every(n => navne.includes(n)), navne);
  t("pigerne og en anden årgang står der ikke", !navne.includes("Ida Test") && !navne.includes("Anna Test"), navne);
  t("børn uden login står der ikke (Carl, barnet bag demo-loginnet)", !navne.includes("Carl Test") && !navne.includes("Demo Test"), navne);
}
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

console.log("\nTræner og admin");
// Pointreglerne 2026-11-25: Bo har 450 Talentmærke-point paa spilleren og Oscar 40 - de
// taeller ikke. Paa fodteknik har Oscar 11 (3 x toe-taps med kombi) og Bo 5 (én svær).
const ALLE = { p1: OSCAR.p1,
  p2: { name: "Bo Test", year: "2017", gender: "dreng", points: 450, passed: {}, history: [], hasActiveLogin: true },
  p3: { name: "Carl Test", year: "2016", gender: "dreng", points: 0, passed: {}, history: [] } };
const FODTEKNIK = { p1: { year: "2017", gender: "dreng", days: { "2026-11-17": { t: 3 } } },
  p2: { year: "2017", gender: "dreng", days: { "2026-11-16": { k: 1 } } } };
const GAMMEL_KLUB = { p1: { name: "Oscar Test", year: "2017", points: 9999 } };   // den gamle spejl-tabel - maa ikke bruges
a = await aabn("tr", { players: ALLE, footwork: FODTEKNIK, clubRanking: GAMMEL_KLUB, klubRangliste: { top: TOP } });
lyt = await a.lyt();
t("træneren lytter på footwork for sin årgang", lyt.includes("footwork|col||year==2017") && !lyt.includes("footwork|col||"), lyt.filter(x => x.startsWith("footwork|")));
t("og på juggleLadder for sin årgang", lyt.includes("juggleLadder|col||year==2017") && !lyt.includes("juggleLadder|col||"), lyt.filter(x => x.startsWith("juggleLadder|")));
t("ikke på clubRanking", !lyt.some(x => x.startsWith("clubRanking|")));
t("klubbens top 10 kommer fra klubRangliste/top", lyt.includes("klubRangliste|doc|top|"));
t("træneren henter ikke linjerne - årgangslisten regnes ud lokalt", !lyt.some(x => x.startsWith("rangliste|")));
await a.gaaTil("leaderboard");
let r = await a.raekker();
t("trænerens årgangsliste er stadig regnet ud af de rå data - kun fodteknik og stige, ikke Talentmærkets point på spilleren",
  JSON.stringify(r.map(x => x.navn + " " + x.point)) === JSON.stringify(["Oscar Test 11 point", "Bo Test 5 point"]), r);
t("og rangen følger det nye tal: Bo er Debutant, ikke Talent (450)", r.every(x => /Debutant/.test(x.info)), r);
await a.klik("Denne uge");
r = await a.raekker();
t("trænerens uge: kun fodteknik og stige", JSON.stringify(r.map(x => x.navn + " " + x.point)) === JSON.stringify(["Oscar Test 11 point", "Bo Test 5 point"]), r);
await a.klik("All-time");
await a.klik("Hele klubben");
r = await a.raekker();
t("trænerens klub-top-10 er serverens - ikke den gamle tabel",
  JSON.stringify(r.map(x => x.navn + " " + x.point)) === JSON.stringify(["Bo Test 450 point", "Zara Anden 300 point", "Oscar Test 40 point"]), r);
t("med årgang og rang som før", /Talent · 2017/.test(r[0]?.info) && /2014/.test(r[1]?.info), r);
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

a = await aabn("dr", { players: ALLE });
lyt = await a.lyt();
t("en træner, der kun ser drengene, får også kønnet med i forespørgslen",
  lyt.includes("footwork|col||year==2017&gender==dreng") && lyt.includes("juggleLadder|col||year==2017&gender==dreng"), lyt.filter(x => /^(footwork|juggleLadder)\|/.test(x)));
await a.luk();

a = await aabn("admin", { players: ALLE, footwork: FODTEKNIK, clubRanking: GAMMEL_KLUB, klubRangliste: { top: TOP } });
lyt = await a.lyt();
t("admin lytter på hele rangliste og på klubRangliste/top", lyt.includes("rangliste|col||") && lyt.includes("klubRangliste|doc|top|"));
t("og på de hele samlinger som før", ["players", "submissions", "challenges", "footwork", "juggleLadder", "clubRanking"].every(n => lyt.includes(n + "|col||")));
await a.gaaTil("leaderboard");
await a.klik("Hele klubben");
r = await a.raekker();
t("admins klub-top-10 er også serverens", JSON.stringify(r.map(x => x.navn)) === JSON.stringify(["Bo Test", "Zara Anden", "Oscar Test"]), r);
await a.luk();

// ------------------------------------------------------------------ spillerens rangliste
console.log("\nSpillerens rangliste bygges af linjerne");
a = await aabn("sp", { players: OSCAR, rangliste: LINJER, klubRangliste: { top: TOP } });
await a.gaaTil("leaderboard");
await a.klik("All-time");
r = await a.raekker();
t("all-time: årgangens linjer efter samlede point - kun 2017 og kun børn med login (ikke Carl og ikke Demo)",
  JSON.stringify(r.map(x => x.navn + " " + x.point)) === JSON.stringify(["Bo Test 450 point", "Ida Test 160 point", "Oscar Test 40 point", "Kim Test 3 point"]), r);
t("rangen følger det samlede tal", /Talent/.test(r[0].info) && /Klubspiller/.test(r[1].info) && /Debutant/.test(r[2].info), r);
t("spilleren selv er fremhævet", await a.page.evaluate(() => [...document.querySelectorAll("#leaderboardArea .player")].find(x => x.textContent.includes("Oscar"))?.getAttribute("style").includes("ecfdf5")));
await a.klik("Denne uge");
r = await a.raekker();
const pt = navn => r.find(x => x.navn === navn)?.point;
t("denne uge: point fra linjen, når uge-starten er denne mandag", pt("Oscar Test") === "12 point" && pt("Ida Test") === "5 point", r);
t("en gammel uge-start tæller som 0", pt("Bo Test") === "0 point", r);
t("og listen sorteres efter ugens point", r[0].navn === "Oscar Test" && r[1].navn === "Ida Test", r);
t("rangen er stadig den samlede - Bo er Talent, selv med 0 i ugen", /Talent/.test(r.find(x => x.navn === "Bo Test")?.info || ""), r);
await a.klik("Denne måned");
r = await a.raekker();
t("denne måned: point fra linjen, og en gammel måneds-start tæller som 0",
  pt("Oscar Test") === "30 point" && pt("Bo Test") === "20 point" && pt("Ida Test") === "0 point" && pt("Kim Test") === "3 point", r);
await a.klik("Hele klubben");
r = await a.raekker();
t("spillerens klub-top-10 er klubRangliste/top", JSON.stringify(r.map(x => x.navn + " " + x.point)) === JSON.stringify(["Bo Test 450 point", "Zara Anden 300 point", "Oscar Test 40 point"]), r);
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

console.log("\nMånedens spiller ved navnene");
a = await aabn("sp", { players: OSCAR, rangliste: LINJER, klubRangliste: { top: TOP },
  maanedensSpiller: { "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p3", navn: "Ida Test", dage: 9, minutter: 13.5, oevelser: 9, point: 18 }] } } },
  "2026-12-10T12:00:00+01:00");   // novembers kaaring er afgjort
await a.gaaTil("leaderboard");
await a.klik("All-time");
const emblem = await a.page.evaluate(() => [...document.querySelectorAll("#leaderboardArea .player")].filter(x => x.querySelector("svg.emblem")).map(x => x.querySelector("b").textContent.trim()));
t("emblemet står ved novembers vinder på linjerne", emblem.length === 1 && /Ida Test/.test(emblem[0]), emblem);
await a.luk();

console.log("\nMånedens topscorer ved navnene: pokalen og bolden");
const TOPSCORER_NOV = { "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p2", navn: "Bo Test", point: 120, oevelser: 30, svaer: 4, mellem: 3, let: 2, starter: 1 }] } };
const SPILLER_NOV = { "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p3", navn: "Ida Test", dage: 9, minutter: 13.5, oevelser: 9, point: 18 }] } };
// Emblemerne ved hvert navn: navn -> [aria-label, ...] i den orden, de står.
const vedNavne = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#leaderboardArea .player")]
  .map(x => [x.querySelector("b").childNodes[0].textContent.replace(/^\S+\s/, "").trim(), [...x.querySelectorAll("svg.emblem")].map(e => e.getAttribute("aria-label") + "|" + (e.classList.contains("pokal") ? "pokal" : e.classList.contains("bold") ? "bold" : "?"))])
  .filter(([, e]) => e.length)));
a = await aabn("sp", { players: OSCAR, rangliste: LINJER, klubRangliste: { top: TOP }, maanedensSpiller: SPILLER_NOV, maanedensTopscorer: TOPSCORER_NOV }, "2026-12-10T12:00:00+01:00");
await a.gaaTil("leaderboard");
await a.klik("All-time");
t("årgangslisten: pokalen ved Månedens spiller, bolden ved topscoreren - ingen andre", JSON.stringify(await vedNavne(a.page))
  === JSON.stringify({ "Bo Test": ["Månedens topscorer november 2026|bold"], "Ida Test": ["Månedens spiller november 2026|pokal"] }), await vedNavne(a.page));
await a.klik("Hele klubben");
t("klubbens top 10: bolden ved Bo, ingen ved de andre (Ida er ikke i top 10)", JSON.stringify(await vedNavne(a.page))
  === JSON.stringify({ "Bo Test": ["Månedens topscorer november 2026|bold"] }), await vedNavne(a.page));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();
a = await aabn("tr", { players: { p1: { ...OSCAR.p1 }, p2: { name: "Bo Test", year: "2017", gender: "dreng", points: 450, passed: {}, history: [] } }, klubRangliste: { top: TOP },
  footwork: { p2: { year: "2017", gender: "dreng", days: { "2026-11-16": { k: 1 } } } },   // Bo foerst paa listen
  maanedensSpiller: { "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [{ id: "p1", navn: "Oscar Test", dage: 9, minutter: 13.5, oevelser: 9, point: 18 }] } },
  maanedensTopscorer: TOPSCORER_NOV }, "2026-12-10T12:00:00+01:00");
await a.gaaTil("leaderboard");
await a.klik("All-time");
t("trænerens årgangsliste: pokal ved Oscar og bold ved Bo", JSON.stringify(await vedNavne(a.page))
  === JSON.stringify({ "Bo Test": ["Månedens topscorer november 2026|bold"], "Oscar Test": ["Månedens spiller november 2026|pokal"] }), await vedNavne(a.page));
await a.klik("Hele klubben");
t("og i klubbens top 10", JSON.stringify(await vedNavne(a.page))
  === JSON.stringify({ "Bo Test": ["Månedens topscorer november 2026|bold"], "Oscar Test": ["Månedens spiller november 2026|pokal"] }), await vedNavne(a.page));
await a.luk();
a = await aabn("sp", { players: OSCAR, rangliste: LINJER, klubRangliste: { top: TOP }, maanedensSpiller: SPILLER_NOV, maanedensTopscorer: TOPSCORER_NOV }, "2027-01-10T12:00:00+01:00");
await a.gaaTil("leaderboard");
await a.klik("All-time");
t("når december er afgjort, står novembers emblemer ikke længere ved navnene", JSON.stringify(await vedNavne(a.page)) === "{}", await vedNavne(a.page));
await a.luk();

// ------------------------------------------------------------------ duel
console.log("\nDuel: modstanderne findes på linjerne");
a = await aabn("sp", { players: OSCAR, rangliste: LINJER });
await a.gaaTil("challenges");
const valg = await a.page.evaluate(() => [...document.querySelectorAll("#challengeOpponent option")].map(o => o.value + ":" + o.textContent));
t("kun årgangens drenge og børn uden køn, med aktivt login, og ikke en selv",
  JSON.stringify(valg) === JSON.stringify(["p2:Bo Test", "p5:Kim Test"]), valg);
await a.page.selectOption("#challengeOpponent", "p2");
await a.page.evaluate(() => { createChallenge("p1"); }); await a.page.waitForTimeout(300);
const duel = (await a.page.evaluate(() => window.__skrivninger)).find(x => x.navn === "challenges");
t("udfordringen skrives med modstanderens navn fra linjen", duel?.data.opponentId === "p2" && duel?.data.opponentName === "Bo Test"
  && duel?.data.challengerId === "p1" && duel?.data.challengerName === "Oscar Test" && duel?.data.year === "2017" && duel?.data.gender === "dreng", duel?.data);
t("og kvitteringen nævner modstanderen", /Udfordring sendt til Bo Test/.test(await a.dialog() || ""));
t("ingen JS-fejl", a.fejl.length === 0 && a.nativ() === 0, a.fejl);
await a.luk();

a = await aabn("demo", { players: { p9: { name: "Demo Test", year: "2017", gender: "dreng", points: 0, passed: {}, history: [] } }, rangliste: LINJER, klubRangliste: { top: TOP } });
await a.gaaTil("leaderboard");
await a.klik("All-time");
r = await a.raekker();
t("demo: barnet selv står på listen, selvom dets linje siger kanUdfordres false - og de andre er dem med login",
  JSON.stringify(r.map(x => x.navn + " " + x.point)) === JSON.stringify(["Bo Test 450 point", "Ida Test 160 point", "Oscar Test 40 point", "Demo Test 7 point", "Kim Test 3 point"]), r);
t("demo: og er fremhævet", await a.page.evaluate(() => [...document.querySelectorAll("#leaderboardArea .player")].find(x => x.textContent.includes("Demo Test"))?.getAttribute("style").includes("ecfdf5")));
await a.gaaTil("challenges");
await a.page.evaluate(() => { createChallenge("p9"); }); await a.page.waitForTimeout(300);
t("demo-loginnet ser modstanderne, men sender ingenting", /demo-bruger/.test(await a.dialog() || "") && !(await a.page.evaluate(() => window.__skrivninger)).some(x => x.navn === "challenges"));
await a.luk();

console.log("\nDuel: i egne dueller ses modpartens indsendelse");
const afAar = { year: "2017", gender: "dreng" };
a = await aabn("sp", { players: OSCAR, rangliste: LINJER,
  challenges: {
    c1: { type: "freestyle", title: "Flest jongleringer", challengerId: "p2", challengerName: "Bo Test", opponentId: "p1", opponentName: "Oscar Test", ...afAar, status: "active" },
    c2: { type: "freestyle", title: "Fedeste trick", challengerId: "p2", challengerName: "Bo Test", opponentId: "p1", opponentName: "Oscar Test", ...afAar, status: "pending" },
    c3: { type: "freestyle", title: "Andres duel", challengerId: "p2", challengerName: "Bo Test", opponentId: "p4", opponentName: "Carl Test", ...afAar, status: "active" } },
  submissions: {
    "s-oscar": { playerId: "p1", playerName: "Oscar Test", ...afAar, exercise: "Flest jongleringer", status: "pending", challengeId: "c1", challengerId: "p2", opponentId: "p1", submittedAt: new Date(NU).toISOString() },
    "s-bo":    { playerId: "p2", playerName: "Bo Test", ...afAar, exercise: "Flest jongleringer", status: "pending", challengeId: "c1", challengerId: "p2", opponentId: "p1", submittedAt: new Date(NU).toISOString() },
    "s-andre": { playerId: "p2", playerName: "Bo Test", ...afAar, exercise: "Andres duel", status: "pending", challengeId: "c3", challengerId: "p2", opponentId: "p4", submittedAt: new Date(NU).toISOString() } } });
await a.gaaTil("challenges");
const duelTekst = await a.tekst("#challengesArea");
t("Oscar ser, at Bo har uploadet i deres fælles duel", /Bo Test har uploadet/.test(duelTekst), duelTekst);
t("ikke duellen mellem to andre", !/Andres duel/.test(duelTekst));
t("duel-mærket tæller den indkommende udfordring", await a.page.evaluate(() => { const b = document.getElementById("challengeBadge"); return !b.classList.contains("hidden") && b.textContent === "1"; }));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

console.log("\nEt barn, hvis login lige er lukket, ser stadig sig selv");
// Linjen kan sige kanUdfordres false, fx lige efter et Deaktiver - barnet ser sig selv alligevel.
a = await aabn("sp", { players: OSCAR, rangliste: { ...LINJER, p1: { ...LINJER.p1, kanUdfordres: false } } });
await a.gaaTil("leaderboard");
await a.klik("All-time");
r = await a.raekker();
t("Oscar står på sin egen liste, og de andre er børnene med login",
  JSON.stringify(r.map(x => x.navn)) === JSON.stringify(["Bo Test", "Ida Test", "Oscar Test", "Kim Test"]), r);
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

console.log("\nTræneren ser stadig alle børn i årgangen");
a = await aabn("tr", { players: { ...ALLE, p4: { name: "Dan Test", year: "2017", gender: "dreng", points: 0, passed: {}, history: [] } }, footwork: FODTEKNIK, klubRangliste: { top: TOP } });
await a.gaaTil("leaderboard");
r = await a.raekker();
t("også et barn uden login (Dan) står på trænerens årgangsliste", JSON.stringify(r.map(x => x.navn + " " + x.point)) === JSON.stringify(["Oscar Test 11 point", "Bo Test 5 point", "Dan Test 0 point"]), r);
await a.luk();

// ------------------------------------------------------------------ tomme tilstande
console.log("\nFør serveren har regnet");
a = await aabn("sp", { players: OSCAR, footwork: { p1: FODTEKNIK.p1 } });
await a.gaaTil("leaderboard");
t("årgangslisten siger venligt, at den ikke er klar endnu", /ikke klar endnu/.test(await a.tekst("#leaderboardArea")), await a.tekst("#leaderboardArea"));
await a.klik("Hele klubben");
t("og det samme gør klubbens top 10", /Klubbens top 10 er ikke klar endnu/.test(await a.tekst("#leaderboardArea")), await a.tekst("#leaderboardArea"));
await a.gaaTil("challenges");
t("uden linjer er der ingen at udfordre - og det siges", /Ingen andre spillere i din årgang kan udfordres endnu/.test(await a.tekst("#challengesArea")) && !(await a.page.$("#challengeOpponent")));
{
  const profil = await (async () => { await a.gaaTil("profile"); return a.tekst("#profileArea"); })();
  t("profilen virker stadig - point regnes af egne data: fodteknik (11), ikke Talentmærkets 40 på spilleren",
    /(^|\s)11 point · 139 point til/.test(profil) && !/(^|\s)(40|51) point/.test(profil), profil);
}
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();
a = await aabn("tr", { players: ALLE });
await a.gaaTil("leaderboard"); await a.klik("Hele klubben");
t("træneren får samme besked om klubbens top 10", /ikke klar endnu/.test(await a.tekst("#leaderboardArea")));
await a.luk();

// ------------------------------------------------------------------ admin-status
console.log("\nAdmin: Ranglisten på serveren");
// Rå data, som appen selv kan regne paa: p1 har 11 point fra fodteknik i denne uge, 40
// Talentmærke-point paa spilleren og en godkendt video paa 25 point i dag; p2 har 5 point fra
// fodteknik i sidste uge og 10 paa spilleren. Pointreglerne 2026-11-25: spillerens point og
// videoens point taeller ingen steder - de rigtige linjer har kun fodteknikken.
const ADMIN_SPILLERE = { p1: OSCAR.p1,
  p2: { name: "Bo Test", year: "2017", gender: "dreng", points: 10, passed: {}, history: [], hasActiveLogin: true },
  p3: { name: "Carl Test", year: "2016", gender: "dreng", points: 0, passed: {}, history: [] } };   // intet login
const ADMIN_FODTEKNIK = { p1: FODTEKNIK.p1, p2: { year: "2017", gender: "dreng", days: { "2026-11-15": { k: 1 } } } };
const GODKENDT = { "s1": { playerId: "p1", playerName: "Oscar Test", year: "2017", gender: "dreng", status: "approved", reviewedAt: "2026-11-18T09:00:00Z", pointsAwarded: 25 } };
const rigtige = () => ({
  p1: linje("Oscar Test", "2017", "dreng", true, 11, [UGE, 11], [MAANED, 11]),
  p2: linje("Bo Test", "2017", "dreng", true, 5, ["2026-11-09", 7], [MAANED, 5]),   // gammel uge-start, appen har 0 i ugen: stemmer
  p3: linje("Carl Test", "2016", "dreng", false, 0, [UGE, 0], [MAANED, 0])
});
// Klubbens top 10 kun blandt børn med login (v15.86): Carl (p3) er ikke med.
const RIGTIG_TOP = { top: [{ id: "p1", name: "Oscar Test", year: "2017", total: 11 }, { id: "p2", name: "Bo Test", year: "2017", total: 5 }], regler: REGLER };
async function status(linjer, top = RIGTIG_TOP){
  const a = await aabn("admin", { players: ADMIN_SPILLERE, footwork: ADMIN_FODTEKNIK, submissions: GODKENDT, rangliste: linjer, klubRangliste: { top } });
  await a.gaaTil("admin");
  await a.page.evaluate(() => { document.getElementById("adminRangliste").open = true; });
  const s = (await a.tekst("#ranglisteStatusArea")).replace(/\s+/g, " ");
  const maerke = await a.page.evaluate(() => !document.getElementById("ranglisteBadge").classList.contains("hidden"));
  const f = a.fejl; await a.luk();
  return { s, maerke, fejl: f };
}
let st = await status(rigtige());
t("alt ens: tre linjer for tre spillere", /3 linjer på serveren for 3 spillere/.test(st.s), st.s);
t("alt ens: alle linjer stemmer - også uge og måned", /Alle linjer stemmer med appens egen udregning/.test(st.s), st.s);
t("alt ens: alle børn har en linje, og top 10 stemmer", /Alle børn har en linje/.test(st.s) && /Klubbens top 10 stemmer/.test(st.s), st.s);
t("alt ens: ingen advarsel om pointregler og intet mærke", !/andre pointregler/.test(st.s) && !st.maerke, st.s);
t("ingen JS-fejl", st.fejl.length === 0, st.fejl);

let l = rigtige(); l.p2.total = 11;
st = await status(l);
t("én linje afviger: tallet og hvem", /1 linje afviger fra appens egen udregning/.test(st.s) && /Bo Test: i alt 11 på serveren, 5 i appen/.test(st.s) && st.maerke, st.s);
// En linje regnet med de gamle regler (Talentmærkets 40 og videoens 25 talte med) afviger.
l = rigtige(); l.p1.total = 51; l.p1.uge.point = 36; l.p1.maaned.point = 36;
st = await status(l);
t("en linje med Talentmærkets og videoens point (de gamle regler) afviger i alt, uge og måned",
  /Oscar Test: i alt 51 på serveren, 11 i appen · denne uge 36 på serveren, 11 i appen · denne måned 36 på serveren, 11 i appen/.test(st.s), st.s);
st = await status(rigtige(), { top: [{ ...RIGTIG_TOP.top[0], total: 51 }, { ...RIGTIG_TOP.top[1], total: 15 }], regler: REGLER });
t("og en top 10 med de gamle tal (51, 15) opdages", /Klubbens top 10 afviger/.test(st.s), st.s);
l = rigtige(); l.p1.uge.point = 20;
st = await status(l);
t("en afvigelse i ugens point tæller også", /1 linje afviger/.test(st.s) && /Oscar Test: denne uge 20 på serveren, 11 i appen/.test(st.s), st.s);
l = rigtige(); l.p1.uge.fra = "2026-11-09";
st = await status(l);
t("en gammel uge-start, mens appen har point i ugen, er en afvigelse - spilleren ville se 0", /Oscar Test: denne uge 0 på serveren, 11 i appen/.test(st.s), st.s);
l = rigtige(); delete l.p3;
st = await status(l);
t("et barn mangler en linje: tallet og navnet", /1 barn mangler en linje: Carl Test/.test(st.s) && /2 linjer på serveren for 3 spillere/.test(st.s) && st.maerke, st.s);
l = rigtige(); l.p2.regler = "2026-01-01";
st = await status(l);
t("forkerte pointregler giver en tydelig advarsel", /Serveren regner med andre pointregler end appen – rul funktionerne ud og genberegn/.test(st.s) && /1 linje har ikke pointreglerne fra/.test(st.s), st.s);
st = await status(rigtige(), { top: [RIGTIG_TOP.top[1], RIGTIG_TOP.top[0]], regler: REGLER });
t("en top 10 i forkert rækkefølge opdages", /Klubbens top 10 afviger/.test(st.s), st.s);
st = await status(rigtige(), { top: [...RIGTIG_TOP.top, { id: "p3", name: "Carl Test", year: "2016", total: 0 }], regler: REGLER });
t("en top 10 med et barn uden login (som før v15.86) afviger - admin-kortet bruger serverens filter", /Klubbens top 10 afviger/.test(st.s) && st.maerke, st.s);
l = rigtige(); l.p3.kanUdfordres = true;
st = await status(l);
t("en linje, der siger login, når barnet intet har, afviger - spillerne ville se barnet", /1 linje afviger/.test(st.s) && /Carl Test: login ja på serveren, nej i appen/.test(st.s) && st.maerke, st.s);
l = rigtige(); l.p2.kanUdfordres = false;
st = await status(l);
t("og omvendt: en linje uden login for et barn med login", /Bo Test: login nej på serveren, ja i appen/.test(st.s), st.s);
l = rigtige(); l.x7 = linje("Slettet Test", "2017", "dreng", false, 0, [UGE, 0], [MAANED, 0]);
st = await status(l);
t("en linje uden barn nævnes", /1 linje hører til et barn, der ikke findes længere/.test(st.s), st.s);

// ------------------------------------------------------------------ databehandling
console.log("\nDatabehandlingsteksten");
a = await aabn("sp", { players: OSCAR });
await a.page.evaluate(() => { openPrivacy(); }); await a.page.waitForTimeout(200);
const priv = (await a.tekst("#privacy")).replace(/\s+/g, " ");
t("spillerens række siger, at andre børn kun ses på ranglisten", /Om de andre på sit eget hold \(samme årgang - og samme køn, når login'et er oprettet til drenge eller piger\): kun ranglisten/.test(priv), priv.slice(0, 200));
t("og at træningsdage, øvelser, Talentmærket, medaljer og logge ikke kan hentes", /Ikke andre børns træningsdage, øvelser, fremdrift i Talentmærket/.test(priv) && /medaljer, logge/.test(priv));
t("den gamle 'kendte svaghed' er væk", !/Skærmen viser mindre, end der hentes/.test(priv) && !/kendt svaghed/.test(priv));
t("spillerens række: andre familier ser kun børn med eget login, og børn uden login vises ikke", /Andre familier ser kun de børn, der selv har et login til appen; børn uden login vises ikke for andre familier på ranglisten/.test(priv)
  && /klubbens top 10 med navn, årgang og point - også den kun blandt børn med eget login/.test(priv), priv.slice(0, 600));
t("ranglisteafsnittet siger det samme - og at trænerne stadig ser alle", /Andre familier ser kun linjerne for de børn, der selv har et login til appen; har dit barn intet login, vises det ikke for andre familier - hverken på årgangens rangliste eller i klubbens top 10\. Trænerne i årgangen ser stadig alle børn\./.test(priv));
t("serverfunktionerne og deres placering er nævnt - også oprydningen", /serverfunktioner hos Google \(Cloud Functions\) i Belgien \(europe-west1\) regner ranglisten ud/i.test(priv)
  && /rydder op i videoer og joker-begrundelser/.test(priv));
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
