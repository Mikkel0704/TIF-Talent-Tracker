// PARITET: serveren skal vise praecis de tal, en traener ser i dag.
//
// HELE index.html startes uaendret i en rigtig browser (mod den efterlignede Firebase i
// tests/visning/stoette/firebase-stedfortraeder.js), logget ind som admin, med uret
// laast og dansk tidszone. For hvert barn sammenlignes
//   - det, ranglisten paa siden VISER for All-time, Denne uge og Denne maaned, og
//   - sidens egen totalPoints(p)
// med serverens linje (functions/rangliste.js) for de SAMME data og det SAMME tidspunkt.
// Data er tilfaeldige med fast fro, saa en fejl kan genskabes.
//
// Pointreglerne 2026-11-25: Talentmaerkets point og duelpoint taeller ikke. Dataene har med
// vilje boern med players.points > 0 og godkendte indsendelser med pointsAwarded i ugen og
// maaneden - og testen viser, at linjerne er de samme som uden dem.
//
// Den eneste aendring af siden er én linje, der stilles foran den sidste Object.assign(window, ...)
// i den kopi, browseren faar, saa testen kan spoerge siden selv om totalPoints - filen roeres ikke.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beregnLinje, linjerEns, klubTop } from "../../functions/rangliste.js";
const { chromium } = createRequire(import.meta.url)("playwright");

const raa = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const KROG = "\nObject.assign(window,{";
const krogVed = raa.lastIndexOf(KROG);
if(krogVed < 0) throw new Error("fandt ikke den sidste Object.assign(window,{ i index.html - testen skal rettes");
const html = raa.slice(0, krogVed) + "\nwindow.__paritet = () => ({ uge: dagsISO(startOfWeek(new Date())), maaned: dagsISO(startOfMonth(new Date())), " +
  "spillere: players.map(p => ({ id: p.id, name: p.name, total: totalPoints(p) })), klubTop: lokalKlubTop() });" + raa.slice(krogVed);
