// HELE appen, startet for alvor. index.html koeres uaendret; kun Firebase er skiftet
// ud med en efterligning i hukommelsen (stoette/firebase-stedfortraeder.js). Det er den
// eneste test, der fanger en fejl, som foerst viser sig, naar alle delene moedes:
// en tegnefunktion der kaster, en knap der peger paa en funktion der ikke findes, en
// dialog der aldrig faar svar. Regler haandhaeves ikke her - det goer tests/regler.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const stedfortraeder = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PRIVACY = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];

const iso = n => { const d = new Date(); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: new Date().toISOString(), privacyVersion: PRIVACY };
const data = () => ({
  users: {
    "u-spiller": { email: "spiller@x.invalid", role: "player", playerId: "p1", years: ["2017"], ...ok_ },
    "u-demo":    { email: "demo@x.invalid",    role: "player", playerId: "p9", years: ["2017"], demo: true, ...ok_ },
    "u-traener": { email: "traener@x.invalid", role: "coach",  years: ["2017"], ...ok_ },
    "u-admin":   { email: "admin@x.invalid",   role: "admin",  years: ["2017", "2014"], ...ok_ }
  },
  players: {
    p1: { name: "Oscar Test", year: "2017", gender: "dreng", points: 40, passed: {}, history: [] },
    p2: { name: "Bo Test",    year: "2017", gender: "dreng", points: 10, passed: {}, history: [] },
    p9: { name: "Demo Test",  year: "2017", gender: "dreng", points: 0,  passed: {}, history: [] },
    p3: { name: "Carl Test",  year: "2014", gender: "dreng", points: 0,  passed: {}, history: [] }
  },
  footwork: { p2: { year: "2017", gender: "dreng", days: { [iso(-2)]: { t: 1 } }, jokerRequests: { [iso(-1)]: true } } },
  footworkLog: { p2: { year: "2017", gender: "dreng", entries: [], reasons: { [iso(-1)]: { tekst: "syg", at: new Date().toISOString() } } } },
  clubRanking: { p1: { name: "Oscar Test", year: "2017", points: 40 }, p2: { name: "Bo Test", year: "2017", points: 10 } }
});

const browser = await chromium.launch();
let ok = 0, fejlet = 0;
const t = (n, b) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n)); };

async function start(uid){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const fejl = []; let nativ = 0;
  page.on("pageerror", e => fejl.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) fejl.push(m.text()); });
  page.on("dialog", async d => { nativ++; await d.dismiss(); });
  await page.route("**/*", route => {
    const u = route.request().url();
    if (u === "https://app.test/") return route.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return route.fulfill({ contentType: "application/javascript", body: stedfortraeder });
    return route.abort();
  });
  const d = data();
  await page.addInitScript(([db, bruger, privacy]) => {
    window.__db = db; window.__bruger = bruger; window.__skrivninger = [];
    try { sessionStorage.setItem("tif-demo-consent-seen", privacy); } catch {}
  }, [d, { uid, email: d.users[uid].email }, PRIVACY]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const faner = () => page.evaluate(() => [...document.querySelectorAll("#mainNav button")].filter(b => !b.classList.contains("hidden")).map(b => b.id.replace("tab-", "")));
  const gaaTil = async id => { await page.click("#tab-" + id); await page.waitForTimeout(120); };
  const skrivninger = () => page.evaluate(() => window.__skrivninger);
  const dialogTekst = () => page.evaluate(() => { const d = document.getElementById("appDialog");
    return d && !d.classList.contains("hidden") ? document.getElementById("dialogTekst").textContent : null; });
  const svar = async ja => { await page.click(ja ? "#dialogJa" : "#dialogNej"); await page.waitForTimeout(250); };
  return { page, fejl, nativ: () => nativ, faner, gaaTil, skrivninger, dialogTekst, svar, luk: () => ctx.close() };
}
async function rundtur(a, navn){
  const faner = await a.faner();
  for (const id of faner) await a.gaaTil(id);
  t(`${navn}: alle ${faner.length} faner åbner uden fejl`, a.fejl.length === 0);
  if (a.fejl.length) console.log("     " + [...new Set(a.fejl)].slice(0, 4).join("\n     "));
  return faner;
}

