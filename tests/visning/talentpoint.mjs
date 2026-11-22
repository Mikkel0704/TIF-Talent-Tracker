// Pointreglerne 2026-11-25: Talentmærket og dueller giver ingen point - hverken på ranglisten
// eller i det, familien og træneren ser. Talentmærket er stadig sit eget: beståede øvelser,
// optjente og overrakte medaljer vises som før, bare uden point. De gamle tal står stadig i
// databasen (players.points, submissions.pointsAwarded) og skrives som før, så beslutningen kan
// vendes - men intet viser eller tæller dem.
// Hele appen køres uændret mod efterligningen i stoette/firebase-stedfortraeder.js.
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

const NU = "2026-11-18T12:00:00+01:00";
const aar = { year: "2017", gender: "dreng" };
const N1B = ["Jonglering", "Præcision", "Modtag & Afslut", "Finter", "Kontrol"].map(ex => "s0_" + ex);
// Oscar: hele N1 Bronze bestået og overrakt, Jonglering på N1 Sølv bestået, 500 gamle
// Talentmærke-point på spilleren og en gammel historiklinje med point. Fodteknik i går: 3 ×
// toe-taps = 6 + 5 i kombi = 11 point - det eneste, der tæller.
const DATA = () => ({
  users: {
    tr: { email: "t@x.invalid", role: "coach", years: ["2017"], ...ok_ },
    sp: { email: "o@x.invalid", role: "player", playerId: "p1", years: ["2017"], ...ok_ }
  },
  players: {
    p1: { name: "Oscar Test", ...aar, points: 500, hasActiveLogin: true,
      passed: { ...Object.fromEntries(N1B.map(k => [k, true])), "s1_Jonglering": true },
      medals: { "0": { at: "2026-11-10T10:00:00Z", by: "t@x.invalid" } },
      history: [{ type: "submission_approved", text: "Jonglering · N1 B godkendt via video: +25 point", by: "t@x.invalid", at: "2026-11-01T10:00:00Z" }] },
    p2: { name: "Bo Test", ...aar, points: 0, passed: {}, history: [], hasActiveLogin: true }
  },
  footwork: { p1: { ...aar, days: { "2026-11-17": { t: 3 } } } },
  challenges: {
    c1: { type: "exercise", exercise: "Kontrol", stepIndex: 0, level: 1, medal: "Bronze", challengerId: "p1", challengerName: "Oscar Test", opponentId: "p2", opponentName: "Bo Test", ...aar, status: "active" },
    c2: { type: "freestyle", title: "Flest jongleringer", challengerId: "p2", challengerName: "Bo Test", opponentId: "p1", opponentName: "Oscar Test", ...aar, status: "active" }
  },
  submissions: {
    s1: { playerId: "p1", playerName: "Oscar Test", ...aar, exercise: "Præcision", stepIndex: 1, status: "pending", submittedAt: "2026-11-17T10:00:00Z" },
    s2: { playerId: "p1", playerName: "Oscar Test", ...aar, exercise: "Jonglering", stepIndex: 1, status: "pending", submittedAt: "2026-11-17T10:01:00Z" },
    s3: { playerId: "p2", playerName: "Bo Test", ...aar, exercise: "Kontrol", stepIndex: 0, status: "pending", challengeId: "c1", challengerId: "p1", opponentId: "p2", submittedAt: "2026-11-17T10:02:00Z" },
    s4: { playerId: "p1", playerName: "Oscar Test", ...aar, exercise: "Flest jongleringer", status: "pending", challengeId: "c2", challengerId: "p2", opponentId: "p1", submittedAt: "2026-11-17T10:03:00Z" },
    s5: { playerId: "p2", playerName: "Bo Test", ...aar, exercise: "Flest jongleringer", status: "pending", challengeId: "c2", challengerId: "p2", opponentId: "p1", submittedAt: "2026-11-17T10:04:00Z" }
  },
  rangliste: { p1: { name: "Oscar Test", ...aar, kanUdfordres: true, total: 11, uge: { fra: "2026-11-16", point: 11 }, maaned: { fra: "2026-11-01", point: 11 }, regler: /const POINTREGLER = "([^"]+)"/.exec(html)[1] } }
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
    [DATA(), { uid, email: DATA().users[uid].email }, PV]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const gaaTil = async id => { await page.click("#tab-" + id); await page.waitForTimeout(200); };
  const tekst = s => page.evaluate(x => (document.querySelector(x)?.innerText || "").replace(/\s+/g, " "), s);
  const dialog = () => page.evaluate(() => { const d = document.getElementById("appDialog"); return d && !d.classList.contains("hidden") ? document.getElementById("dialogTekst").textContent : null; });
  const svar = async ja => { await page.click(ja ? "#dialogJa" : "#dialogNej"); await page.waitForTimeout(300); };
  const skrivninger = () => page.evaluate(() => window.__skrivninger);
  return { page, fejl, nativ: () => nativ, gaaTil, tekst, dialog, svar, skrivninger, luk: () => ctx.close() };
}
const plusPoint = /\+\s*\d+\s*point|udfordringsbonus/i;
// Den seneste skrivning paa et dokument med et bestemt felt.
const sidste = (w, navn, id, felt) => [...w].reverse().find(x => x.navn === navn && x.id === id && felt in (x.data || {}))?.data;

// ------------------------------------------------------------------ træneren godkender
console.log("\nTræneren godkender videoer - uden point i det, der vises og skrives i historikken");
let a = await aabn("tr");
await a.gaaTil("review");
const godkendelser = await a.tekst("#review");
t("Godkendelser siger, at Talentmærket giver medaljer, ikke point", /Godkendelse markerer øvelsen som bestået\. Talentmærket giver medaljer, ikke point\./.test(godkendelser)
  && !/giver spilleren point/.test(godkendelser), godkendelser.slice(0, 300));
t("og listen af videoer nævner ingen point", !/point/i.test(await a.tekst("#reviewArea")), await a.tekst("#reviewArea"));

await a.page.evaluate(() => { reviewSubmission("s1", true); }); await a.page.waitForTimeout(400);
t("en ny øvelse godkendes uden dialog", (await a.dialog()) === null && a.nativ() === 0);
let w = await a.skrivninger();
let sp = sidste(w, "players", "p1", "history");
t("historiklinjen: øvelse, niveau og 'godkendt via video' - uden point", sp?.history?.[0]?.text === "Præcision · N1 S godkendt via video", sp?.history?.[0]);
t("øvelsen er bestået", sp?.passed?.["s1_Præcision"] === true);
t("de gamle tal skrives stadig (kan vendes): players.points 500 + 35 og pointsAwarded 35",
  sp?.points === 535 && sidste(w, "submissions", "s1", "pointsAwarded")?.pointsAwarded === 35, { points: sp?.points, s1: sidste(w, "submissions", "s1", "pointsAwarded") });
t("den gamle historiklinje står, som den blev gemt", sp?.history?.[1]?.text === "Jonglering · N1 B godkendt via video: +25 point");

await a.page.evaluate(() => { reviewSubmission("s2", true); }); await a.page.waitForTimeout(300);
const igen = await a.dialog();
t("en allerede bestået øvelse: dialogen spørger uden at nævne point",
  /Jonglering · N1 S er allerede registreret bestået for Oscar Test/.test(igen || "") && /Godkend videoen alligevel\?/.test(igen || "") && !/point/i.test(igen || ""), igen);
await a.svar(true);
w = await a.skrivninger();
sp = sidste(w, "players", "p1", "history");
t("og historiklinjen siger 'allerede bestået' - ikke 'ingen nye point'", sp?.history?.[0]?.text === "Jonglering · N1 S godkendt via video · allerede bestået", sp?.history?.[0]);

await a.page.evaluate(() => { reviewSubmission("s3", true); }); await a.page.waitForTimeout(400);
w = await a.skrivninger();
const bo = sidste(w, "players", "p2", "history");
t("en øvelsesduel: 'vandt duellen' i stedet for '+25 udfordringsbonus' og point", bo?.history?.[0]?.text === "Kontrol · N1 B godkendt via video · vandt duellen", bo?.history?.[0]);
t("duellen er afgjort til Bo", sidste(w, "challenges", "c1", "winnerId")?.winnerId === "p2");
t("og de gamle tal skrives stadig: N1 B (25) + duellen (25) = 50", bo?.points === 50 && sidste(w, "submissions", "s3", "pointsAwarded")?.pointsAwarded === 50, bo?.points);

await a.page.waitForTimeout(200);
t("den frie duel står klar til afgørelse - uden point", /Frie udfordringer klar til afgørelse/.test(await a.tekst("#reviewArea")) && !plusPoint.test(await a.tekst("#reviewArea")));
await a.page.evaluate(() => { judgeFreestyleChallenge("c2", "p1"); }); await a.page.waitForTimeout(400);
w = await a.skrivninger();
sp = sidste(w, "players", "p1", "history");
t("en fri duel: 'Vandt fri udfordring' uden '+25 point'", sp?.history?.[0]?.text === 'Vandt fri udfordring "Flest jongleringer"', sp?.history?.[0]);
t("og de gamle tal skrives stadig", sidste(w, "submissions", "s4", "pointsAwarded")?.pointsAwarded === 25 && typeof sp?.points === "number");
t("ingen ny historiklinje nævner point", w.filter(x => x.navn === "players").every(x => !(x.data.history || []).slice(0, 1).some(h => /point/i.test(h.text))),
  w.filter(x => x.navn === "players").map(x => x.data.history?.[0]?.text));
t("intet '+N point' på godkendelsessiden bagefter", !plusPoint.test(await a.tekst("#review")));

console.log("\nTræneren ser Oscars profil og registrering");
await a.page.evaluate(() => { openPlayerProfile("p1"); }); await a.page.waitForTimeout(300);
let profil = await a.tekst("#profileArea");
t("pointtallet er kun fodteknik og stige: 11 - ikke de gamle Talentmærke-point", /(^| )11 point · 139 point til ⚽ Klubspiller/.test(profil) && !/(^| )(5\d\d) point/.test(profil), profil.slice(0, 400));
t("rangen følger: Debutant", /👟 Debutant/.test(profil));
t("niveauerne og medaljerne vises som før", /N1 Bronze: 5\/5/.test(profil) && /N1 Sølv: [12]\/5/.test(profil) && /🏅 N1 B/.test(profil) && /Overrakt/.test(profil), profil);
t("historikken viser de nye linjer uden point og den gamle, som den blev gemt",
  /Vandt fri udfordring "Flest jongleringer"/.test(profil) && /Præcision · N1 S godkendt via video/.test(profil) && /Jonglering · N1 B godkendt via video: \+25 point/.test(profil), profil);
await a.page.evaluate(() => { selectProfileForTracking("p1"); }); await a.page.waitForTimeout(300);
const reg = await a.tekst("#trackingArea");
t("registreringen: medaljen står, og trinbjælken med beståede øvelser", /🏅 Medaljer/.test(reg) && /N1 B-medalje/.test(reg) && /Overrakt/.test(reg) && /N1 Bronze ✓/.test(reg), reg.slice(0, 400));
{
  // Talentmaerkets dele: trinbjaelken og medaljerne foer stigen, og trinnet med oevelserne efter fodteknikken.
  const foerStigen = reg.split("Jongleringsstigen ·")[0], trinnet = reg.split("Aktuelt trin:")[1] || "";
  t("og ingen point for Talentmærket - kun stigen og fodteknikken har point", !/point/i.test(foerStigen) && !/point/i.test(trinnet) && /Niveau 1 · Sølv/.test(trinnet), { foerStigen, trinnet });
}
t("ingen JS-fejl", a.fejl.length === 0, a.fejl);
await a.luk();

// ------------------------------------------------------------------ spilleren selv
console.log("\nSpilleren: Talentmærket og Duel uden point");
a = await aabn("sp");
await a.gaaTil("training");
const tm = await a.tekst("#training");
t("Talentmærket viser rang og niveau - men intet pointtal", /👟 Oscar Test · Debutant/.test(tm) && /Aktuelt niveau: N1 S/.test(tm) && !/\d+ point/.test(tm), tm.slice(0, 300));
t("beståede øvelser står som før", /Jonglering ✓ Bestået/.test(tm), tm);
await a.gaaTil("challenges");
const duelSide = await a.tekst("#challenges");
t("duel-teksten lover ingen bonus", /vinder duellen\./.test(duelSide) && !/bonus/i.test(duelSide) && !plusPoint.test(duelSide), duelSide.slice(0, 300));
await a.gaaTil("profile");
profil = await a.tekst("#profileArea");
t("profilen: 11 point - samme tal som ranglisten", /(^| )11 point · 139 point til ⚽ Klubspiller/.test(profil), profil.slice(0, 300));
t("og medaljerne står der stadig", /Medaljer/.test(profil) && /🏅 N1 B/.test(profil) && /Overrakt/.test(profil), profil);
await a.gaaTil("leaderboard");
const guide = (await a.page.evaluate(() => document.getElementById("guideIntroOn")?.closest(".accordion-body")?.textContent || "")).replace(/\s+/g, " ");
t("guiden: kun Fodteknik og Jonglering tæller på ranglisten", /Kun point fra Fodteknik og Jonglering tæller med\. Talentmærket og dueller giver ingen point - de belønnes med medaljer og sejre\./.test(guide), guide.slice(0, 200));
t("guiden: topscoreren er fodteknik og Jongleringsstigen", /flest point i måneden - fra fodteknik og Jongleringsstigen\./.test(guide) && !/godkendte videoer i Talentmærket og vundne dueller/.test(guide));
await a.page.evaluate(() => { openPrivacy(); }); await a.page.waitForTimeout(200);
const priv = (await a.tekst("#privacy"));
t("databehandling: topscoreren tæller Daglig fodteknik og Jongleringsstigen", /flest point i måneden \(Daglig fodteknik og Jongleringsstigen\)/.test(priv) && !/vundne dueller/.test(priv));
t("databehandling: historik-eksemplet er uden point", /"Jonglering · N1 B godkendt via video"/.test(priv) && !/\+25 point/.test(priv));
t("samtykket: godkendelse til træning giver medaljen på samme måde", /så får man medaljen på samme måde/.test(html) && !/så får man medaljen, men ingen point/.test(html));
t("ingen JS-fejl", a.fejl.length === 0 && a.nativ() === 0, a.fejl);
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