const stedfortraeder = readFileSync(new URL("../visning/stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PRIVACY = /const PRIVACY_VERSION = "([^"]+)"/.exec(raa)[1];

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };

// --- tilfaeldige, men genskabelige data -------------------------------------------------
function fro(s){ return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
const KODER = ["t", "s", "d", "v", "p", "o", "y", "j", "l", "k", "c", "q", "x", "r", "i", "e", "w", "m", "n", "g"];
// Alle 14 tricks (pointreglerne 2026-11-28) og de fire udgaaede id'er fra 2026-11-23
// (inderside10/20, yderside10/20), som kan staa gemt og i loggen hos boern - de skal taelle
// som deres alias, og serierne goeres hele, ens paa siden og paa serveren.
const TRICKS = ["oploft", "vrist", "skiftefod", "laarfod", "hoved", "jordenrundt", "gribfod", "hoved10",
  "inderside3", "yderside3", "haelbagom3", "inderside5", "yderside5", "haelbagom5",
  "inderside10", "yderside10", "inderside20", "yderside20"];
const dag = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;  // TZ er dansk (rangliste.js)
const ugestart = nu => { const d = new Date(nu); d.setHours(0, 0, 0, 0); const w = d.getDay(); d.setDate(d.getDate() + (w === 0 ? -6 : 1 - w)); return d; };

function lavData(nu, seed){
  const r = fro(seed), heltal = (a, b) => a + Math.floor(r() * (b - a + 1)), vaelg = a => a[Math.floor(r() * a.length)];
  // Tidspunkter: mest de seneste 70 dage, men mange taet paa uge- og maanedsskiftet.
  const graenser = [ugestart(nu), new Date(nu.getFullYear(), nu.getMonth(), 1)];
  const tid = () => {
    if(r() < 0.35){ const g = vaelg(graenser).getTime(), ms = Math.floor((r() * 2 - 1) * 3 * 3600e3); return new Date(Math.min(g + ms, nu.getTime())); }
    return new Date(nu.getTime() - Math.floor(r() * 70 * 86400e3));
  };
  const AAR = ["2014", "2015", "2016", "2017", "2018", "U9"];
  const db = { users: { "u-admin": { email: "admin@x.invalid", role: "admin", years: ["2014", "2015", "2016", "2017", "2018"], active: true,
    mustChangePassword: false, privacyAcceptedAt: new Date().toISOString(), privacyVersion: PRIVACY } },
    players: {}, juggleLadder: {}, juggleLog: {}, footwork: {}, submissions: {} };
  const N = 12;
  for(let n = 0; n < N; n++){
    const id = "p" + String(n).padStart(2, "0") + Math.floor(r() * 1e6).toString(36);
    db.players[id] = { name: "Barn " + String(n).padStart(2, "0"), year: vaelg(AAR), gender: vaelg(["dreng", "pige", null]),
      points: n === 0 ? 0 : heltal(0, 40) * 5, hasActiveLogin: r() < 0.5, passed: {}, history: [] };
    if(n === 0) continue;   // ét barn uden noget som helst
    if(r() < 0.8){   // stigen
      const mainStep = heltal(0, 17), weakStep = heltal(0, 13);   // et trin over stigen skal klippes ens
      const tricks = TRICKS.filter(() => r() < 0.4);
      if(r() < 0.3) tricks.push(tricks[0] || "oploft", "ukendt");   // dubletter og skrald
      const entries = [];
      for(let k = 0, m = heltal(0, 25); k < m; k++){
        const type = vaelg(["main", "main", "weak", "trick", "correct"]);
        const v = type === "main" ? heltal(0, 17) : type === "weak" ? heltal(0, 13) : type === "trick" ? vaelg([...TRICKS, "ukendt"]) : undefined;
        entries.push({ t: type, ...(v !== undefined ? { v } : {}), at: tid().toISOString() });
        if(r() < 0.15) entries.push({ ...entries[entries.length - 1] });   // samme linje to gange
      }
      if(r() < 0.1) entries.push({ t: "main", v: 0 });                     // uden tidspunkt
      db.juggleLadder[id] = { mainStep, weakStep, tricks, year: db.players[id].year,
        ...(r() < 0.8 ? { days: [...new Set(entries.filter(e => e.at && e.t !== "correct").slice(0, 8).map(e => dag(new Date(e.at))))] } : {}) };
      db.juggleLog[id] = { entries, year: db.players[id].year };
    }
    if(r() < 0.85){   // fodteknik
      const days = {}, jokers = {}, jokerRequests = {};
      const start = new Date(nu); start.setDate(start.getDate() - heltal(5, 80));
      for(const d = new Date(start); d <= nu; d.setDate(d.getDate() + 1)){
        const iso = dag(d), x = r();
        if(x < 0.55){ const day = {}; for(let k = 0, m = heltal(1, 5); k < m; k++) day[vaelg(KODER)] = r() < 0.05 ? 12 : heltal(1, 4); days[iso] = day; }
        else if(x < 0.62) jokers[iso] = vaelg(["approved", "approved", "rejected"]);
        else if(x < 0.66) jokerRequests[iso] = true;
        if(x < 0.55 && r() < 0.04) jokers[iso] = "approved";   // godkendt joker paa en dag med registreringer
      }
      db.footwork[id] = { days, jokers, jokerRequests, year: db.players[id].year };
    }
    for(let k = 0, m = heltal(0, 8); k < m; k++){   // indsendelser
      const status = vaelg(["approved", "approved", "approved", "pending", "rejected"]);
      const at = tid();
      db.submissions["s" + id + k] = { playerId: id, status, pointsAwarded: vaelg([0, 25, 30, 35, 45, 50, 60]),
        ...(status !== "pending" && r() < 0.9 ? { reviewedAt: r() < 0.8 ? { __tid: Math.floor(at.getTime() / 1000) } : at.toISOString() } : {}) };
    }
  }
  return db;
}
// Serverens udgave af de samme dokumenter: Timestamps som Admin-SDK'ets (med toDate).
const somServer = v => (v && typeof v === "object" && "__tid" in v) ? { toDate: () => new Date(v.__tid * 1000) } : v;
function serverLinjer(db, nu){
  const subs = Object.entries(db.submissions).map(([id, s]) => ({ id, ...s, reviewedAt: somServer(s.reviewedAt) }));
  const ud = {};
  for(const [id, p] of Object.entries(db.players)){
    ud[id] = beregnLinje({ player: { id, ...p }, juggleLadderDoc: db.juggleLadder[id] || null, juggleLogDoc: db.juggleLog[id] || null,
      footworkDoc: db.footwork[id] || null, submissions: subs.filter(s => s.playerId === id) }, nu);
  }
  return ud;
}

// --- browseren --------------------------------------------------------------------------
const browser = await chromium.launch();
async function siden(db, nu){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Copenhagen", locale: "da-DK" });
  const page = await ctx.newPage();
  const fejl = [];
  page.on("pageerror", e => fejl.push(e.message));
  page.on("console", m => { if(m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) fejl.push(m.text()); });
  page.on("dialog", d => d.dismiss());
  await page.route("**/*", route => {
    const u = route.request().url();
    if(u === "https://app.test/") return route.fulfill({ contentType: "text/html", body: html });
    if(u.startsWith("https://www.gstatic.com/firebasejs/")) return route.fulfill({ contentType: "application/javascript", body: stedfortraeder });
    return route.abort();
  });
  await page.clock.setFixedTime(nu);
  await page.addInitScript(([d, bruger, privacy]) => {
    window.__db = d; window.__bruger = bruger; window.__skrivninger = [];
    try{ sessionStorage.setItem("tif-demo-consent-seen", privacy); }catch{}
  }, [db, { uid: "u-admin", email: "admin@x.invalid" }, PRIVACY]);
  await page.goto("https://app.test/");
  const antal = Object.keys(db.players).length;
  await page.waitForFunction(n => window.__paritet && window.__paritet().spillere.length === n, antal, { timeout: 10000 });
  await page.waitForTimeout(400);   // de oevrige lyttere (stige, fodteknik, indsendelser) faar deres foerste svar
  await page.click("#tab-leaderboard");
  const liste = async periode => {
    await page.evaluate(p => window.setLeaderboardPeriod(p), periode);
    return page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#leaderboardArea .player")].map(r =>
      [r.querySelector("b").textContent.replace(/^\S+\s/, "").trim(), Number(/(-?\d+) point/.exec(r.querySelector(".pill").textContent)?.[1])])));
  };
  const vist = { all: await liste("all"), week: await liste("week"), month: await liste("month") };
  const krog = await page.evaluate(() => window.__paritet());
  await ctx.close();
  return { vist, krog, fejl };
}

const TIDER = [
  ["onsdag midt i ugen", "2026-11-18T11:00:00Z"],
  ["mandag kl. 00:00:30 (ny uge)", "2026-11-15T23:00:30Z"],
  ["1/12 kl. 00:05 (ny maaned, ugen startede 30/11)", "2026-11-30T23:05:00Z"],
  ["mandag 26/10 kl. 00:30 (dagen efter skiftet til vintertid)", "2026-10-25T23:30:00Z"],
  ["soendag 15/11 kl. 23:59 (sidste minut af ugen, dagen efter fodteknik version 2)", "2026-11-15T22:59:00Z"]
];
for(const [i, [navn, iso]] of TIDER.entries()){
  console.log(`\nParitet · ${navn}`);
  const nu = new Date(iso);
  const db = lavData(nu, 20261115 + i);
  const server = serverLinjer(db, nu);
  const { vist, krog, fejl } = await siden(db, nu);
  const ider = Object.keys(db.players);
  t(`siden startede uden fejl og viser alle ${ider.length} boern i hver periode`,
    !fejl.length && ["all", "week", "month"].every(p => Object.keys(vist[p]).length === ider.length), { fejl: fejl.slice(0, 3), antal: Object.fromEntries(Object.entries(vist).map(([k, v]) => [k, Object.keys(v).length])) });
  const navn_ = id => db.players[id].name;
  const afvig = felt => ider.filter(id => felt(id)).map(id => ({ id, side: { all: vist.all[navn_(id)], week: vist.week[navn_(id)], month: vist.month[navn_(id)] }, server: server[id] }));
  let a = afvig(id => krog.spillere.find(p => p.id === id)?.total !== server[id].total);
  t("sidens totalPoints(p) == serverens total for hvert barn", !a.length, a);
  a = afvig(id => vist.all[navn_(id)] !== server[id].total);
  t("All-time paa ranglisten == serverens total", !a.length, a);
  a = afvig(id => vist.week[navn_(id)] !== server[id].uge.point);
  t("Denne uge paa ranglisten == serverens uge.point", !a.length, a);
  a = afvig(id => vist.month[navn_(id)] !== server[id].maaned.point);
  t("Denne maaned paa ranglisten == serverens maaned.point", !a.length, a);
  // v15.86: klubbens top 10 kun blandt boern med login - admin-kortets egen udregning
  // (lokalKlubTop) giver samme liste som serverens klubTop af linjerne.
  const serverTop = klubTop(ider.map(id => ({ id, ...server[id] }))).map(r => r.id + ":" + r.total);
  const sideTop = krog.klubTop.map(r => r.id + ":" + r.total);
  t(`klubbens top 10 paa siden (admin-kortet) == serverens - kun boern med login (${serverTop.length} af ${ider.length})`,
    JSON.stringify(sideTop) === JSON.stringify(serverTop) && krog.klubTop.every(r => db.players[r.id].hasActiveLogin === true), { side: sideTop, server: serverTop });
  a = afvig(id => server[id].kanUdfordres !== (db.players[id].hasActiveLogin === true));
  t("linjens kanUdfordres er barnets hasActiveLogin", !a.length, a);
  t("ugen og maaneden starter samme dag paa siden og paa serveren",
    ider.every(id => server[id].uge.fra === krog.uge && server[id].maaned.fra === krog.maaned), { side: [krog.uge, krog.maaned], server: [server[ider[0]].uge.fra, server[ider[0]].maaned.fra] });
  // De samme data uden Talentmaerkets point og uden indsendelser: linjerne skal vaere ens.
  const uden = serverLinjer({ ...db, players: Object.fromEntries(Object.entries(db.players).map(([id, p]) => [id, { ...p, points: 0 }])), submissions: {} }, nu);
  a = ider.filter(id => !linjerEns(server[id], uden[id])).map(id => ({ id, med: server[id], uden: uden[id] }));
  t("players.points og indsendelsernes pointsAwarded taeller ikke: hver linje er den samme uden dem", !a.length, a);
  a = ider.filter(id => vist.all[navn_(id)] !== uden[id].total || vist.week[navn_(id)] !== uden[id].uge.point || vist.month[navn_(id)] !== uden[id].maaned.point);
  t("og siden viser de samme tal som uden dem", !a.length, a);
  const maanedStart = new Date(nu.getFullYear(), nu.getMonth(), 1).getTime();
  const reviewMs = s => s.reviewedAt == null ? null : typeof s.reviewedAt === "object" ? s.reviewedAt.__tid * 1000 : Date.parse(s.reviewedAt);
  const medPoint = ider.filter(id => db.players[id].points > 0).length;
  const godkendtIMaaneden = Object.values(db.submissions).filter(s => s.status === "approved" && s.pointsAwarded > 0 && reviewMs(s) >= maanedStart).length;
  t(`dataene har Talentmaerke-point, der ikke maa taelle (${medPoint} boern med points > 0, ${godkendtIMaaneden} godkendte indsendelser med point i maaneden)`,
    medPoint >= 5 && godkendtIMaaneden >= 2);
  const ikkeNul = ider.filter(id => server[id].uge.point > 0).length, maanedNul = ider.filter(id => server[id].maaned.point > 0).length;
  t(`dataene rammer noget i begge vinduer (${ikkeNul} boern med ugepoint, ${maanedNul} med maanedspoint)`, ikkeNul >= 2 && maanedNul >= 3);
}

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