// ------------------------------------------------------------------ spiller
console.log("\nHele appen · spiller");
let a = await start("u-spiller");
let faner = await rundtur(a, "spiller");
t("spilleren ser sine fire træningsfaner", ["training", "footwork", "juggle", "challenges"].every(f => faner.includes(f)));
t("og ingen trænerfaner", !["players", "track", "review", "admin"].some(f => faner.includes(f)));

await a.gaaTil("footwork");
await a.page.click('#footworkArea .counter button[aria-label^="Tilføj en gennemførelse af Toe-taps"]');
await a.page.waitForTimeout(400);
let w = await a.skrivninger();
t("et tryk på + skriver dagens toe-tap", w.some(x => x.navn === "footwork" && x.id === "p1" && x.data.days?.[iso(0)]?.t === 1));
t("og loggen følger med", w.some(x => x.navn === "footworkLog" && x.id === "p1"));
t("skrivningen sender kun det ene felt, ikke hele fremdriften", (() => { const s = w.find(x => x.navn === "footwork");
  return s && !("jokers" in s.data) && !("points" in s.data); })());
t("tælleren står på 1 efter gentegning", await a.page.evaluate(() => [...document.querySelectorAll("#footworkArea .ladderrow")]
  .find(r => r.textContent.includes("Toe-taps"))?.querySelector(".counter b")?.textContent === "1"));

await a.page.click("#footworkArea .daychip:nth-child(3)");          // en tom dag
await a.page.waitForTimeout(150);
await a.page.click('#footworkArea button:has-text("Søg joker")');
await a.page.waitForTimeout(200);
t("Søg joker åbner appens egen dialog med et tekstområde",
  /Søg joker for/.test(await a.dialogTekst() || "") && await a.page.evaluate(() => document.getElementById("dialogInput")?.tagName === "TEXTAREA"));
await a.page.fill("#dialogInput", "syg");
await a.svar(true);
w = await a.skrivninger();
t("anmodningen skrives i jokerRequests - ikke i jokers", w.some(x => x.navn === "footwork" && x.data.jokerRequests?.[iso(-2)] === true)
  && !w.some(x => x.navn === "footwork" && x.data.jokers));
t("og begrundelsen lander i loggen", w.some(x => x.navn === "footworkLog" && x.data.reasons?.[iso(-2)]?.tekst === "syg"));
t("kvitteringen vises som appens egen besked", /sendt til træneren/.test(await a.dialogTekst() || ""));
await a.svar(true);

await a.gaaTil("juggle");
await a.page.click('#juggleArea button:has-text("Klaret")');
await a.page.waitForTimeout(200);
t("Klaret spørger først", /Registrér/.test(await a.dialogTekst() || ""));
await a.svar(false);
t("Annullér skriver ingenting", !(await a.skrivninger()).some(x => x.navn === "juggleLadder"));
await a.page.click('#juggleArea button:has-text("Klaret")'); await a.page.waitForTimeout(200); await a.svar(true);
w = await a.skrivninger();
const stige = w.filter(x => x.navn === "juggleLadder");
t("OK registrerer trinnet", stige.length === 1 && stige[0].data.mainStep === 1);
t("første registrering sender KUN mainStep - den form, reglerne skal kunne tage", !("weakStep" in stige[0].data) && !("tricks" in stige[0].data));
t("og dagens dato til streaken", Array.isArray(stige[0].data.days) && stige[0].data.days[0] === iso(0));
await a.page.click('#juggleArea button:has-text("Fortryd")'); await a.page.waitForTimeout(200);
t("Fortryd spørger og siger, hvad det koster", /mister 3 point/.test(await a.dialogTekst() || ""));
await a.svar(true);
t("og ruller trinnet tilbage", (await a.skrivninger()).filter(x => x.navn === "juggleLadder").pop().data.mainStep === 0);
t("spiller: browserens egne bokse blev aldrig brugt", a.nativ() === 0);
t("spiller: stadig ingen fejl efter alle handlingerne", a.fejl.length === 0);
if (a.fejl.length) console.log("     " + [...new Set(a.fejl)].slice(0, 4).join("\n     "));
await a.luk();

