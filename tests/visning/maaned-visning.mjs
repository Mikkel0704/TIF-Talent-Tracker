// Månedens spiller og Månedens topscorer på skærmen: kortet på ranglisten, emblemerne
// (pokalen og bolden) på profilen og ved navnet, og forklaringerne. Uret stilles, så både
// "før første kåring" og "efter" kan ses.
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
const top = (id, navn, point, oevelser) => ({ id, navn, point, oevelser, svaer: 3, mellem: 2, let: 1, starter: 0 });
const TOPSCORERE = {
  "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [top("p4", "Bo Test", 190, 23)] },
  "2026-12_2017": { maaned: "2026-12", aargang: "2017", vindere: [top("p2", "Ida Test", 75, 1)] },
  "2026-12_2016": { maaned: "2026-12", aargang: "2016", vindere: [] }
};
async function aabn(uid, tid, kaaringer = KAARINGER, topscorere = TOPSCORERE){
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
    // Spillerens rangliste bygges af serverens linjer - uden dem er der ingen navne at sætte emblemer ved.
    rangliste: Object.fromEntries([["p1", "Oscar Test", "dreng"], ["p2", "Ida Test", "pige"], ["p4", "Bo Test", "dreng"]].map(([id, name, gender]) =>
      [id, { name, year: "2017", gender, kanUdfordres: true, total: 0, uge: { fra: "2000-01-03", point: 0 }, maaned: { fra: "2000-01-01", point: 0 }, regler: "x" }])),
    maanedensSpiller: kaaringer, maanedensTopscorer: topscorere };
  await page.addInitScript(([d, br, pv]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} },
    [db, { uid, email: db.users[uid].email }, PV]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const gaaTil = async id => { await page.click("#tab-" + id); await page.waitForTimeout(200); };
  const tekst = s => page.evaluate(x => document.querySelector(x)?.innerText || "", s);
  // Emblemerne i et område: deres navn (aria-label) og størrelse.
  const emblemer = s => page.evaluate(x => [...document.querySelectorAll(x + " svg.emblem")].map(e => e.getAttribute("aria-label") + "|" + ["lille", "mellem"].find(c => e.classList.contains(c))), s);
  // Emblemer ved et bestemt navn på ranglisten.
  const vedNavn = navn => page.evaluate(n => [...document.querySelectorAll("#leaderboardArea .player")].filter(r => r.querySelector("b")?.textContent.includes(n))
    .flatMap(r => [...r.querySelectorAll("svg.emblem")].map(e => e.getAttribute("aria-label"))), navn);
  return { page, fejl, gaaTil, tekst, emblemer, vedNavn, luk: () => ctx.close() };
}

console.log("\nFør den første kåring (20. november)");
let a = await aabn("ida", "2026-11-20T12:00:00+01:00", {}, {});
await a.gaaTil("leaderboard");
let kort = await a.tekst("#maanedensArea");
t("kortet står øverst på ranglisten", /Månedens spiller/.test(kort));
t("og siger, hvornår den første kåres", /første Månedens spiller kåres 5\. december for november 2026/.test(kort), kort);
t("og at Månedens topscorer kåres samme dag", /Månedens topscorer kåres samme dag/.test(kort), kort);
t("og siger det kun én gang - ingen 'Næste kåring' før den første", !/Næste kåring/.test(kort), kort);
t("forklaringen ligger klar til at folde ud", await a.page.evaluate(() => !!document.querySelector("#maanedensArea details.maanedforklaring")));
await a.page.click("#maanedensArea .maanedforklaring summary"); await a.page.waitForTimeout(100);
kort = await a.tekst("#maanedensArea");
t("forklaringen nævner flest dage, tid, øvelser, point, deling og 'ikke to i træk'",
  /flest dage/.test(kort) && /længst tid/.test(kort) && /flest øvelser/.test(kort) && /flest point/.test(kort) && /deler I prisen/.test(kort) && /to måneder i træk/.test(kort), kort);
t("topscorerens forklaring ligger ved siden af, foldet sammen", await a.page.evaluate(() => {
  const d = document.querySelector('#maanedensArea details.maanedforklaring[data-forklaring="topscorer"]');
  return !!d && !d.open && d.querySelector("summary").textContent === "Sådan bliver man Månedens topscorer"; }));
