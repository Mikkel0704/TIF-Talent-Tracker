// PARITET for Maanedens spiller og Maanedens topscorer: serveren skal kaare praecis det,
// appen kaarer i dag - begge priser, i samme raekkefoelge.
//
// HELE index.html startes uaendret i en rigtig browser (mod den efterlignede Firebase i
// tests/visning/stoette/firebase-stedfortraeder.js), logget ind som admin, med uret laast
// paa eller efter den 5. og dansk tidszone. Sidens egen kaarMaanedensSpiller() koerer, som
// den goer for en admin, og de poster, siden skriver (window.__skrivninger), sammenlignes
// felt for felt (undtagen beregnet) med det, functions/kaaring.js giver for de SAMME data og
// det SAMME tidspunkt - ogsaa raekkefoelgen paa tvaers af de to samlinger. Data er
// tilfaeldige med fast fro: fodteknik med jokere, indsendelser (medaljepoint efter
// godkendelsesdato), stigen og stigens log med fortrydelser, rettelser og trin uden for
// fremdriften.
//
// Den eneste aendring af siden er én linje foran den sidste Object.assign(window, ...) i den
// kopi, browseren faar, saa testen kan se, om kaaringen er faerdig - filen roeres ikke.
//
// Id'erne indeholder aldrig "aa": appen ordner lige vindere med localeCompare uden sprog,
// og paa dansk er "aa" = "å" (efter "z"), mens Node paa serveren sorterer engelsk. Se rapporten.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { alleKaaringerAtOprette } from "../../functions/kaaring.js";
const { chromium } = createRequire(import.meta.url)("playwright");

const raa = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const KROG = "\nObject.assign(window,{";
const krogVed = raa.lastIndexOf(KROG);
if(krogVed < 0) throw new Error("fandt ikke den sidste Object.assign(window,{ i index.html - testen skal rettes");
const html = raa.slice(0, krogVed) + "\nwindow.__kaaring = () => ({ hentet: maanedensHentet && topscorerHentet && footworkHentet && spillereHentet && indsendelserHentet && stigeHentet && stigeLogHentet, igang: kaaringIGang, " +
  "spillere: players.length, kaar: () => kaarMaanedensSpiller() });" + raa.slice(krogVed);
