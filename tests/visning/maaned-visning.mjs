// Månedens spiller på skærmen: kortet på ranglisten, emblemerne på profilen og ved navnet,
// og forklaringen. Uret stilles, så både "før første kåring" og "efter" kan ses.
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
const vinder = (id, navn, dage, minutter) => ({ id, navn, dage, minutter, oevelser: dage, point: dage * 2 });
const KAARINGER = {
  "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [vinder("p2", "Ida Test", 12, 18)] },
  "2026-12_2017": { maaned: "2026-12", aargang: "2017", vindere: [vinder("p1", "Oscar Test", 9, 13.5), vinder("p4", "Bo Test", 9, 13.5)] },
  "2026-12_2016": { maaned: "2026-12", aargang: "2016", vindere: [] }
};
async function aabn(uid, tid, kaaringer = KAARINGER){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "Europe/Copenhagen" });
  const page = await ctx.newPage(); const fejl = [];
  page.on("pageerror", e => fejl.push(e.message));
  await page.clock.setFixedTime(new Date(tid));
  await page.route("**/*", r => { const u = r.request().url();
    if (u === "https://app.test/") return r.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return r.fulfill({ contentType: "application/javascript", body: sted });
    return r.abort(); });
  const db = {
    users: { ida: { email: "i@x.invalid", role: "player", playerId: "p2", years: ["2017"], ...ok_ },
             oscar: { email: "o@x.invalid", role: "player", playerId: "p1", years: ["2017"], ...ok_ },
             tr: { email: "t@x.invalid", role: "coach", years: ["2017", "2016"], ...ok_ },
             dr: { email: "d@x.invalid", role: "coach", years: ["2017"], yearGenders: { "2017": "dreng" }, ...ok_ } },
    players: { p1: { name: "Oscar Test", year: "2017", gender: "dreng", points: 0, passed: {}, history: [] },
               p2: { name: "Ida Test", year: "2017", gender: "pige", points: 0, passed: {}, history: [] },
               p4: { name: "Bo Test", year: "2017", gender: "dreng", points: 0, passed: {}, history: [] },
               p3: { name: "Carl Test", year: "2016", gender: "dreng", points: 0, passed: {}, history: [] } },
    maanedensSpiller: kaaringer };
  await page.addInitScript(([d, br, pv]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} },
    [db, { uid, email: db.users[uid].email }, PV]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const gaaTil = async id => { await page.click("#tab-" + id); await page.waitForTimeout(200); };
  const tekst = s => page.evaluate(x => document.querySelector(x)?.innerText || "", s);
  // Emblemerne i et område: deres navn (aria-label) og størrelse.
  const emblemer = s => page.evaluate(x => [...document.querySelectorAll(x + " svg.emblem")].map(e => e.getAttribute("aria-label") + "|" + [...e.classList].find(c => c !== "emblem")), s);
  // Emblemer ved et bestemt navn på ranglisten.
  const vedNavn = navn => page.evaluate(n => [...document.querySelectorAll("#leaderboardArea .player")].filter(r => r.querySelector("b")?.textContent.includes(n))
    .flatMap(r => [...r.querySelectorAll("svg.emblem")].map(e => e.getAttribute("aria-label"))), navn);
  return { page, fejl, gaaTil, tekst, emblemer, vedNavn, luk: () => ctx.close() };
}

console.log("\nFør den første kåring (20. november)");
let a = await aabn("ida", "2026-11-20T12:00:00+01:00", {});
await a.gaaTil("leaderboard");
let kort = await a.tekst("#maanedensArea");
t("kortet står øverst på ranglisten", /Månedens spiller/.test(kort));
t("og siger, hvornår den første kåres", /første Månedens spiller kåres 5\. december for november 2026/.test(kort), kort);
t("og siger det kun én gang - ingen 'Næste kåring' før den første", !/Næste kåring/.test(kort), kort);
t("forklaringen ligger klar til at folde ud", await a.page.evaluate(() => !!document.querySelector("#maanedensArea details.maanedforklaring")));
await a.page.click("#maanedensArea .maanedforklaring summary"); await a.page.waitForTimeout(100);
kort = await a.tekst("#maanedensArea");
t("forklaringen nævner flest dage, tid, øvelser, point, deling og 'ikke to i træk'",
  /flest dage/.test(kort) && /længst tid/.test(kort) && /flest øvelser/.test(kort) && /flest point/.test(kort) && /deler I prisen/.test(kort) && /to måneder i træk/.test(kort), kort);
await a.luk();

console.log("\nIda vandt november - hun ser det 10. december");
a = await aabn("ida", "2026-12-10T12:00:00+01:00");
await a.gaaTil("leaderboard");
kort = await a.tekst("#maanedensArea");
t("kortet viser november 2026", /November 2026/.test(kort), kort);
t("med Ida som vinder og hendes tal", /Ida Test/.test(kort) && /12 træningsdage · 18 min/.test(kort), kort);
let em = await a.emblemer("#maanedensArea");
t("kortet har det lille emblem i overskriften og novembers emblem ved vinderen",
  JSON.stringify(em) === JSON.stringify(["Månedens spiller|lille", "Månedens spiller november 2026|mellem"]), em);