await a.page.click('#maanedensArea .maanedforklaring[data-forklaring="topscorer"] summary'); await a.page.waitForTimeout(100);
const forkl = (await a.tekst('#maanedensArea .maanedforklaring[data-forklaring="topscorer"]')).replace(/\n/g, " ");
t("topscorer: flest point i måneden - alle point, fodteknik, stigen og medaljer i den måned, træneren godkender dem",
  /flest point i måneden/.test(forkl) && /Alle point tæller: fodteknik, Jongleringsstigen og medaljer/.test(forkl) && /i den måned, træneren godkender den/.test(forkl), forkl);
t("topscorer: ved lige point flest øvelser, så flest svære, mellem, lette og starter",
  /lige mange point, vinder den, der har lavet flest øvelser/.test(forkl) && /flest svære øvelser \(grundtræning tæller som svær\)\. Så flest mellem, så flest lette og til sidst flest starter/.test(forkl), forkl);
t("topscorer: ikke både Månedens spiller og topscorer - nr. 1 i begge bliver Månedens spiller",
  /ikke både være Månedens spiller og topscorer/.test(forkl) && /nr\. 1 i begge, bliver du Månedens spiller/.test(forkl), forkl);
t("topscorer: godt flere måneder i træk, og findes den 5. i næste måned",
  /godt være topscorer flere måneder i træk/.test(forkl) && /findes den 5\. i den næste måned/.test(forkl) && /deler I prisen/.test(forkl), forkl);
await a.page.evaluate(() => renderLeaderboard()); await a.page.waitForTimeout(100);
t("en åben forklaring bliver åben, når kortet tegnes igen - og den anden lukket",
  await a.page.evaluate(() => [...document.querySelectorAll("#maanedensArea details.maanedforklaring")].map(d => d.dataset.forklaring + ":" + d.open).join()) === "spiller:true,topscorer:true");
await a.luk();

console.log("\nIda vandt november - hun ser det 10. december");
a = await aabn("ida", "2026-12-10T12:00:00+01:00");
await a.gaaTil("leaderboard");
kort = await a.tekst("#maanedensArea");
t("kortet viser november 2026", /November 2026/.test(kort), kort);
t("med Ida som vinder og hendes tal", /Ida Test/.test(kort) && /12 træningsdage · 18 min/.test(kort), kort);
let em = await a.emblemer("#maanedensArea");
t("kortet har pokal og bold i overskriften, novembers pokal ved Månedens spiller og novembers bold ved topscoreren",
  JSON.stringify(em) === JSON.stringify(["Månedens spiller|lille", "Månedens topscorer|lille", "Månedens spiller november 2026|mellem", "Månedens topscorer november 2026|mellem"]), em);
t("Månedens spillers emblem er nu en pokal (ikke medaljen): guldpokal med bordeaux stjerne og bordeaux sokkel med måned og år", await a.page.evaluate(() => {
  const e = document.querySelector("#maanedensArea .maanedrad.spiller svg.emblem.mellem");
  return e?.classList.contains("pokal") && e.querySelector("text")?.textContent === "NOV 2026" && e.querySelector("polygon")?.getAttribute("fill") === "#6d1b3a"
    && e.querySelector("rect.sokkel")?.getAttribute("fill") === "#6d1b3a" && e.querySelectorAll("circle").length === 0
    && e.querySelector("title")?.textContent === "Månedens spiller november 2026"; }));
t("topscorerens emblem er en sort-hvid bold med fartstriber, 1-tal i en bordeaux ring og måneden på en strimmel", await a.page.evaluate(() => {
  const e = document.querySelector("#maanedensArea .maanedrad.topscorer svg.emblem.mellem");
  const tekster = [...(e?.querySelectorAll("text") || [])].map(x => x.textContent);
  return e?.classList.contains("bold") && JSON.stringify(tekster) === '["1","NOV 2026"]' && e.querySelector("circle.ring")?.getAttribute("fill") === "#6d1b3a"
    && e.querySelectorAll("line").length >= 3 && e.querySelectorAll("radialGradient").length === 2
    && e.querySelector("title")?.textContent === "Månedens topscorer november 2026"; }));
