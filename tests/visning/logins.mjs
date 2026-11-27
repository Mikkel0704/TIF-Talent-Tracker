// Logins oprettes og slettes af serveren (opretLogin/sletLogin), ikke fra browseren. HELE
// index.html startes uaendret mod efterligningen i stoette/firebase-stedfortraeder.js, som
// husker hvert kald til en kaldbar funktion i window.__kald og svarer, som testen beder om.
// Her proeves, at admin-formularerne sender det, serveren forventer, viser serverens danske
// beskeder, som de er - og at intet i siden opretter logins i browseren laengere.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const stedfortraeder = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PRIVACY = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("\nLogins · koden");
t("intet i siden kalder createUserWithEmailAndPassword", !html.includes("createUserWithEmailAndPassword"));
t("den ekstra Firebase-app til at oprette brugere er vaek", !/secondaryAuth|SecondaryUserCreation|secondaryApp/.test(html));
const importer = [...html.matchAll(/from "https:\/\/www\.gstatic\.com\/firebasejs\/([\d.]+)\/([\w-]+)\.js"/g)].map(m => [m[2], m[1]]);
t("Functions-SDK'et hentes fra gstatic i samme version som de andre Firebase-moduler (12.13.0)",
  importer.some(([m, v]) => m === "firebase-functions" && v === "12.13.0") && importer.every(([, v]) => v === "12.13.0"), importer);
t("App Check saettes kun op paa den ene app", (html.match(/initializeAppCheck\(/g) || []).length === 1 && /initializeAppCheck\(app,/.test(html));
// "Foer v15.81 ..." i en kommentar om stigen er historie, ikke versionen.
t("versionen er hævet til v15.84 overalt", !html.includes("v15.80") && !/v15\.8[123] ·|Tracker v15\.8[123]/.test(html) && (html.match(/v15\.84/g) || []).length >= 10);

const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: new Date().toISOString(), privacyVersion: PRIVACY };
const data = () => ({
  users: {
    "u-spiller": { email: "spiller@x.invalid", role: "player", playerId: "p1", years: ["2017"], ...ok_ },
    "u-traener": { email: "traener@x.invalid", role: "coach",  years: ["2017"], ...ok_ },
    "u-admin":   { email: "admin@x.invalid",   role: "admin",  years: ["2017", "2014"], closedYears: ["2014"], ...ok_ }
  },
  players: {
    p1: { name: "Oscar Test", year: "2017", gender: "dreng", points: 40, passed: {}, history: [], hasActiveLogin: true },
    p2: { name: "Bo Test",    year: "2017", gender: "dreng", points: 10, passed: {}, history: [] },
    p3: { name: "Carl Test",  year: "2014", gender: "dreng", points: 0,  passed: {}, history: [] }
  }
});

const browser = await chromium.launch();
async function start(uid){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const fejl = []; let nativ = 0;
  page.on("pageerror", e => fejl.push(e.message));
  // Appen skriver de fejl, testen selv lader serveren give, i konsollen (console.error) -
  // de kommer fra firebase-functions.js og er ventede. Alt andet er en fejl.
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|firebasejs\/12\.13\.0\/firebase-functions\.js/.test(m.text())) fejl.push(m.text()); });
  page.on("dialog", async d => { nativ++; await d.dismiss(); });
  await page.route("**/*", route => {
    const u = route.request().url();
    if (u === "https://app.test/") return route.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return route.fulfill({ contentType: "application/javascript", body: stedfortraeder });
    return route.abort();
  });
  const d = data();
  await page.addInitScript(([db, bruger]) => { window.__db = db; window.__bruger = bruger; window.__skrivninger = []; window.__kald = []; },
    [d, { uid, email: d.users[uid].email }]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const dialogTekst = () => page.evaluate(() => { const d = document.getElementById("appDialog");
    return d && !d.classList.contains("hidden") ? document.getElementById("dialogTekst").textContent : null; });
  const svar = async ja => { await page.click(ja ? "#dialogJa" : "#dialogNej"); await page.waitForTimeout(250); };
  const kald = () => page.evaluate(() => window.__kald);
  const nulstil = () => page.evaluate(() => { window.__kald.length = 0; window.__skrivninger.length = 0; window.__svar = {}; });
  const saetSvar = (navn, s) => page.evaluate(([n, x]) => { (window.__svar ||= {})[n] = x; }, [navn, s]);
  const skrivninger = () => page.evaluate(() => window.__skrivninger);
  return { page, fejl, nativ: () => nativ, dialogTekst, svar, kald, nulstil, saetSvar, skrivninger, luk: () => ctx.close() };
}

