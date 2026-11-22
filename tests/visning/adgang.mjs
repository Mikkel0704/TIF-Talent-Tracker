// Adgang og admin-handlinger i HELE appen (index.html uændret) mod efterligningen i
// stoette/firebase-stedfortraeder.js:
//  - et login uden users-dokument faar en besked og logges ud - appen opretter intet selv
//  - et demo-login goer aldrig et barn til en, der kan udfordres (Aktiver og Synkronisér)
//  - et login, hvis barn er slettet, kan (de)aktiveres uden at der opstaar en tom spiller
//  - en afvist skrivning (reglerne siger nej) giver en dansk besked i stedet for stilhed
//  - "Genopbyg klub-rangliste" taeller de rigtige fejl
//  - videooprydningen i browseren foelger samme regler som serveren (videoSkalSlettes)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const stedfortraeder = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PRIVACY = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };

const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: new Date().toISOString(), privacyVersion: PRIVACY };
const data = () => ({
  users: {
    "u-admin":  { email: "admin@x.invalid",  role: "admin",  years: ["2017"], ...ok_ },
    "u-oscar":  { email: "oscar@x.invalid",  role: "player", playerId: "p1", years: ["2017"], ...ok_ },
    "u-demo1":  { email: "demo1@x.invalid",  role: "player", playerId: "p1", years: ["2017"], demo: true, ...ok_ },
    "u-demo2":  { email: "demo2@x.invalid",  role: "player", playerId: "p2", years: ["2017"], demo: true, ...ok_, active: false },
    "u-gammel": { email: "gammel@x.invalid", role: "player", playerId: "p-slettet", years: ["2017"], ...ok_ },
    "u-traener":{ email: "traener@x.invalid", role: "coach", years: ["2017"], ...ok_ }
  },
  players: {
    p1: { name: "Oscar Test", year: "2017", gender: "dreng", points: 40, passed: {}, history: [], hasActiveLogin: true },
    p2: { name: "Bo Test",    year: "2017", gender: "dreng", points: 10, passed: {}, history: [], hasActiveLogin: true }
  },
  rangliste: {
    p1: { name: "Oscar Test", year: "2017", gender: "dreng", kanUdfordres: true, total: 40 },
    p2: { name: "Bo Test",    year: "2017", gender: "dreng", kanUdfordres: true, total: 10 }
  },
  challenges: {
    c1: { type: "freestyle", title: "Flest jongleringer", challengerId: "p2", challengerName: "Bo Test", opponentId: "p1", opponentName: "Oscar Test", year: "2017", gender: "dreng", status: "pending" }
  }
});

const browser = await chromium.launch();
async function start(uid, { ekstra = {}, uden = false } = {}){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen" });
  const page = await ctx.newPage();
  const fejl = [];
  page.on("pageerror", e => fejl.push(e.message));
  page.on("dialog", d => d.dismiss());
  await page.route("**/*", route => {
    const u = route.request().url();
    if (u === "https://app.test/") return route.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return route.fulfill({ contentType: "application/javascript", body: stedfortraeder });
    return route.abort();
  });
  const d = data(); Object.assign(d, ekstra);
  const email = uden ? "fremmed@x.invalid" : d.users[uid].email;
  await page.addInitScript(([db, bruger]) => { window.__db = db; window.__bruger = bruger; window.__skrivninger = []; window.__kald = []; },
    [d, { uid, email }]);
  await page.goto("https://app.test/");
  await page.waitForTimeout(900);
  const dialogTekst = () => page.evaluate(() => { const d = document.getElementById("appDialog");
    return d && !d.classList.contains("hidden") ? document.getElementById("dialogTekst").textContent : null; });
  const luk = async () => { if (await dialogTekst() !== null) { await page.click("#dialogJa").catch(() => {}); await page.waitForTimeout(150); } };
  const svar = async ja => { await page.click(ja ? "#dialogJa" : "#dialogNej"); await page.waitForTimeout(250); };
  const skrivninger = () => page.evaluate(() => window.__skrivninger);
  const nulstil = () => page.evaluate(() => { window.__skrivninger.length = 0; window.__fejlVed = null; });
  const db = () => page.evaluate(() => window.__db);
  return { page, fejl, dialogTekst, luk, svar, skrivninger, nulstil, db, slut: () => ctx.close() };
}