// ------------------------------------------------------------------ demo
console.log("\nHele appen · demo-login");
a = await start("u-demo");
await rundtur(a, "demo");
await a.gaaTil("footwork");
await a.page.click('#footworkArea .counter button[aria-label^="Tilføj en gennemførelse af Toe-taps"]');
await a.page.waitForTimeout(250);
t("knappen er der, og den forklarer sig", /demo-bruger/.test(await a.dialogTekst() || ""));
await a.svar(true);
t("men der skrives ingenting", (await a.skrivninger()).length === 0);
await a.luk();

// ------------------------------------------------------------------ træner
console.log("\nHele appen · træner");
a = await start("u-traener");
faner = await rundtur(a, "træner");
t("træneren ser sine faner og ikke Admin", ["players", "track", "overview", "review"].every(f => faner.includes(f)) && !faner.includes("admin"));
await a.gaaTil("review");
t("den ventende joker står under Godkendelser med begrundelsen",
  await a.page.evaluate(() => /Jokere i fodteknik/.test(document.getElementById("reviewArea").textContent) && /syg/.test(document.getElementById("reviewArea").textContent)));
await a.page.click('#reviewArea button:has-text("Godkend")'); await a.page.waitForTimeout(200);
t("Godkend spørger først", /Godkend jokeren for Bo Test/.test(await a.dialogTekst() || ""));
await a.svar(true);
w = await a.skrivninger();
t("afgørelsen skrives i jokers", w.some(x => x.navn === "footwork" && x.id === "p2" && x.data.jokers?.[iso(-1)] === "approved"));
t("og jokeren forsvinder fra listen", await a.page.evaluate(() => !/Jokere i fodteknik/.test(document.getElementById("reviewArea").textContent)));
await a.gaaTil("track");
t("Registrering viser øvelsesoversigten for den valgte spiller", await a.page.evaluate(() => /Daglig fodteknik/.test(document.getElementById("trackingArea").textContent)));
t("træner: browserens egne bokse blev aldrig brugt", a.nativ() === 0);
t("træner: ingen fejl", a.fejl.length === 0);
if (a.fejl.length) console.log("     " + [...new Set(a.fejl)].slice(0, 4).join("\n     "));
await a.luk();

// ------------------------------------------------------------------ admin
console.log("\nHele appen · admin");
a = await start("u-admin");
faner = await rundtur(a, "admin");
t("admin ser Admin-fanen", faner.includes("admin"));
await a.gaaTil("admin");
await a.page.evaluate(() => document.querySelectorAll("#admin details").forEach(d => d.open = true));
await a.page.click('#yearControlArea button:has-text("Mærke til")'); await a.page.waitForTimeout(200);
t("at slå Talentmærket fra spørger først", /Slå Talentmærket FRA/.test(await a.dialogTekst() || ""));
await a.svar(true);
w = await a.skrivninger();
t("indstillingen skrives i clubConfig", w.some(x => x.navn === "clubConfig" && x.id === "modules" && Object.values(x.data.talentmaerke || {}).includes(false)));
t("og knappen skifter til 'Mærke fra'", await a.page.evaluate(() => /Mærke fra/.test(document.getElementById("yearControlArea").textContent)));
await a.gaaTil("settings");
const [hentet] = await Promise.all([a.page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
  a.page.click('button:has-text("Hent backup som fil")')]);
t("backuppen hentes som en fil med dato i navnet", !!hentet && /^tif-backup-\d{4}-\d{2}-\d{2}\.json$/.test(hentet.suggestedFilename()));
await a.page.waitForTimeout(200);
t("og kvitteringen tæller, hvad der er med", /4 spillere/.test(await a.dialogTekst() || ""));
await a.svar(true);
t("admin: browserens egne bokse blev aldrig brugt", a.nativ() === 0);
t("admin: ingen fejl", a.fejl.length === 0);
if (a.fejl.length) console.log("     " + [...new Set(a.fejl)].slice(0, 4).join("\n     "));
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