const a = await start("u-admin");
await a.page.click("#tab-admin"); await a.page.waitForTimeout(150);
await a.page.evaluate(() => document.querySelectorAll("#admin details").forEach(d => d.open = true));
t("Functions-klienten peger paa europe-west1", await a.page.evaluate(() => window.__funktionsRegion) === "europe-west1");

console.log("\nLogins · ny træner");
await a.page.fill("#newCoachEmail", "ny.traener@x.invalid");
await a.page.fill("#newCoachPassword", "hemmelig1");
await a.page.check('.newCoachYear[value="2017"]');
await a.page.selectOption('.newCoachYearGender[data-year="2017"]', "pige");
await a.page.check('.newCoachYear[value="2014"]');
await a.page.click('button:has-text("Opret træner")'); await a.page.waitForTimeout(300);
let k = await a.kald();
t("Opret træner kalder opretLogin én gang i europe-west1", k.length === 1 && k[0].navn === "opretLogin" && k[0].region === "europe-west1", k);
t("med rolle, e-mail, kode, de valgte aargange og koen pr. aargang - og intet andet",
  ens(k[0]?.data, { rolle: "coach", email: "ny.traener@x.invalid", kode: "hemmelig1", years: ["2017", "2014"], yearGenders: { "2017": "pige", "2014": "begge" } }), k[0]?.data);
t("kvitteringen er den samme som foer", (await a.dialogTekst()) === "Træner oprettet: ny.traener@x.invalid", await a.dialogTekst());
await a.svar(true);
t("felterne er toemt", await a.page.evaluate(() => !document.getElementById("newCoachEmail").value && !document.getElementById("newCoachPassword").value));
t("browseren skriver intet i users selv, og opretter intet login", !(await a.skrivninger()).some(w => w.navn === "users") && await a.page.evaluate(() => !window.__oprettetIBrowseren));

await a.nulstil();
await a.page.click('button:has-text("Opret træner")'); await a.page.waitForTimeout(200);
t("uden e-mail: appens egen besked, og serveren kaldes ikke", (await a.dialogTekst()) === "Skriv trænerens e-mail." && !(await a.kald()).length);
await a.svar(true);

await a.saetSvar("opretLogin", { fejl: { code: "already-exists", message: "Der findes allerede et login med den e-mail. Brug en anden, eller slet det gamle login først." } });
await a.page.fill("#newCoachEmail", "findes@x.invalid");
await a.page.fill("#newCoachPassword", "hemmelig1");
await a.page.check('.newCoachYear[value="2017"]');
await a.page.click('button:has-text("Opret træner")'); await a.page.waitForTimeout(300);
t("serverens danske besked vises, som den er", (await a.dialogTekst()) === "Kunne ikke oprette træner: Der findes allerede et login med den e-mail. Brug en anden, eller slet det gamle login først.", await a.dialogTekst());
await a.svar(true);
t("og felterne staar der stadig, saa admin kan rette", await a.page.evaluate(() => document.getElementById("newCoachEmail").value === "findes@x.invalid"));

console.log("\nLogins · nyt spillerlogin");
await a.nulstil();
await a.page.selectOption("#newPlayerLoginPlayer", "p2");
await a.page.fill("#newPlayerLoginEmail", "bo@x.invalid");
await a.page.fill("#newPlayerLoginPassword", "hemmelig1");
await a.page.click('button:has-text("Opret spillerlogin")'); await a.page.waitForTimeout(300);
k = await a.kald();
t("Opret spillerlogin kalder opretLogin med spillerens id og demo false - aargang og koen laeser serveren selv",
  k.length === 1 && k[0].navn === "opretLogin" && ens(k[0].data, { rolle: "player", email: "bo@x.invalid", kode: "hemmelig1", playerId: "p2", demo: false }), k);
t("kvitteringen er den samme som foer", (await a.dialogTekst()) === "Spillerlogin oprettet til Bo Test: bo@x.invalid", await a.dialogTekst());
await a.svar(true);
t("browseren skriver hverken users eller spillerens hasActiveLogin selv", !(await a.skrivninger()).some(w => w.navn === "users" || w.navn === "players"), await a.skrivninger());

await a.nulstil();
await a.page.selectOption("#newPlayerLoginPlayer", "p3");
await a.page.fill("#newPlayerLoginEmail", "demo@x.invalid");
await a.page.fill("#newPlayerLoginPassword", "hemmelig1");
await a.page.check("#newPlayerLoginDemo");
await a.page.click('button:has-text("Opret spillerlogin")'); await a.page.waitForTimeout(300);
k = await a.kald();
t("et demo-login sendes med demo true", ens(k[0]?.data, { rolle: "player", email: "demo@x.invalid", kode: "hemmelig1", playerId: "p3", demo: true }), k);
t("og kvitteringen siger Demo-login", (await a.dialogTekst()) === "Demo-login oprettet til Carl Test: demo@x.invalid");
await a.svar(true);
t("demo-fluebenet er slaaet fra igen", await a.page.evaluate(() => !document.getElementById("newPlayerLoginDemo").checked));