console.log("\nEt login uden users-dokument");
let a = await start("u-fremmed", { uden: true });
t("beskeden: Du har ingen adgang til appen. Kontakt klubben.", await a.dialogTekst() === "Du har ingen adgang til appen. Kontakt klubben.", await a.dialogTekst());
t("appen opretter intet users-dokument (reglerne ville afvise det)", !(await a.skrivninger()).length && !(await a.db()).users["u-fremmed"], await a.skrivninger());
t("og logger ud", await a.page.evaluate(() => window.__bruger === null));
t("menuen kommer aldrig frem", await a.page.evaluate(() => document.getElementById("mainNav").classList.contains("hidden")));
t("ingen JS-fejl", !a.fejl.length, a.fejl);
await a.slut();

console.log("\nDemo-login og hasActiveLogin");
a = await start("u-admin");
await a.page.evaluate(() => { toggleUserActive("u-demo2"); }); await a.page.waitForTimeout(200);
let w = await a.skrivninger();
t("Aktiver på et demo-login: login'et bliver aktivt", w.some(x => x.navn === "users" && x.id === "u-demo2" && x.data.active === true), w);
t("men barnet bliver ikke en, der kan udfordres (hasActiveLogin false)", (await a.db()).players.p2.hasActiveLogin === false, (await a.db()).players.p2);
await a.nulstil();
await a.page.evaluate(() => { toggleUserActive("u-demo1"); }); await a.page.waitForTimeout(200);
t("Deaktiver et demo-login på et barn med et andet, rigtigt login: barnet kan stadig udfordres", (await a.db()).players.p1.hasActiveLogin === true, (await a.db()).players.p1);
await a.nulstil();
await a.page.evaluate(() => { toggleUserActive("u-oscar"); }); await a.page.waitForTimeout(200);
t("Deaktiver barnets eneste rigtige login: nu kan barnet ikke udfordres", (await a.db()).players.p1.hasActiveLogin === false);
await a.page.evaluate(() => { toggleUserActive("u-oscar"); }); await a.page.waitForTimeout(200);
t("Aktiver det igen: barnet kan udfordres igen", (await a.db()).players.p1.hasActiveLogin === true);
await a.slut();
// Synkronisér: Bo (p2) har kun et aktivt demo-login, men står som en, der kan udfordres.
{ const d = data(); a = await start("u-admin", { ekstra: { users: { ...d.users, "u-demo2": { ...d.users["u-demo2"], active: true } } } }); }
await a.page.evaluate(() => { syncPlayerLoginFlags(); }); await a.page.waitForTimeout(250);
t("Synkronisér regner et demo-login som ingen login", (await a.db()).players.p2.hasActiveLogin === false, (await a.db()).players.p2);
t("og siger, hvor mange der blev rettet", /Synkronisering færdig: 1 spillere opdateret\./.test(await a.dialogTekst() || ""), await a.dialogTekst());
await a.luk();

console.log("\nEt login, hvis barn er slettet");
await a.nulstil();
await a.page.evaluate(() => { toggleUserActive("u-gammel"); }); await a.page.waitForTimeout(200);
w = await a.skrivninger();
t("login'et deaktiveres", w.some(x => x.navn === "users" && x.id === "u-gammel" && x.data.active === false), w);
t("men der skrives intet på en spiller, der ikke findes - ingen tom spiller", !w.some(x => x.navn === "players") && !(await a.db()).players["p-slettet"], w);
t("og admin får det at vide", /spilleren, det hører til, findes ikke længere/.test(await a.dialogTekst() || ""), await a.dialogTekst());
await a.luk();