t("emblemet har måned og år på sig og to bordeaux bånd", await a.page.evaluate(() => {
  const e = document.querySelector("#maanedensArea svg.emblem.mellem");
  return e?.querySelector("text")?.textContent === "NOV 2026" && [...e.querySelectorAll("polygon")].slice(0, 2).every(p => p.getAttribute("fill") === "#6d1b3a"); }));
t("og siger, at det er hende", /det er dig!/.test(kort));
t("og hvornår næste kåring er", /Næste kåring: 5\. januar for december 2026/.test(kort), kort);
const liste = await a.tekst("#leaderboardArea");
t("emblemet står ved hendes navn på ranglisten", JSON.stringify(await a.vedNavn("Ida Test")) === '["Månedens spiller november 2026"]', await a.vedNavn("Ida Test"));
t("og ikke ved de andre", (await a.vedNavn("Oscar Test")).length === 0 && (await a.vedNavn("Bo Test")).length === 0);
await a.gaaTil("profile");
let profil = await a.tekst("#profileArea");
em = await a.emblemer("#profileArea");
t("profilen viser emblemet med måned og år", /Månedens spiller/.test(profil) && /November 2026/.test(profil) && /12 træningsdage · 18 min/.test(profil)
  && em.includes("Månedens spiller november 2026|mellem"), [profil.slice(0, 200), em]);
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

console.log("\nDecember er delt (10. januar)");
a = await aabn("oscar", "2027-01-10T12:00:00+01:00");
await a.gaaTil("leaderboard");
kort = await a.tekst("#maanedensArea");
t("december viser begge vindere og at de deler", /Oscar Test og Bo Test/.test(kort) && /deler prisen/.test(kort)
  && (await a.emblemer("#maanedensArea")).includes("Månedens spiller december 2026|mellem"), kort);
await a.gaaTil("profile");
profil = await a.tekst("#profileArea");
t("Oscars profil viser december som delt", /December 2026/.test(profil) && /9 træningsdage · 13,5 min · delt/.test(profil)
  && (await a.emblemer("#profileArea")).includes("Månedens spiller december 2026|mellem"), profil);
t("og ikke november, som han ikke vandt", !/November 2026/.test(profil) && !(await a.emblemer("#profileArea")).some(x => /november/.test(x)));
await a.luk();
a = await aabn("ida", "2027-01-10T12:00:00+01:00");
await a.gaaTil("profile");
t("Idas profil har stadig november - emblemerne bliver", (await a.emblemer("#profileArea")).includes("Månedens spiller november 2026|mellem"));
await a.gaaTil("leaderboard");
t("men på ranglisten er emblemet nu hos decembers vindere", (await a.vedNavn("Ida Test")).length === 0 && JSON.stringify(await a.vedNavn("Oscar Test")) === '["Månedens spiller december 2026"]');
await a.luk();

console.log("\nTræneren");
a = await aabn("tr", "2027-01-10T12:00:00+01:00");
await a.gaaTil("leaderboard");
kort = await a.tekst("#maanedensArea");
t("ser hver af sine årgange", /2017: Oscar Test og Bo Test/.test(kort.replace(/\n/g, " ")) && /2016: Ingen vinder i december 2026/.test(kort.replace(/\n/g, " ")), kort);
await a.page.selectOption("#leaderboardYear", "2016"); await a.page.waitForTimeout(250);
kort = await a.tekst("#maanedensArea");
t("vælger træneren en årgang, viser kortet kun den", /Ingen vinder/.test(kort) && !/Oscar/.test(kort), kort);
t("træneren ser emblemerne på en spillers profil", await (async () => {
  await a.page.evaluate(() => openPlayerProfile("p2")); await a.page.waitForTimeout(250);
  return (await a.emblemer("#profileArea")).includes("Månedens spiller november 2026|mellem"); })());
await a.luk();
a = await aabn("dr", "2027-01-10T12:00:00+01:00", { "2026-11_2017": KAARINGER["2026-11_2017"] });
await a.gaaTil("leaderboard");
t("mangler en kåring, siger kortet hvem der kårer", /Kåres af admin eller en træner, der ser hele årgangen/.test(await a.tekst("#maanedensArea")));
await a.luk();

console.log("\nSikkerhed og tekster");
a = await aabn("ida", "2026-12-10T12:00:00+01:00", { "2026-11_2017": { maaned: "2026-11", aargang: "2017",
  vindere: [{ id: "p2", navn: '<img src=x onerror="window.__hacket=1">', dage: 1, minutter: 1.5, oevelser: 1, point: 2 }] } });
await a.gaaTil("leaderboard");
t("et navn med HTML i bliver vist som tekst, ikke kørt", !(await a.page.evaluate(() => window.__hacket)) && (await a.page.evaluate(() => document.querySelectorAll("#maanedensArea img").length)) === 0);
await a.gaaTil("guide");
t("Guides forklarer Månedens spiller", /"Månedens spiller":.*flest dage/.test((await a.tekst("#guide")).replace(/\n/g, " ")));
await a.page.evaluate(() => openPrivacy()); await a.page.waitForTimeout(200);
const priv = await a.page.evaluate(() => document.getElementById("privacy")?.innerText || "");
t("databehandlingsteksten siger, hvad der gemmes", /Om Månedens spiller:.*Kun vinderne gemmes/.test(priv.replace(/\n/g, " ")));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