const fejlsager = [
  [{ code: "invalid-argument", message: "E-mailadressen ser ikke rigtig ud. Tjek om den er stavet korrekt." }, "Kunne ikke oprette spillerlogin: E-mailadressen ser ikke rigtig ud. Tjek om den er stavet korrekt."],
  [{ code: "permission-denied", message: "Kun en administrator kan oprette og slette logins." }, "Kunne ikke oprette spillerlogin: Kun en administrator kan oprette og slette logins."],
  [{ code: "unauthenticated", message: "Unauthenticated" }, "Kunne ikke oprette spillerlogin: Serveren kunne ikke bekræfte, at kaldet kommer fra appen. Genindlæs siden, og prøv igen."],
  [{ code: "internal", message: "internal" }, "Kunne ikke oprette spillerlogin: Der skete en fejl på serveren. Prøv igen om lidt. (internal)"],
  [{ code: "unavailable", message: "unavailable" }, "Kunne ikke oprette spillerlogin: Ingen forbindelse til serveren. Tjek internetforbindelsen, og prøv igen."]
];
for(const [fejl, forventet] of fejlsager){
  await a.nulstil();
  await a.saetSvar("opretLogin", { fejl });
  await a.page.selectOption("#newPlayerLoginPlayer", "p2");
  await a.page.fill("#newPlayerLoginEmail", "bo@x.invalid");
  await a.page.fill("#newPlayerLoginPassword", "hemmelig1");
  await a.page.click('button:has-text("Opret spillerlogin")'); await a.page.waitForTimeout(300);
  t(`fejlen ${fejl.code} vises som: ${forventet.slice(32, 90)}...`, (await a.dialogTekst()) === forventet, await a.dialogTekst());
  await a.svar(true);
}

console.log("\nLogins · slet");
await a.nulstil();
const slet = async (omraade, email) => { await a.page.evaluate(([o, e]) => { [...document.querySelectorAll(`#${o} .coachrow`)].find(r => r.textContent.includes(e)).querySelector("button.danger").click(); }, [omraade, email]); await a.page.waitForTimeout(250); };
await slet("adminArea", "traener@x.invalid");
let spm = await a.dialogTekst() || "";
t("Slet spørger med appens egen dialog og siger nu, at login'et slettes helt", /traener@x\.invalid/.test(spm) && /Login'et slettes helt/.test(spm) && /Samme e-mail kan bagefter bruges til et nyt login/.test(spm), spm);
t("og den gamle besked om Firebase-konsollen er vaek", !/Firebase Authentication|konsollen|ryddet manuelt/.test(spm));
await a.svar(false);
t("Annullér kalder ikke serveren", !(await a.kald()).length);
await slet("adminArea", "traener@x.invalid");
await a.svar(true);
k = await a.kald();
t("Ja kalder sletLogin med træneren id", k.length === 1 && k[0].navn === "sletLogin" && ens(k[0].data, { uid: "u-traener" }), k);
t("browseren sletter og skriver intet selv", !(await a.skrivninger()).length, await a.skrivninger());
t("og der kommer ingen fejlbesked", (await a.dialogTekst()) === null);

await a.nulstil();
await slet("playerLoginsArea", "spiller@x.invalid");
await a.svar(true);
k = await a.kald();
t("et spillerlogin slettes ogsaa af serveren (som saetter hasActiveLogin selv)", ens(k.map(x => [x.navn, x.data]), [["sletLogin", { uid: "u-spiller" }]]) && !(await a.skrivninger()).length, k);

await a.nulstil();
await a.saetSvar("sletLogin", { fejl: { code: "internal", message: "Adgangen til appen er lukket, men selve login'et kunne ikke slettes. Prøv igen om lidt." } });
await slet("adminArea", "traener@x.invalid"); await a.svar(true);
t("serverens fejl ved sletning vises, som den er", (await a.dialogTekst()) === "Kunne ikke slette login'et: Adgangen til appen er lukket, men selve login'et kunne ikke slettes. Prøv igen om lidt.", await a.dialogTekst());
await a.svar(true);
t("admin har ingen Slet-knap ved sin egen konto", await a.page.evaluate(() => ![...document.querySelectorAll("#adminArea .coachrow, #playerLoginsArea .coachrow")]
  .some(r => r.textContent.includes("admin@x.invalid") && r.querySelector("button.danger"))));

t("browserens egne bokse blev aldrig brugt", a.nativ() === 0);
t("ingen fejl i siden", a.fejl.length === 0, a.fejl.slice(0, 4));
t("og intet login blev oprettet i browseren", await a.page.evaluate(() => !window.__oprettetIBrowseren));
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