console.log("\nEn afvist skrivning giver en besked");
await a.nulstil();
await a.page.evaluate(() => { window.__fejlVed = "users"; toggleUserActive("u-traener"); }); await a.page.waitForTimeout(200);
t("Deaktiver: \"Kunne ikke deaktivere login'et: adgang nægtet.\"", await a.dialogTekst() === "Kunne ikke deaktivere login'et: adgang nægtet.", await a.dialogTekst());
await a.luk();
await a.page.evaluate(() => { editCoach("u-traener"); saveCoachAccess("u-traener"); }); await a.page.waitForTimeout(200);
t("Gem adgang: \"Kunne ikke gemme adgangen: adgang nægtet.\"", await a.dialogTekst() === "Kunne ikke gemme adgangen: adgang nægtet.", await a.dialogTekst());
t("og formularen står der stadig, så admin kan prøve igen", await a.page.evaluate(() => !!document.getElementById("editRole")));
await a.luk();
await a.page.evaluate(() => { window.__fejlVed = "players"; setPlayerGender("p1", "pige"); }); await a.page.waitForTimeout(200);
t("Køn: \"Kunne ikke gemme køn: adgang nægtet.\"", await a.dialogTekst() === "Kunne ikke gemme køn: adgang nægtet.", await a.dialogTekst());
await a.luk();
await a.page.evaluate(() => { setPlayerGender("p-slettet", "pige"); }); await a.page.waitForTimeout(150);
t("Køn på en spiller, der ikke findes: ingen skrivning", await a.dialogTekst() === "Spilleren findes ikke længere." && !(await a.db()).players["p-slettet"]);
await a.luk();

console.log("\nGenopbyg klub-rangliste tæller de rigtige fejl");
await a.page.evaluate(() => { window.__fejlVed = "clubRanking"; rebuildClubRanking(); }); await a.page.waitForTimeout(200);
await a.svar(true); await a.page.waitForTimeout(250);
t("alle skrivninger afvist: Skrevet 0, Fejlede 2", /Skrevet: 0\nFejlede: 2/.test(await a.dialogTekst() || ""), await a.dialogTekst());
await a.luk();
await a.page.evaluate(() => { window.__fejlVed = null; rebuildClubRanking(); }); await a.page.waitForTimeout(200);
await a.svar(true); await a.page.waitForTimeout(250);
t("ingen afvist: Skrevet 2, Fejlede 0", /Skrevet: 2\nFejlede: 0/.test(await a.dialogTekst() || ""), await a.dialogTekst());
t("ingen JS-fejl hos admin", !a.fejl.length, a.fejl);
await a.slut();

console.log("\nDueller: en afvist skrivning giver en besked");
a = await start("u-oscar");
await a.page.evaluate(() => { window.__fejlVed = "challenges"; respondChallenge("c1", true); }); await a.page.waitForTimeout(200);
t("svar på en udfordring: \"Svaret blev ikke gemt: adgang nægtet.\"", await a.dialogTekst() === "Svaret blev ikke gemt: adgang nægtet.", await a.dialogTekst());
await a.luk();
await a.page.evaluate(() => showPage("challenges")); await a.page.waitForTimeout(200);
await a.page.evaluate(() => setChallengeCreateType("freestyle")); await a.page.waitForTimeout(150);
await a.page.fill("#challengeFreeTitle", "Flest hovedstød");
await a.page.evaluate(() => { createChallenge("p1"); }); await a.page.waitForTimeout(200);
t("ny udfordring: \"Udfordringen blev ikke sendt: adgang nægtet.\" - ikke \"sendt\"", await a.dialogTekst() === "Udfordringen blev ikke sendt: adgang nægtet.", await a.dialogTekst());
await a.luk();
await a.page.evaluate(() => { window.__fejlVed = null; createChallenge("p1"); }); await a.page.waitForTimeout(200);
t("når skrivningen går igennem: \"Udfordring sendt til Bo Test!\"", await a.dialogTekst() === "Udfordring sendt til Bo Test!", await a.dialogTekst());
t("ingen JS-fejl hos spilleren", !a.fejl.length, a.fejl);
await a.slut();