t("hvert emblem på siden har sine egne gradient- og klip-id'er, og hver henvisning peger på sit eget SVG", await a.page.evaluate(() => {
  const ider = [...document.querySelectorAll("svg.emblem [id]")].map(x => x.id);
  const egne = [...document.querySelectorAll("svg.emblem")].every(svg => [...svg.querySelectorAll("[fill^='url(#'], [clip-path^='url(#']")]
    .every(x => { const id = /url\(#([^)]+)\)/.exec(x.getAttribute("fill") || x.getAttribute("clip-path"))[1]; return svg.querySelector("#" + id) !== null; }));
  return ider.length >= 6 && new Set(ider).size === ider.length && egne; }));
t("pokalen er større end bolden i begge størrelser", await a.page.evaluate(() => {
  const str = s => { const r = document.querySelector("#maanedensArea " + s).getBoundingClientRect(); return [r.width, r.height]; };
  const [pl, bl, pm, bm] = [str("svg.pokal.lille"), str("svg.bold.lille"), str("svg.pokal.mellem"), str("svg.bold.mellem")];
  return pl[0] > bl[0] && pl[1] > bl[1] && pm[0] > bm[0] && pm[1] > bm[1]; }));
t("i lille størrelse står måneden ikke på emblemerne", await a.page.evaluate(() =>
  [...document.querySelectorAll("#maanedensArea svg.emblem.lille text")].every(x => x.textContent === "1")));
t("topscoreren og tallene, der afgjorde det: point og antal øvelser", /Bo Test/.test(kort) && /Månedens topscorer · 190 point · 23 øvelser/.test(kort), kort);
t("og siger, at det er hende", /det er dig!/.test(kort));
t("og hvornår næste kåring er", /Næste kåring: 5\. januar for december 2026/.test(kort), kort);
const liste = await a.tekst("#leaderboardArea");
t("emblemet står ved hendes navn på ranglisten", JSON.stringify(await a.vedNavn("Ida Test")) === '["Månedens spiller november 2026"]', await a.vedNavn("Ida Test"));
t("bolden står ved novembers topscorer", JSON.stringify(await a.vedNavn("Bo Test")) === '["Månedens topscorer november 2026"]', await a.vedNavn("Bo Test"));
t("og ingen af dem ved Oscar, som intet vandt", (await a.vedNavn("Oscar Test")).length === 0);
t("ved navnet er pokalen større end bolden", await a.page.evaluate(() => {
  const r = s => document.querySelector("#leaderboardArea " + s)?.getBoundingClientRect().height || 0; return r("svg.pokal.lille") > r("svg.bold.lille") && r("svg.bold.lille") > 0; }));
await a.gaaTil("profile");
let profil = await a.tekst("#profileArea");
em = await a.emblemer("#profileArea");
t("profilen viser emblemet med måned og år", /Månedens spiller/.test(profil) && /November 2026/.test(profil) && /12 træningsdage · 18 min/.test(profil)
  && em.includes("Månedens spiller november 2026|mellem"), [profil.slice(0, 200), em]);
t("profilen viser også topscorer-prisen med point og øvelser (her en december-post, der allerede ligger i data)",
  /Månedens topscorer · 75 point · 1 øvelse/.test(profil) && em.includes("Månedens topscorer december 2026|mellem"), [profil.slice(0, 400), em]);
t("profilen viser alle priser, nyeste først", JSON.stringify(em.filter(x => /\|mellem$/.test(x))) === JSON.stringify(["Månedens topscorer december 2026|mellem", "Månedens spiller november 2026|mellem"]), em);
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

console.log("\nDecember er delt (10. januar)");
a = await aabn("oscar", "2027-01-10T12:00:00+01:00");
await a.gaaTil("leaderboard");
kort = await a.tekst("#maanedensArea");
t("december viser begge vindere og at de deler", /Oscar Test og Bo Test/.test(kort) && /deler prisen/.test(kort)
  && (await a.emblemer("#maanedensArea")).includes("Månedens spiller december 2026|mellem"), kort);
t("og decembers topscorer: Ida, som vandt Månedens spiller i november - det må man godt", /Ida Test/.test(kort) && /Månedens topscorer · 75 point · 1 øvelse\b/.test(kort)
  && (await a.emblemer("#maanedensArea")).includes("Månedens topscorer december 2026|mellem"), kort);
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
t("men på ranglisten er pokalen nu hos decembers vindere - og Ida har decembers bold",
  JSON.stringify(await a.vedNavn("Ida Test")) === '["Månedens topscorer december 2026"]' && JSON.stringify(await a.vedNavn("Oscar Test")) === '["Månedens spiller december 2026"]'
  && (await a.vedNavn("Bo Test")).join() === "Månedens spiller december 2026", [await a.vedNavn("Ida Test"), await a.vedNavn("Bo Test")]);
await a.luk();

console.log("\nTræneren");
a = await aabn("tr", "2027-01-10T12:00:00+01:00");
await a.gaaTil("leaderboard");
kort = await a.tekst("#maanedensArea");
t("ser hver af sine årgange", /2017: Oscar Test og Bo Test/.test(kort.replace(/\n/g, " ")) && /2016: Ingen vinder i december 2026/.test(kort.replace(/\n/g, " ")), kort);
t("og en topscorer-post uden vinder siger det", /2016: Ingen topscorer i december 2026/.test(kort.replace(/\n/g, " ")), kort);
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
a = await aabn("ida", "2026-12-10T12:00:00+01:00", KAARINGER, {});
await a.gaaTil("leaderboard");
kort = await a.tekst("#maanedensArea");
t("er Månedens spiller kåret, men topscoreren ikke endnu, siger topscorer-rækken det", /Ida Test/.test(kort) && /Månedens topscorer: Kåres automatisk kl\. 5 om morgenen/.test(kort), kort);
t("og der er ingen bold ved noget navn", await a.page.evaluate(() => document.querySelectorAll("#leaderboardArea svg.bold").length === 0));
await a.gaaTil("profile");
t("Idas profil har kun pokalen", JSON.stringify((await a.emblemer("#profileArea")).filter(x => /\|mellem$/.test(x))) === '["Månedens spiller november 2026|mellem"]');
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();
a = await aabn("oscar", "2026-12-10T12:00:00+01:00", {}, {});
await a.gaaTil("profile");
t("en spiller uden priser får at vide, hvordan man vinder", /Ingen endnu\. Træn fodteknik mange dage i en måned, eller saml flest point/.test(await a.tekst("#profileArea")));
await a.luk();

console.log("\nSikkerhed og tekster");
a = await aabn("ida", "2026-12-10T12:00:00+01:00", { "2026-11_2017": { maaned: "2026-11", aargang: "2017",
  vindere: [{ id: "p2", navn: '<img src=x onerror="window.__hacket=1">', dage: 1, minutter: 1.5, oevelser: 1, point: 2 }] } },
  { "2026-11_2017": { maaned: "2026-11", aargang: "2017", vindere: [top("p1", '<img src=x onerror="window.__hacket2=1">', 5, 1)] } });
await a.gaaTil("leaderboard");
t("et navn med HTML bliver vist som tekst, ikke kørt - også topscorerens", !(await a.page.evaluate(() => window.__hacket || window.__hacket2))
  && (await a.page.evaluate(() => document.querySelectorAll("#maanedensArea img").length)) === 0
  && /<img src=x onerror="window.__hacket2=1">/.test(await a.tekst("#maanedensArea")));
await a.gaaTil("guide");
t("Guides forklarer Månedens spiller", /"Månedens spiller":.*flest dage/.test((await a.tekst("#guide")).replace(/\n/g, " ")));
t("og Månedens topscorer", /"Månedens topscorer":.*flest point i måneden/.test((await a.tekst("#guide")).replace(/\n/g, " ")));
await a.page.evaluate(() => openPrivacy()); await a.page.waitForTimeout(200);
const priv = await a.page.evaluate(() => document.getElementById("privacy")?.innerText || "");
t("databehandlingsteksten siger, hvad der gemmes", /Om Månedens spiller:.*Kun vinderne gemmes/.test(priv.replace(/\n/g, " ")));
t("også for Månedens topscorer", /Om Månedens topscorer:.*Kun vinderne gemmes: navn, årgang og de tal, der afgjorde det \(point, antal øvelser/.test(priv.replace(/\n/g, " ")));
t("og nævner topscoreren, hvor Månedens spiller nævnes: hvem ser hvad, serveren, opbevaring og sletning",
  /hvem der er Månedens spiller og Månedens topscorer/.test(priv) && /klubbens top 10, Månedens spiller og Månedens topscorer/.test(priv)
  && /kårer Månedens spiller og Månedens topscorer den 5\./.test(priv) && /kåringer som Månedens spiller og Månedens topscorer har i dag ingen fast slettefrist/.test(priv)
  && /barnet fjernes fra begge slags kåringer/.test(priv));
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