const stedfortraeder = readFileSync(new URL("../visning/stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PRIVACY = /const PRIVACY_VERSION = "([^"]+)"/.exec(raa)[1];

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };

// --- tilfaeldige, men genskabelige data -------------------------------------------------
function fro(s){ return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
const KODER = ["t", "s", "d", "v", "p", "o", "y", "j", "l", "k", "c", "q", "x", "r", "i", "e", "w", "m", "n", "g", "z"];
const dag = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;  // TZ er dansk (kaaring.js)
const TEGN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function lavData(nu, seed, { kaaringer = {}, topscorere = {} } = {}){
  const r = fro(seed), heltal = (a, b) => a + Math.floor(r() * (b - a + 1)), vaelg = a => a[Math.floor(r() * a.length)];
  const nytId = () => { for(;;){ let s = ""; for(let i = 0; i < 20; i++) s += vaelg(TEGN); if(!/aa/i.test(s)) return s; } };   // som Firestores auto-id'er
  const db = { users: { "u-admin": { email: "admin@x.invalid", role: "admin", years: ["2013", "2014", "2015", "2016", "2017", "2018"], active: true,
    mustChangePassword: false, privacyAcceptedAt: new Date().toISOString(), privacyVersion: PRIVACY } },
    players: {}, juggleLadder: {}, juggleLog: {}, footwork: {}, submissions: {}, maanedensSpiller: kaaringer, maanedensTopscorer: topscorere };
  // Et tilfaeldigt tidspunkt fra 20. oktober til nu, som tekst med dansk forskydning (som appen skriver at/reviewedAt).
  const start = new Date(2026, 9, 20).getTime();
  const tidspunkt = () => new Date(start + Math.floor(r() * (nu.getTime() - start))).toISOString();
  // 2018 har spillere, der aldrig traener. 2013 har kun fodteknik uden spiller.
  const AAR = ["2014", "2015", "2016", "2017", "2017", "U9", "2018", "U12"];
  const efterAar = {};
  for(let n = 0; n < 26; n++){
    const id = nytId();
    const year = n === 0 ? "" : n === 1 ? undefined : vaelg(AAR);   // uden aargang: noten eller 2017 (migratePlayer)
    db.players[id] = { name: "Barn " + String(n).padStart(2, "0"), ...(year !== undefined ? { year } : {}), ...(n === 0 ? { note: "U11 ny" } : {}),
      gender: vaelg(["dreng", "pige", null]), points: 0, passed: {}, history: [] };
    const norm = /^U\d+$/.test(year || "") ? String(2026 - Number(year.slice(1))) : year;
    if(norm === "2018") continue;
    (efterAar[norm] ||= []).push(id);
    if(r() < 0.12) continue;   // traener slet ikke
    // Et barn i samme aargang kopierer nogle gange en andens dage helt: lige stilling.
    const andre = (efterAar[norm] || []).filter(x => x !== id && db.footwork[x]);
    if(andre.length && r() < 0.2){ db.footwork[id] = JSON.parse(JSON.stringify(db.footwork[vaelg(andre)])); continue; }
    const days = {}, jokers = {}, jokerRequests = {};
    const flittig = r();
    for(const d = new Date(2026, 9, 20); d <= nu; d.setDate(d.getDate() + 1)){
      const iso = dag(d), x = r();
      if(x < flittig * 0.7){ const day = {}; for(let k = 0, m = heltal(1, 4); k < m; k++) day[vaelg(KODER)] = r() < 0.04 ? 12 : heltal(1, 3); days[iso] = day;
        if(r() < 0.05) jokers[iso] = "approved"; }             // godkendt joker paa en dag med registreringer
      else if(x < flittig * 0.7 + 0.05) jokers[iso] = vaelg(["approved", "rejected"]);
      else if(x < flittig * 0.7 + 0.08) jokerRequests[iso] = true;
    }
    if(r() < 0.1) days["ikke-en-dato"] = { t: 3 };
    db.footwork[id] = { days, jokers, jokerRequests, year: year || "2017" };
  }
  // Topscoreren: medaljer og stigen for de fleste boern - ogsaa dem, der ikke traener fodteknik.
  for(const [id, p] of Object.entries(db.players)){
    const year = p.year || "2017";
    for(let k = 0, m = heltal(0, 3); k < m; k++){
      db.submissions[nytId()] = { playerId: id, year, gender: p.gender, status: vaelg(["approved", "approved", "approved", "pending", "rejected"]),
        reviewedAt: tidspunkt(), pointsAwarded: vaelg([25, 35, 50, 65, 80]) };
    }
    if(r() < 0.25) continue;
    const mainStep = heltal(0, 16), weakStep = heltal(0, 12);
    const tricks = ["oploft", "vrist", "skiftefod", "inderside5", "inderside10", "gribfod", "jordenrundt", "hoved10"].filter(() => r() < 0.4);
    const entries = [];
    for(let v = 0; v < mainStep; v++) entries.push({ t: "main", v, at: tidspunkt() });
    for(let v = 0; v < weakStep; v++) entries.push({ t: "weak", v, at: tidspunkt() });
    tricks.forEach(v => entries.push({ t: "trick", v, at: tidspunkt() }));
    if(r() < 0.5) entries.push({ t: "main", v: mainStep, at: tidspunkt() });                 // trin, traeneren har rettet ned
    if(r() < 0.5 && mainStep) entries.push({ t: "main", v: heltal(0, mainStep - 1), at: tidspunkt() });   // samme trin igen
    if(r() < 0.3) entries.push({ t: "correct", stige: "main", fra: mainStep + 2, til: mainStep, at: tidspunkt() });
    entries.sort((a, b) => b.at.localeCompare(a.at));                                         // nyeste foerst, som appen gemmer dem
    db.juggleLadder[id] = { year, gender: p.gender, mainStep, weakStep, tricks };
    db.juggleLog[id] = { year, gender: p.gender, entries };
  }
  // Medaljer til et barn, der ikke findes.
  db.submissions["ingen-spiller"] = { playerId: "findes-ikke", year: "2017", status: "approved", reviewedAt: tidspunkt(), pointsAwarded: 999 };
  db.footwork["forældreløs"] = { year: "2013", days: { "2026-11-03": { t: 2 } } };
  return db;
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
  await page.waitForFunction(n => window.__kaaring && window.__kaaring().hentet && window.__kaaring().spillere === n, antal, { timeout: 10000 });
  // Kaaringen planlaegges 1,2 s efter, at alt er hentet. Vent, til den har koert og er faerdig.
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => !window.__kaaring().igang, null, { timeout: 10000 });
  const skrevet = () => page.evaluate(() => window.__skrivninger.filter(x => x.navn === "maanedensSpiller" || x.navn === "maanedensTopscorer")
    .map(x => ({ samling: x.navn, type: x.type, id: x.id, merge: x.merge, data: x.data })));
  const poster = await skrevet();
  // Og én gang til, kaldt direkte: siden finder nu intet at goere.
  await page.evaluate(() => window.__kaaring().kaar());
  const igen = (await skrevet()).length - poster.length;
  await ctx.close();
  return { poster, igen, fejl };
}

const uden = d => { const { beregnet, ...rest } = d || {}; return rest; };
const liste = samling => Object.entries(samling || {}).map(([id, d]) => ({ id, ...d }));
const medId = db => ({ spillere: liste(db.players), fodteknik: liste(db.footwork), indsendelser: liste(db.submissions),
  stiger: liste(db.juggleLadder), stigelogge: liste(db.juggleLog), kaaringer: liste(db.maanedensSpiller), topscorere: liste(db.maanedensTopscorer) });
const sti = k => k.samling + "/" + k.id;
const TILFAELDE = [
  // Reserven kaarer tidligst kl. 05:30 dansk tid (og 04:00 UTC) den 5. - serveren kl. 05:00.
  ["5. december kl. 05:30 (november) - det tidligste, reserven kaarer", "2026-12-05T04:30:00Z", {}],
  ["7. januar kl. 09 (november og december - to maaneder hales ind)", "2027-01-07T08:00:00Z", {}],
  ["5. februar kl. 05:30 med november gemt i nogle aargange (med andre vindere end tallene giver) og uden topscorer", "2027-02-05T04:30:00Z", { gemt: true }],
  ["4. december kl. 23:59 (intet afgjort endnu)", "2026-12-04T22:59:00Z", {}],
  ["6. januar kl. 12 med november kaaret i alle aargange og topscorer gemt i nogle (to maaneder, men kun én mangler de fleste steder)", "2027-01-06T11:00:00Z", { foerNov: true }],
  ["5. december kl. 05:29 - serveren har kaaret kl. 05, reserven venter endnu", "2026-12-05T04:29:00Z", { reserveVenter: true }]
];
for(const [i, [navn, iso, valg]] of TILFAELDE.entries()){
  console.log(`\nParitet · Maanedens spiller og topscorer · ${navn}`);
  const nu = new Date(iso);
  let db = lavData(nu, 20261205 + i);
  if(valg.gemt){
    // Gem november i 2017 og 2015 med en tilfaeldig vinder (ikke den, tallene ville give),
    // og 2014 uden vindere.
    const ider = aar => Object.entries(db.players).filter(([, p]) => (p.year === aar || (aar === "2017" && p.year === "U9"))).map(([id]) => id);
    const k = {};
    for(const aar of ["2017", "2015"]){ const id = ider(aar).at(-1); k["2026-11_" + aar] = { maaned: "2026-11", aargang: aar, vindere: [{ id, navn: db.players[id].name, dage: 1, minutter: 0.5, oevelser: 1, point: 2 }] }; }
    k["2026-11_2014"] = { maaned: "2026-11", aargang: "2014", vindere: [] };
    db = lavData(nu, 20261205 + i, { kaaringer: k });
  }
  if(valg.foerNov){
    // Lad serveren kaare november en dag i december, og gem det. Topscorerne i 2017 og 2016
    // fjernes igen (som hvis en koersel stoppede efter Maanedens spiller), og 2015 faar en
    // topscorer med en anden vinder end tallene giver.
    const dec = new Date("2026-12-10T05:00:00+01:00");
    const nov = alleKaaringerAtOprette(medId(db), dec);
    const k = {}, top = {};
    nov.forEach(x => { (x.samling === "maanedensSpiller" ? k : top)[x.id] = x.post; });
    delete top["2026-11_2017"]; delete top["2026-11_2016"];
    if(top["2026-11_2015"]) top["2026-11_2015"] = { ...top["2026-11_2015"], vindere: [{ id: "x", navn: "Gemt", point: 1, oevelser: 0, svaer: 0, mellem: 0, let: 0, starter: 0 }] };
    db = lavData(nu, 20261205 + i, { kaaringer: k, topscorere: top });
  }
  const server = alleKaaringerAtOprette(medId(db), nu);
  const { poster, igen, fejl } = await siden(db, nu);
  t("siden startede uden fejl", !fejl.length, fejl.slice(0, 3));
  if(valg.reserveVenter){
    t(`serveren kaarer (${server.length} poster), men siden opretter intet foer kl. 05:30`, server.length > 0 && poster.length === 0, poster.map(sti));
    continue;
  }
  const sp = server.filter(k => k.samling === "maanedensSpiller").length, tp = server.length - sp;
  t(`siden og serveren opretter de samme ${server.length} poster (${sp} Maanedens spiller, ${tp} topscorer) i samme raekkefoelge`,
    JSON.stringify(poster.map(sti)) === JSON.stringify(server.map(sti)), { side: poster.map(sti), server: server.map(sti) });
  const afvig = server.map((k, j) => ({ id: sti(k), side: uden(poster[j]?.data), server: k.post }))
    .filter(x => JSON.stringify(x.side) !== JSON.stringify(x.server));
  t("hver post er ens felt for felt - Maanedens spiller (id, navn, dage, minutter, oevelser, point) og topscorer (id, navn, point, oevelser, svaer, mellem, let, starter) - undtagen beregnet",
    !afvig.length, afvig.slice(0, 2));
  t("hver topscorer kommer lige efter Maanedens spiller for samme maaned og aargang - eller den var gemt i forvejen",
    server.every((k, j) => k.samling !== "maanedensTopscorer" || (server[j - 1]?.samling === "maanedensSpiller" && server[j - 1].id === k.id) || db.maanedensSpiller[k.id]));
  t("siden skriver hele poster (ikke merge) med et beregnet-tidsstempel", poster.every(p => p.type === "set" && !p.merge && p.data.beregnet?.seconds > 0));
  t("ingen post for en aargang uden spillere (2013) - og intet for gemte maaneder",
    !server.some(k => k.aargang === "2013" || (k.samling === "maanedensSpiller" ? db.maanedensSpiller : db.maanedensTopscorer)[k.id]));
  t("ingen topscorer er ogsaa Maanedens spiller for samme maaned og aargang", server.filter(k => k.samling === "maanedensTopscorer").every(k => {
    const ms = server.find(x => x.samling === "maanedensSpiller" && x.id === k.id)?.post || db.maanedensSpiller[k.id];
    return k.post.vindere.every(v => !(ms?.vindere || []).some(w => w.id === v.id)); }));
  t("kaldt igen paa siden skrives intet", igen === 0, igen);
  if(server.length){
    const vindere = server.flatMap(k => k.post.vindere);
    const delte = server.filter(k => k.post.vindere.length > 1).length, tomme = server.filter(k => !k.post.vindere.length).length;
    t(`dataene rammer noget: ${vindere.length} vindere i ${server.length} poster, ${delte} delte, ${tomme} uden vinder, ${new Set(server.map(k => k.maaned)).size} maaned(er)`,
      vindere.length >= 4 && tomme >= 1 && (i !== 1 || new Set(server.map(k => k.maaned)).size === 2));
    const tv = server.filter(k => k.samling === "maanedensTopscorer").flatMap(k => k.post.vindere);
    t(`topscorerne rammer noget: ${tv.length} vindere, ${tv.filter(v => v.svaer + v.mellem + v.let + v.starter < v.oevelser).length} med trin paa stigen blandt oevelserne`,
      tv.length >= 2 && tv.every(v => v.point > 0));
  }else t("intet at kaare - og siden kaarede heller intet", poster.length === 0 && i === 3);
}

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
