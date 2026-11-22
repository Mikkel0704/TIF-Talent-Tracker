// PARITET for morgenoprydningen: serveren (functions/oprydning.js) skal slette PRAECIS det,
// appens egen oprydning i en traeners browser sletter - samme filer, samme dokumenter, samme
// felter - for de samme data paa det samme tidspunkt.
//
// HELE index.html startes uaendret i en rigtig browser (mod den efterlignede Firebase i
// tests/visning/stoette/firebase-stedfortraeder.js), logget ind som admin, med uret laast og
// dansk tidszone. Siden aabner Godkendelser, og dens sweepExpiredVideos() og
// sweepFootworkJokerReasons() koerer, som de goer for en admin. Det, siden goer (slettede
// filer, slettede dokumenter, fjernede links og begrundelser), sammenlignes med det, serveren
// goer mod en efterlignet Admin-database med de samme dokumenter. Data er tilfaeldige med
// fast froe og ligger tæt om graenserne: 7 dage fra upload, 2 doegn fra afgoerelsen, en time
// fra "set", 3 doegn fra en jokers afgoerelse - og med gamle videoer (link paa indsendelsen),
// allerede ryddede links og stier uden for videomappen.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { rydOp } from "../../functions/oprydning.js";
const { chromium } = createRequire(import.meta.url)("playwright");

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const stedfortraeder = readFileSync(new URL("../visning/stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PRIVACY = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra).slice(0, 1500) : ""))); };
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Fast froe (mulberry32).
function tilfaeldig(froe){ return () => { froe |= 0; froe = froe + 0x6D2B79F5 | 0; let x = Math.imul(froe ^ froe >>> 15, 1 | froe); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
const H = 3600 * 1000, DAG = 24 * H, MIN = 60 * 1000;

function lavData(nu, froe){
  const r = tilfaeldig(froe), vaelg = xs => xs[Math.floor(r() * xs.length)];
  const ms = nu.getTime(), iso = x => new Date(x).toISOString(), ts = x => ({ seconds: Math.floor(x / 1000), nanoseconds: 0 });
  // Taet om en graense: lige foer, lige efter, eller et godt stykke fra.
  const omkring = g => g + vaelg([-MIN, MIN, -H, H, -3 * DAG, 2 * DAG, 0]);
  const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: new Date(ms).toISOString(), privacyVersion: PRIVACY };
  const db = { users: { "u-admin": { email: "admin@x.invalid", role: "admin", years: ["2017", "2016"], ...ok_ } },
    players: {}, submissions: {}, submissionVideos: {}, footworkLog: {} };
  for(let i = 0; i < 8; i++){
    const year = i % 2 ? "2016" : "2017";
    db.players["p" + i] = { name: "Barn " + i, year, gender: "dreng", points: 0, passed: {}, history: [] };
    const reasons = {};
    for(let j = 0; j < 4; j++){
      const dato = "2026-10-" + String(10 + j).padStart(2, "0");
      const afgjort = r() < 0.75;
      reasons[dato] = { at: iso(ms - 10 * DAG), by: "u" + i };
      if(r() < 0.85) reasons[dato].tekst = vaelg(["syg", "ferie", "til fødselsdag"]);
      if(afgjort) Object.assign(reasons[dato], { afgjort: vaelg(["approved", "rejected"]), afgjortAf: "t@x.invalid", afgjortAt: iso(omkring(ms - 3 * DAG)) });
    }
    db.footworkLog["p" + i] = { year, gender: "dreng", entries: [], reasons };
  }
  for(let i = 0; i < 40; i++){
    const id = "s" + i, pid = "p" + (i % 8), year = (i % 8) % 2 ? "2016" : "2017";
    const status = vaelg(["pending", "approved", "rejected"]), duel = r() < 0.5, gammel = r() < 0.15;
    const sti = r() < 0.08 ? "guides/f_v/1_guide.mp4" : `submissions/u-${pid}/${i}.mp4`;
    const url = r() < 0.1 ? null : "https://eksempel.invalid/" + i;
    const sub = { playerId: pid, playerName: "Barn", year, gender: "dreng", exercise: "Jonglering", stepIndex: 0, status,
      submittedAt: iso(omkring(ms - vaelg([7 * DAG, 2 * DAG, 8 * DAG]))) };
    if(duel){ sub.challengeId = "c" + i; sub.challengerId = pid; sub.opponentId = "p9"; }
    if(status !== "pending") sub.reviewedAt = ts(omkring(ms - vaelg([2 * DAG, H, 3 * DAG])));
    if(gammel){ sub.videoURL = url; sub.videoPath = sti; if(r() < 0.5 && status !== "pending") sub.viewedAt = ts(omkring(ms - H)); }
    else {
      const v = { playerId: pid, year, gender: "dreng", videoURL: url, videoPath: sti, decided: status !== "pending", submittedAt: sub.submittedAt };
      if(duel){ v.challengeId = sub.challengeId; v.challengerId = pid; v.opponentId = "p9"; if(status !== "pending" && r() < 0.5) v.viewedAt = ts(omkring(ms - H)); }
      db.submissionVideos[id] = v;
    }
    db.submissions[id] = sub;
  }
  return db;
}

// --- browseren --------------------------------------------------------------------------
const browser = await chromium.launch();
async function siden(db, nu){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen", locale: "da-DK" });
  const page = await ctx.newPage();
  const fejl = [];
  page.on("pageerror", e => fejl.push(e.message));
  page.on("dialog", d => d.dismiss());
  await page.route("**/*", route => {
    const u = route.request().url();
    if(u === "https://app.test/") return route.fulfill({ contentType: "text/html", body: html });
    if(u.startsWith("https://www.gstatic.com/firebasejs/")) return route.fulfill({ contentType: "application/javascript", body: stedfortraeder });
    return route.abort();
  });
  await page.clock.setFixedTime(nu);
  await page.addInitScript(([d, bruger]) => { window.__db = d; window.__bruger = bruger; window.__skrivninger = []; }, [db, { uid: "u-admin", email: "admin@x.invalid" }]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => showPage("review"));
  await page.waitForTimeout(800);
  const w = await page.evaluate(() => window.__skrivninger);
  await ctx.close();
  return { w, fejl };
}
// Det, siden gjorde, i en form, der kan sammenlignes.
function sidensHandlinger(w){
  return {
    filer: w.filter(x => x.type === "sletfil").map(x => x.sti).sort(),
    slettedeDokumenter: w.filter(x => x.type === "delete").map(x => x.navn + "/" + x.id).sort(),
    linkFjernet: w.filter(x => x.type === "set" && x.data && "videoURL" in x.data && x.data.videoURL === null && x.data.videoDeletedAt).map(x => x.navn + "/" + x.id).sort(),
    begrundelser: w.filter(x => x.type === "set" && x.navn === "footworkLog" && x.data?.reasons).flatMap(x => Object.keys(x.data.reasons).map(d => x.id + "/" + d)).sort()
  };
}

// --- serveren mod en efterlignet Admin-database ---------------------------------------------
const SLET = { slet: true }, TID = { tid: true };
async function serveren(db, nu){
  const akt = [];
  const fdb = { collection: navn => ({ get: async () => {
    const docs = Object.entries(db[navn] || {}).map(([id, d]) => ({ id, data: () => structuredClone(d), get: f => structuredClone(d[f]),
      ref: { set: async (data, valg) => akt.push({ type: "set", navn, id, data, merge: !!valg?.merge }), delete: async () => akt.push({ type: "delete", navn, id }) } }));
    return { size: docs.length, docs };
  } }) };
  const bucket = { file: sti => ({ delete: async () => akt.push({ type: "sletfil", sti }) }) };
  const svar = await rydOp({ db: fdb, bucket, FieldValue: { delete: () => SLET, serverTimestamp: () => TID }, logger: null }, nu);
  return { svar, handlinger: {
    filer: akt.filter(x => x.type === "sletfil").map(x => x.sti).sort(),
    slettedeDokumenter: akt.filter(x => x.type === "delete").map(x => x.navn + "/" + x.id).sort(),
    linkFjernet: akt.filter(x => x.type === "set" && x.merge && x.data.videoURL === null && x.data.videoDeletedAt === TID).map(x => x.navn + "/" + x.id).sort(),
    begrundelser: akt.filter(x => x.type === "set" && x.navn === "footworkLog" && x.merge).flatMap(x => Object.entries(x.data.reasons)
      .filter(([, v]) => v.tekst === SLET && Object.keys(v).length === 1).map(([d]) => x.id + "/" + d)).sort()
  } };
}

const TIDER = [
  ["en morgen kl. 05:00 (vintertid)", "2026-11-22T04:00:00Z", 101],
  ["en eftermiddag", "2026-11-25T15:37:00Z", 202],
  ["en sommerdag kl. 05:00", "2027-06-14T03:00:00Z", 303],
  ["dagen efter sommertid slutter", "2026-10-26T12:00:00Z", 404]
];
for(const [navn, tid, froe] of TIDER){
  console.log(`\nParitet · oprydningen · ${navn}`);
  const nu = new Date(tid), db = lavData(nu, froe);
  const { w, fejl } = await siden(db, nu);
  const side = sidensHandlinger(w);
  const { svar, handlinger: server } = await serveren(db, nu);
  t("siden startede uden fejl", !fejl.length, fejl.slice(0, 3));
  t(`samme filer slettet (${server.filer.length})`, ens(side.filer, server.filer), { side: side.filer, server: server.filer });
  t(`samme submissionVideos-dokumenter slettet helt (${server.slettedeDokumenter.length})`, ens(side.slettedeDokumenter, server.slettedeDokumenter), { side: side.slettedeDokumenter, server: server.slettedeDokumenter });
  t(`samme links fjernet - på submissionVideos eller på en gammel indsendelse (${server.linkFjernet.length})`, ens(side.linkFjernet, server.linkFjernet), { side: side.linkFjernet, server: server.linkFjernet });
  t(`samme joker-begrundelser slettet (${server.begrundelser.length})`, ens(side.begrundelser, server.begrundelser), { side: side.begrundelser, server: server.begrundelser });
  t("ingen fil uden for videomappen er rørt - af nogen af dem", ![...side.filer, ...server.filer].some(f => !f.startsWith("submissions/")));
  const s = svar.video.slettet;
  t(`dataene rammer noget: ${s.behandlet} behandlede, ${s.udloebet} udløbne, ${s.set} sete, ${s.duelfrist} efter duel-fristen, ${svar.video.ugyldigSti} uden for mappen, ${svar.joker.ryddet} begrundelser`,
    s.behandlet + s.udloebet + s.set + s.duelfrist >= 5 && svar.joker.ryddet >= 3 && side.filer.length < Object.keys(db.submissions).length);
}

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