console.log("\nVideooprydningen i trænerens browser - samme regler som serveren");
const NU = Date.now(), H = 3600 * 1000, DAG = 24 * H;
const iso = ms => new Date(ms).toISOString();
const ts = ms => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
const sub = (id, x) => ({ playerId: "p1", playerName: "Oscar Test", year: "2017", gender: "dreng", exercise: "Jonglering", stepIndex: 0, ...x });
const vid = (id, x = {}) => ({ playerId: "p1", year: "2017", gender: "dreng", videoURL: "https://eksempel.invalid/" + id, videoPath: "submissions/u-oscar/" + id + ".mp4", decided: false, ...x });
const ekstra = {
  submissions: {
    traening: sub("traening", { status: "approved", submittedAt: iso(NU - DAG), reviewedAt: ts(NU - H) }),
    afventer6: sub("afventer6", { status: "pending", submittedAt: iso(NU - 6 * DAG - 23 * H) }),
    afventer7: sub("afventer7", { status: "pending", submittedAt: iso(NU - 7 * DAG - 60000) }),
    duelSet: sub("duelSet", { status: "rejected", challengeId: "c9", submittedAt: iso(NU - DAG), reviewedAt: ts(NU - H) }),
    duelFrist: sub("duelFrist", { status: "approved", challengeId: "c9", submittedAt: iso(NU - 3 * DAG), reviewedAt: ts(NU - 2 * DAG - 60000) }),
    duelUng: sub("duelUng", { status: "approved", challengeId: "c9", submittedAt: iso(NU - 3 * DAG), reviewedAt: ts(NU - DAG) }),
    gammel: sub("gammel", { status: "approved", submittedAt: iso(NU - DAG), reviewedAt: ts(NU - H), videoURL: "https://eksempel.invalid/gammel", videoPath: "submissions/p1/gammel.mp4" })
  },
  submissionVideos: {
    traening: vid("traening"), afventer6: vid("afventer6"), afventer7: vid("afventer7"),
    duelSet: vid("duelSet", { decided: true, viewedAt: ts(NU - 2 * H) }), duelFrist: vid("duelFrist", { decided: true }), duelUng: vid("duelUng", { decided: true, viewedAt: ts(NU - 10 * 60000) })
  }
};
a = await start("u-traener", { ekstra });
await a.page.evaluate(() => showPage("review")); await a.page.waitForTimeout(600);
w = await a.skrivninger();
const slettedeFiler = w.filter(x => x.type === "sletfil").map(x => x.sti.split("/").pop()).sort();
t("filerne, der slettes: den behandlede træningsvideo, den udløbne (7 dage + 1 min), den sete duelvideo, duelvideoen efter 2 døgn og den gamle træningsvideo",
  JSON.stringify(slettedeFiler) === JSON.stringify(["afventer7.mp4", "duelFrist.mp4", "duelSet.mp4", "gammel.mp4", "traening.mp4"]), slettedeFiler);
t("træningsvideoen mister hele submissionVideos-dokumentet (som ved godkendelse)", w.some(x => x.type === "delete" && x.navn === "submissionVideos" && x.id === "traening"), w);
t("de andre får linket fjernet (videoURL null) - på submissionVideos, eller på indsendelsen for en gammel video",
  ["afventer7", "duelSet", "duelFrist"].every(id => w.some(x => x.navn === "submissionVideos" && x.id === id && x.data.videoURL === null && x.data.videoDeletedAt))
  && w.some(x => x.navn === "submissions" && x.id === "gammel" && x.data.videoURL === null), w.filter(x => x.type === "set"));
t("6 dage og 23 timer gammel ubehandlet video bliver, og duelvideoen, der lige er set eller afgjort for et døgn siden, bliver",
  !w.some(x => ["afventer6", "duelUng"].includes(x.id)), w);
const tekst = await a.page.evaluate(() => document.getElementById("reviewArea").innerText);
t("træneren ser den udløbne video som udløbet, som før", /udløbet og slettet efter 7 dage/.test(tekst));
t("ingen JS-fejl hos træneren", !a.fejl.length, a.fejl);
await a.slut();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
