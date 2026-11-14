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

async function start(uid, ekstra = {}){
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
  for (const [navn, docs] of Object.entries(ekstra)) d[navn] = { ...(d[navn] || {}), ...docs };
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

// De to nye øvelser: de skal staa i den rigtige gruppe, med deres egen takst, og gemmes
// under deres egen kode.
const raekkeNavne = grad => a.page.evaluate(g => { const hoved = [...document.querySelectorAll("#footworkArea .phasehead")].find(h => h.textContent.trim().startsWith(g));
  const ud = []; for (let e = hoved?.nextElementSibling; e && !e.classList.contains("phasehead"); e = e.nextElementSibling) ud.push(e.querySelector("b")?.textContent); return ud; }, grad);
t("Yder-yder-stop står under Mellem", (await raekkeNavne("Mellem")).includes("Yder-yder-stop"));
t("L+V-rul står under Svær", (await raekkeNavne("Svær")).includes("L+V-rul"));
t("og begge viser deres takst og tekst", await a.page.evaluate(() => { const r = n => [...document.querySelectorAll("#footworkArea .ladderrow")].find(x => x.querySelector("b").textContent === n)?.textContent || "";
  return /3 point/.test(r("Yder-yder-stop")) && /ydersiden/.test(r("Yder-yder-stop")) && /4 point/.test(r("L+V-rul")) && /L-rul og lige efter et V-rul/.test(r("L+V-rul")); }));
await a.page.evaluate(() => { window.__skrivninger.length = 0; });
await a.page.click('#footworkArea .counter button[aria-label^="Tilføj en gennemførelse af Yder-yder-stop"]');
await a.page.waitForTimeout(300);
await a.page.click('#footworkArea .counter button[aria-label^="Tilføj en gennemførelse af L+V-rul"]');
await a.page.waitForTimeout(300);
w = await a.skrivninger();
t("Yder-yder-stop gemmes under koden y", w.some(x => x.navn === "footwork" && x.data.days?.[iso(0)]?.y === 1));
t("L+V-rul gemmes under koden k", w.some(x => x.navn === "footwork" && x.data.days?.[iso(0)]?.k === 1));
t("og toe-taps fra før er stadig der", await a.page.evaluate(() => [...document.querySelectorAll("#footworkArea .ladderrow")].find(r => r.textContent.includes("Toe-taps"))?.querySelector(".counter b")?.textContent === "1"));
await a.page.evaluate(() => { window.__skrivninger.length = 0; });

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

// ================================================================== VIDEOER
const klip = new URL("./helapp-klip.mp4", import.meta.url);
(await import("node:fs")).writeFileSync(klip, "ikke en rigtig video");
const afAar = { year: "2017", gender: "dreng" };
const linkTil = sti => "https://eksempel.invalid/" + sti;

console.log("\nVideoer · upload");
a = await start("u-spiller");
await a.gaaTil("training");
await a.page.setInputFiles('#trainingArea input[type="file"]', klip.pathname);
await a.page.click('#trainingArea button[id^="uploadbtn_"]');
await a.page.waitForTimeout(500);
w = await a.skrivninger();
const op = w.find(x => x.type === "upload");
const ind = w.find(x => x.navn === "submissions");
const lnk = w.find(x => x.navn === "submissionVideos");
t("filen lægges i mappen med LOGINNETS id", !!op && op.sti.startsWith("submissions/u-spiller/"));
t("indsendelsen rummer hverken link eller sti", !!ind && !("videoURL" in ind.data) && !("videoPath" in ind.data));
t("linket ligger for sig, med samme id som indsendelsen", !!lnk && lnk.id === ind.id && lnk.data.videoPath === op.sti && lnk.data.videoURL === linkTil(op.sti));
t("og er ikke afgjort", lnk?.data.decided === false);
t("linket har kun de felter, reglerne tillader", Object.keys(lnk?.data || {}).every(k =>
  ["playerId","year","gender","videoURL","videoPath","challengeId","challengerId","opponentId","decided","submittedAt","createdAt"].includes(k)));
t("kvitteringen vises", /Video uploadet/.test(await a.dialogTekst() || ""));
await a.svar(true);

await a.page.evaluate(() => { window.__skrivninger.length = 0; window.__fejlVed = "submissions"; });
await a.page.setInputFiles('#trainingArea input[type="file"]', klip.pathname);
await a.page.click('#trainingArea button[id^="uploadbtn_"]');
await a.page.waitForTimeout(500);
w = await a.skrivninger();
t("afviser reglerne registreringen, slettes den uploadede fil igen",
  w.some(x => x.type === "upload") && w.some(x => x.type === "sletfil" && x.sti === w.find(y => y.type === "upload").sti));
t("og der oprettes intet link", !w.some(x => x.navn === "submissionVideos"));
t("fejlen siges højt", /kunne ikke|ikke registrere|fejl/i.test(await a.dialogTekst() || ""));
await a.svar(true);
t("upload: ingen fejl i siden", a.fejl.filter(f => !/upload fejlede/.test(f)).length === 0);
await a.luk();

console.log("\nVideoer · træneren");
const ventende = {
  submissions: {
    "s-ny":     { playerId: "p2", playerName: "Bo Test", ...afAar, exercise: "Præcision", stepIndex: 0, level: 1, medal: "Bronze", status: "pending", challengeId: null, submittedAt: new Date().toISOString() },
    "s-gammel": { playerId: "p1", playerName: "Oscar Test", ...afAar, exercise: "Finter", stepIndex: 0, level: 1, medal: "Bronze", status: "pending", challengeId: null, submittedAt: new Date().toISOString(),
                  videoURL: linkTil("submissions/p1/1_gammel.mp4"), videoPath: "submissions/p1/1_gammel.mp4" },
    "s-ond":    { playerId: "p2", playerName: "Bo Test", ...afAar, exercise: "Kontrol", stepIndex: 0, level: 1, medal: "Bronze", status: "pending", challengeId: null, submittedAt: new Date().toISOString() }
  },
  submissionVideos: {
    "s-ny":  { playerId: "p2", ...afAar, videoURL: linkTil("submissions/u-bo/2_ny.mp4"), videoPath: "submissions/u-bo/2_ny.mp4", decided: false },
    "s-ond": { playerId: "p2", ...afAar, videoURL: 'https://x.invalid/"><img src=x onerror="window.__hacket=1">', videoPath: "submissions/u-bo/3.mp4", decided: false }
  }
};
a = await start("u-traener", ventende);
await a.gaaTil("review");
const afspillere = () => a.page.evaluate(() => [...document.querySelectorAll("#reviewArea video")].map(v => v.getAttribute("src")));
let src = await afspillere();
t("træneren ser den nye video", src.includes(linkTil("submissions/u-bo/2_ny.mp4")));
t("og den gamle, fra før flytningen", src.includes(linkTil("submissions/p1/1_gammel.mp4")));
t("et håndskrevet link kan ikke bryde ud af afspilleren", !(await a.page.evaluate(() => window.__hacket))
  && (await a.page.evaluate(() => document.querySelectorAll("#reviewArea img").length)) === 0);
const godkend = async navn => { await a.page.evaluate(n => { [...document.querySelectorAll("#reviewArea .exercise-block")]
  .find(b => b.textContent.includes(n)).querySelector("button").click(); }, navn); await a.page.waitForTimeout(400); };
await godkend("Præcision");
w = await a.skrivninger();
t("godkendelse sletter filen", w.some(x => x.type === "sletfil" && x.sti === "submissions/u-bo/2_ny.mp4"));
t("og hele link-dokumentet", w.some(x => x.type === "delete" && x.navn === "submissionVideos" && x.id === "s-ny"));
t("og giver point på spilleren", w.some(x => x.navn === "players" && x.id === "p2" && x.data.points > 10));
await godkend("Finter");
w = await a.skrivninger();
t("en gammel video slettes også, og dens link ryddes på indsendelsen",
  w.some(x => x.type === "sletfil" && x.sti === "submissions/p1/1_gammel.mp4") && w.some(x => x.navn === "submissions" && x.id === "s-gammel" && x.data.videoURL === null));
t("træner/video: ingen fejl", a.fejl.length === 0);
if (a.fejl.length) console.log("     " + [...new Set(a.fejl)].slice(0, 4).join("\n     "));
await a.luk();

console.log("\nVideoer · duel");
const duelGrund = afgjort => ({
  challenges: { c1: { type: "freestyle", title: "Flest jongleringer", challengerId: "p1", challengerName: "Oscar Test", opponentId: "p2", opponentName: "Bo Test", ...afAar, status: afgjort ? "completed" : "active", winnerId: afgjort ? "p2" : null, winnerName: afgjort ? "Bo Test" : null } },
  submissions: {
    "d-oscar": { playerId: "p1", playerName: "Oscar Test", ...afAar, exercise: "Flest jongleringer", stepIndex: null, status: afgjort ? "rejected" : "pending", challengeId: "c1", challengerId: "p1", opponentId: "p2", submittedAt: new Date().toISOString(), reviewedAt: afgjort ? new Date().toISOString() : null },
    "d-bo":    { playerId: "p2", playerName: "Bo Test",    ...afAar, exercise: "Flest jongleringer", stepIndex: null, status: afgjort ? "approved" : "pending", challengeId: "c1", challengerId: "p1", opponentId: "p2", submittedAt: new Date().toISOString(), reviewedAt: afgjort ? new Date().toISOString() : null }
  },
  submissionVideos: {
    "d-oscar": { playerId: "p1", ...afAar, videoURL: linkTil("submissions/u-spiller/4_oscar.mp4"), videoPath: "submissions/u-spiller/4_oscar.mp4", challengeId: "c1", challengerId: "p1", opponentId: "p2", decided: afgjort },
    "d-bo":    { playerId: "p2", ...afAar, videoURL: linkTil("submissions/u-bo/5_bo.mp4"),         videoPath: "submissions/u-bo/5_bo.mp4",         challengeId: "c1", challengerId: "p1", opponentId: "p2", decided: afgjort }
  }
});
a = await start("u-spiller", duelGrund(false));
await a.gaaTil("challenges");
t("før afgørelsen ser Oscar ikke Bos video", (await a.page.evaluate(() => document.querySelectorAll("#challengesArea video").length)) === 0);
t("men får at vide, at Bo har uploadet", await a.page.evaluate(() => /har uploadet/.test(document.getElementById("challengesArea").textContent)));
await a.luk();

a = await start("u-traener", duelGrund(false));
await a.gaaTil("review");
t("træneren ser begge duel-videoer side om side", (await a.page.evaluate(() => document.querySelectorAll("#reviewArea video").length)) === 2);
await a.page.evaluate(() => { [...document.querySelectorAll("#reviewArea button")].find(b => /Bo Test/.test(b.textContent)).click(); });
await a.page.waitForTimeout(500);
w = await a.skrivninger();
t("afgørelsen frigiver begge links til modparten",
  ["d-oscar", "d-bo"].every(id => w.some(x => x.navn === "submissionVideos" && x.id === id && x.data.decided === true)));
t("og sletter ingen af filerne endnu", !w.some(x => x.type === "sletfil"));
await a.luk();

a = await start("u-spiller", duelGrund(true));
await a.gaaTil("challenges");
const duelSrc = await a.page.evaluate(() => [...document.querySelectorAll("#challengesArea video")].map(v => v.getAttribute("src")));
t("efter afgørelsen ser Oscar Bos video", duelSrc.length === 1 && duelSrc[0] === linkTil("submissions/u-bo/5_bo.mp4"));
await a.page.evaluate(() => document.querySelector("#challengesArea video").dispatchEvent(new Event("play")));
await a.page.waitForTimeout(250);
w = await a.skrivninger();
t("afspilning markerer den som set - på linket, ikke på indsendelsen",
  w.some(x => x.navn === "submissionVideos" && x.id === "d-bo" && "viewedAt" in x.data) && !w.some(x => x.navn === "submissions"));
await a.page.evaluate(() => document.querySelector("#challengesArea video")?.dispatchEvent(new Event("ended")));
await a.page.waitForTimeout(400);
w = await a.skrivninger();
t("set til ende: filen slettes, og linket ryddes",
  w.some(x => x.type === "sletfil" && x.sti === "submissions/u-bo/5_bo.mp4") && w.some(x => x.navn === "submissionVideos" && x.id === "d-bo" && x.data.videoURL === null));
t("og afspilleren forsvinder", (await a.page.evaluate(() => document.querySelectorAll("#challengesArea video").length)) === 0);
t("duel: ingen fejl", a.fejl.length === 0);
if (a.fejl.length) console.log("     " + [...new Set(a.fejl)].slice(0, 4).join("\n     "));
await a.luk();

// ================================================================== INSTRUKTIONSVIDEOER
const gv = n => ({ url: linkTil("guides/" + n + ".mp4"), sti: "guides/" + n + ".mp4", lagt: new Date().toISOString() });
const medVideoer = { clubConfig: { guideVideos: {
  f_t: gv("f_t/1_toetaps"), t_oploft: gv("t_oploft/2_oploft"), m_1: gv("m_1/3_praecision"),
  f_s: { url: 'javascript:alert(1)', sti: "guides/f_s/x.mp4", lagt: new Date().toISOString() },          // ikke https
  f_d: { url: 'https://x.invalid/"><img src=x onerror="window.__hacket=1">', sti: "guides/f_d/y.mp4" }   // forsoeg paa udbrud
} } };
const videoknapper = (a, omr) => a.page.evaluate(o => [...document.querySelectorAll(o + " .videoknap")].map(b => b.getAttribute("aria-label")), omr);
const afspiller = a => a.page.evaluate(() => { const b = document.getElementById("guideVideoBag");
  return b && !b.classList.contains("hidden") ? { titel: document.getElementById("guideVideoTitel").textContent, src: document.getElementById("guideVideoEl").getAttribute("src") } : null; });

console.log("\nInstruktionsvideoer · uden videoer");
a = await start("u-spiller");
await a.gaaTil("footwork");
t("uden videoer er der ingen knapper på fodteknik", (await videoknapper(a, "#footwork")).length === 0);
await a.gaaTil("juggle");
t("eller på stigen", (await videoknapper(a, "#juggle")).length === 0);
await a.luk();

console.log("\nInstruktionsvideoer · spilleren");
a = await start("u-spiller", medVideoer);
await a.gaaTil("footwork");
let knapper = await videoknapper(a, "#footworkArea");
t("øvelserne med video får en knap - og kun dem", knapper.length === 2 && /Toe-taps/.test(knapper[0]) && /Trommestikker/.test(knapper[1]));
t("en adresse, der ikke er https, giver ingen knap", !knapper.some(k => /Sålerul/.test(k)));
t("oversigten 'hvad er hvad' får de samme knapper", (await videoknapper(a, "#footworkExerciseArea")).length === 2);
const foer = (await a.skrivninger()).length;
await a.page.click("#footworkArea .videoknap");
await a.page.waitForTimeout(200);
let sp = await afspiller(a);
t("et tryk åbner afspilleren med øvelsens navn", sp?.titel === "Toe-taps");
t("og den rigtige video", sp?.src === linkTil("guides/f_t/1_toetaps.mp4"));
t("videoen hentes først ved trykket - der er ingen afspiller i siden før", (await a.page.evaluate(() => document.querySelectorAll("#footwork video, #juggle video, #guide video").length)) === 0);
t("at se en video skriver ingenting", (await a.skrivninger()).length === foer);
t("markøren står på Luk", await a.page.evaluate(() => document.activeElement?.id === "guideVideoLuk"));
await a.page.keyboard.press("Escape");
await a.page.waitForTimeout(150);
t("Escape lukker afspilleren", (await afspiller(a)) === null);
t("og kilden er fjernet, så der ikke hentes videre", await a.page.evaluate(() => !document.getElementById("guideVideoEl").hasAttribute("src")));
t("markøren er tilbage på knappen", await a.page.evaluate(() => document.activeElement?.classList.contains("videoknap")));
await a.page.click("#footworkArea .videoknap");
await a.page.waitForTimeout(150);
await a.page.click("#guideVideoLuk");
await a.page.waitForTimeout(150);
t("Luk-knappen lukker også", (await afspiller(a)) === null);
await a.page.click('#footworkArea .counter button[aria-label^="Tilføj en gennemførelse af Toe-taps"]');
await a.page.waitForTimeout(400);
t("knapperne er der stadig efter en gentegning", (await videoknapper(a, "#footworkArea")).length === 2);

await a.gaaTil("juggle");
knapper = await videoknapper(a, "#juggleArea");
t("tricket med video får en knap på stigen", knapper.length === 1 && /Opløft/.test(knapper[0]));
await a.page.click("#juggleArea .videoknap");
await a.page.waitForTimeout(150);
t("og åbner sit eget klip", (await afspiller(a))?.src === linkTil("guides/t_oploft/2_oploft.mp4"));
await a.page.click("#guideVideoLuk");

await a.gaaTil("guide");
knapper = await videoknapper(a, "#exerciseInfo");
t("Guides viser videoen på den rigtige øvelse", knapper.length === 1 && /Præcision/.test(knapper[0]));
await a.page.evaluate(() => { [...document.querySelectorAll("#exerciseInfo details")].forEach(d => d.open = true); });
await a.page.click("#exerciseInfo .videoknap");
await a.page.waitForTimeout(150);
t("og afspiller den", (await afspiller(a))?.titel === "Præcision");
await a.page.click("#guideVideoLuk");
t("et håndskrevet link kan ikke bryde ud", !(await a.page.evaluate(() => window.__hacket)) && (await a.page.evaluate(() => document.querySelectorAll("img[src='x']").length)) === 0);
// En ny video dukker op, mens siden er aaben - ogsaa i den harmonika, der kun bygges én gang.
await a.page.evaluate(() => { window.__db.clubConfig.guideVideos.m_0 = { url: "https://eksempel.invalid/guides/m_0/9.mp4", sti: "guides/m_0/9.mp4" }; });
await a.page.evaluate(async () => { const m = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
  await m.setDoc(m.doc({}, "clubConfig", "guideVideos"), {}, { merge: true }); });
await a.page.waitForTimeout(900);
t("en video, der lægges op imens, dukker op uden genindlæsning", (await videoknapper(a, "#exerciseInfo")).length === 2);
t("og en udfoldet øvelse er stadig foldet ud", await a.page.evaluate(() => [...document.querySelectorAll("#exerciseInfo details")].every(d => d.open)));
t("spiller/instruktionsvideo: ingen fejl", a.fejl.length === 0);
if (a.fejl.length) console.log("     " + [...new Set(a.fejl)].slice(0, 4).join("\n     "));
t("spilleren har ingen upload-del", (await a.page.evaluate(() => !!document.getElementById("guideVideoAdminArea")?.offsetParent)) === false);
await a.luk();

console.log("\nInstruktionsvideoer · demo-login");
a = await start("u-demo", medVideoer);
await a.gaaTil("footwork");
await a.page.click("#footworkArea .videoknap");
await a.page.waitForTimeout(150);
t("demo-loginnet kan også se videoen", (await afspiller(a))?.titel === "Toe-taps");
await a.luk();

console.log("\nInstruktionsvideoer · admin lægger op");
const aabnAdmin = async a => { await a.gaaTil("admin"); await a.page.evaluate(() => document.querySelectorAll("#admin details").forEach(d => d.open = true)); };
const raekke = (a, navn) => a.page.evaluate(n => { const r = [...document.querySelectorAll("#guideVideoAdminArea .coachrow")].find(x => x.querySelector("b").textContent === n);
  return r ? { status: r.querySelector(".small").textContent, knapper: [...r.querySelectorAll("button")].map(b => b.textContent) } : null; }, navn);
const vaelgFil = async (a, navn, fil) => {
  const [vaelger] = await Promise.all([a.page.waitForEvent("filechooser", { timeout: 4000 }),
    a.page.evaluate(n => { [...document.querySelectorAll("#guideVideoAdminArea .coachrow")].find(x => x.querySelector("b").textContent === n)
      .querySelector("button:last-of-type, button").parentElement.querySelectorAll("button").forEach(b => { if (/Læg op|Udskift/.test(b.textContent)) b.click(); }); }, navn)]);
  await vaelger.setFiles(fil);
  await a.page.waitForTimeout(500);
};
a = await start("u-admin");
await a.page.evaluate(() => { window.__maerker = { admin: true }; });
await aabnAdmin(a);
t("alle 31 pladser står der (20 fodteknik, 6 tricks, 5 til Talentmærket)", (await a.page.evaluate(() => document.querySelectorAll("#guideVideoAdminArea .coachrow").length)) === 31);
t("en tom plads har kun 'Læg op'", JSON.stringify((await raekke(a, "Toe-taps"))?.knapper) === JSON.stringify(["Læg op"]));
await vaelgFil(a, "Toe-taps", klip.pathname);
w = await a.skrivninger();
let gop = w.find(x => x.type === "upload");
let gdoc = w.find(x => x.navn === "clubConfig" && x.id === "guideVideos");
t("filen lægges i mappen for øvelsen", !!gop && /^guides\/f_t\/\d+_helapp-klip\.mp4$/.test(gop.sti));
t("og sendes som video", gop?.contentType === "video/mp4");
t("adressen skrives i clubConfig/guideVideos - kun det ene felt, med merge", !!gdoc && gdoc.merge && Object.keys(gdoc.data).join() === "f_t"
  && gdoc.data.f_t.sti === gop.sti && gdoc.data.f_t.url === linkTil(gop.sti) && !!gdoc.data.f_t.lagt);
t("der står ingen e-mail eller navn i dokumentet", Object.keys(gdoc?.data.f_t || {}).sort().join() === "lagt,sti,url");
t("kvitteringen nævner øvelsen", /Toe-taps.*lagt op/.test(await a.dialogTekst() || ""));
await a.svar(true);
t("pladsen viser nu Se, Udskift og Slet", JSON.stringify((await raekke(a, "Toe-taps"))?.knapper) === JSON.stringify(["Se", "Udskift", "Slet"]));
t("og datoen", /Video lagt op \d/.test((await raekke(a, "Toe-taps"))?.status || ""));
t("filvælgeren er ryddet væk igen", (await a.page.evaluate(() => document.getElementById("guideVideoFil"))) === null);

await a.page.evaluate(() => { window.__skrivninger.length = 0; });
await vaelgFil(a, "Toe-taps", klip.pathname);
w = await a.skrivninger();
const nyOp = w.find(x => x.type === "upload");
t("ved udskiftning slettes den gamle fil - efter at den nye er registreret",
  w.findIndex(x => x.type === "sletfil" && x.sti === gop.sti) > w.findIndex(x => x.navn === "clubConfig") && nyOp.sti !== gop.sti);
await a.svar(true);

await a.page.evaluate(() => { window.__skrivninger.length = 0; });
await a.page.evaluate(() => { [...document.querySelectorAll("#guideVideoAdminArea .coachrow")].find(x => x.querySelector("b").textContent === "Toe-taps")
  .querySelectorAll("button").forEach(b => { if (b.textContent === "Slet") b.click(); }); });
await a.page.waitForTimeout(200);
t("sletning spørger først", /Slet videoen til "Toe-taps"/.test(await a.dialogTekst() || ""));
await a.svar(false);
t("et nej sletter ingenting", (await a.skrivninger()).length === 0);
await a.page.evaluate(() => { [...document.querySelectorAll("#guideVideoAdminArea .coachrow")].find(x => x.querySelector("b").textContent === "Toe-taps")
  .querySelectorAll("button").forEach(b => { if (b.textContent === "Slet") b.click(); }); });
await a.page.waitForTimeout(200);
await a.svar(true);
w = await a.skrivninger();
t("et ja fjerner henvisningen først og filen bagefter",
  w.findIndex(x => x.navn === "clubConfig" && x.id === "guideVideos" && !("f_t" in x.data)) === 0 && w.findIndex(x => x.type === "sletfil" && x.sti === nyOp.sti) === 1);
await a.svar(true);
t("pladsen er tom igen", JSON.stringify((await raekke(a, "Toe-taps"))?.knapper) === JSON.stringify(["Læg op"]));

console.log("\nInstruktionsvideoer · når noget går galt");
const tekstfil = new URL("./helapp-notat.txt", import.meta.url);
(await import("node:fs")).writeFileSync(tekstfil, "ikke en video");
await a.page.evaluate(() => { window.__skrivninger.length = 0; });
await vaelgFil(a, "Sålerul", tekstfil.pathname);
t("en fil, der ikke er en video, afvises før upload", /Vælg en videofil/.test(await a.dialogTekst() || "") && (await a.skrivninger()).length === 0);
await a.svar(true);

await a.page.evaluate(() => { window.__fejlVed = "clubConfig"; });
await vaelgFil(a, "Sålerul", klip.pathname);
w = await a.skrivninger();
t("afviser reglerne registreringen, slettes den uploadede fil igen",
  w.some(x => x.type === "upload") && w.some(x => x.type === "sletfil" && x.sti === w.find(y => y.type === "upload").sti));
t("og det siges højt", /kunne ikke registreres/.test(await a.dialogTekst() || ""));
await a.svar(true);
t("pladsen står stadig tom, og knapperne er låst op igen", JSON.stringify((await raekke(a, "Sålerul"))?.knapper) === JSON.stringify(["Læg op"])
  && (await a.page.evaluate(() => [...document.querySelectorAll("#guideVideoAdminArea button")].every(b => !b.disabled))));

await a.page.evaluate(() => { window.__fejlVed = null; window.__fejlVedUpload = "storage/unauthorized"; window.__skrivninger.length = 0; });
await vaelgFil(a, "Sålerul", klip.pathname);
t("siger lageret nej, skrives der ingenting, og beskeden forklarer hvorfor",
  (await a.skrivninger()).length === 0 && /Lageret afviste videoen/.test(await a.dialogTekst() || ""));
await a.svar(true);

await a.page.evaluate(() => { window.__fejlVedUpload = null; window.__maerker = {}; window.__bevisFornyet = 0; window.__skrivninger.length = 0; });
await vaelgFil(a, "Sålerul", klip.pathname);
t("uden mærket på loginnet uploades der ikke - efter ét forsøg med et frisk bevis",
  (await a.skrivninger()).length === 0 && (await a.page.evaluate(() => window.__bevisFornyet)) === 1 && /har endnu ikke fået tilladelsen/.test(await a.dialogTekst() || ""));
await a.svar(true);
await a.page.evaluate(() => { window.__maerkerEfterFornyelse = { admin: true }; });
await vaelgFil(a, "Sålerul", klip.pathname);
t("er mærket lige blevet sat, finder appen det ved at forny beviset", (await a.skrivninger()).some(x => x.type === "upload") && /lagt op/.test(await a.dialogTekst() || ""));
await a.svar(true);

await a.page.evaluate(() => { window.__uploadTid = 700; });
const [vaelger2] = await Promise.all([a.page.waitForEvent("filechooser", { timeout: 4000 }),
  a.page.evaluate(() => { [...document.querySelectorAll("#guideVideoAdminArea .coachrow")].find(x => x.querySelector("b").textContent === "V-rul yderside").querySelector("button").click(); })]);
await vaelger2.setFiles(klip.pathname);
await a.page.waitForTimeout(250);
t("mens der uploades, vises fremdriften", /Uploader… 50 %/.test((await raekke(a, "V-rul yderside"))?.status || ""));
t("og de andre knapper er låst", await a.page.evaluate(() => [...document.querySelectorAll("#guideVideoAdminArea button")].filter(b => /Læg op|Udskift|Slet/.test(b.textContent)).every(b => b.disabled)));
await a.page.waitForTimeout(900);
await a.svar(true);
t("admin/instruktionsvideo: browserens egne bokse blev aldrig brugt", a.nativ() === 0);
const uventet = a.fejl.filter(f => !/instruktionsvideo fejlede/.test(f));
t("admin/instruktionsvideo: ingen uventede fejl", uventet.length === 0);
if (uventet.length) console.log("     " + [...new Set(uventet)].slice(0, 6).join("\n     "));
await a.luk();

a = await start("u-traener", medVideoer);
faner = await a.faner();
t("en træner har ingen Admin-fane og dermed ingen upload", !faner.includes("admin"));
await a.gaaTil("guide");
t("men ser videoen til Talentmærkets øvelse under Guides", (await videoknapper(a, "#exerciseInfo")).length === 1);
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
