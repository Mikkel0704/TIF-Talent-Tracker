// Bygger genereret/pointkode.js: pointreglerne skaaret UD AF ../index.html, saa serveren
// regner med PRAECIS den kode, appen regner med. Der findes ingen kopi at holde i takt.
//
//   node functions/byg.mjs     (koeres ogsaa som predeploy i ../firebase.json og foer
//                               testene i tests/funktioner)
//
// Fejler hoejlydt, hvis noget, serveren skal bruge, ikke kan findes i index.html - eller
// hvis den genererede fil ikke kan indlaeses og regne et barn ud bagefter.
// Den genererede fil er git-ignoreret: den laves forfra hver gang.
import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from "node:fs";

import { pathToFileURL } from "node:url";
// Kun testene giver andre stier med (en aendret kopi af index.html), for at se byg.mjs fejle.
const KILDE = process.argv[2] ? pathToFileURL(process.argv[2]) : new URL("../index.html", import.meta.url);
const MAAL = process.argv[3] ? pathToFileURL(process.argv[3]) : new URL("./genereret/pointkode.js", import.meta.url);

const html = readFileSync(KILDE, "utf8");
const fejl = msg => { throw new Error("byg.mjs: " + msg + " - index.html passer ikke til byg.mjs. Ret byg.mjs, foer der rulles ud."); };

// --- en lille skanner, der springer strenge, skabeloner, kommentarer og regex over ---
// Den finder slutningen paa en funktion eller en const ved at taelle klammer uden at
// blive narret af en klamme inde i en tekst.
//   "luk":       stop, naar klammen, der blev aabnet ved start, lukkes igen
//   "semikolon": stop ved det foerste ";" uden for alle klammer
function skan(kilde, start, stopVed){
  let i = start, dybde = 0, forrige = "";
  const skabeloner = [];   // dybden, hvor et ${ ... } i en skabelon blev aabnet
  const kanVaereRegex = () => {
    if(!forrige || /[(,=:[!&|?{};+\-*%<>~^]/.test(forrige)) return true;
    return /\b(return|typeof|case|in|of)$/.test(kilde.slice(Math.max(0, i - 8), i).trimEnd());
  };
  const skabelonFra = j => {        // j staar lige efter ` eller }; laes til ` eller ${
    for(;;){
      if(j >= kilde.length) fejl("uafsluttet skabelon ved tegn " + i);
      if(kilde[j] === "\\"){ j += 2; continue; }
      if(kilde[j] === "`") return j + 1;
      if(kilde[j] === "$" && kilde[j+1] === "{"){ skabeloner.push(dybde); return j + 2; }
      j++;
    }
  };
  while(i < kilde.length){
    const c = kilde[i], n = kilde[i+1];
    if(c === "/" && n === "/"){ const j = kilde.indexOf("\n", i); i = j < 0 ? kilde.length : j; continue; }
    if(c === "/" && n === "*"){ const j = kilde.indexOf("*/", i + 2); if(j < 0) fejl("uafsluttet kommentar"); i = j + 2; continue; }
    if(c === '"' || c === "'"){
      let j = i + 1;
      while(kilde[j] !== c){
        if(j >= kilde.length || kilde[j] === "\n") fejl("uafsluttet streng ved tegn " + i);
        if(kilde[j] === "\\") j++;
        j++;
      }
      i = j + 1; forrige = c; continue;
    }
    if(c === "`"){ i = skabelonFra(i + 1); forrige = "`"; continue; }
    if(c === "}" && skabeloner.length && skabeloner[skabeloner.length-1] === dybde){
      skabeloner.pop(); i = skabelonFra(i + 1); forrige = "`"; continue;
    }
    if(c === "/" && kanVaereRegex()){
      let j = i + 1, klasse = false;
      for(;;){
        const x = kilde[j];
        if(x === undefined || x === "\n") fejl("uafsluttet regex ved tegn " + i);
        if(x === "\\"){ j += 2; continue; }
        if(x === "[") klasse = true;
        else if(x === "]") klasse = false;
        else if(x === "/" && !klasse) break;
        j++;
      }
      j++; while(/[a-z]/.test(kilde[j] || "")) j++;
      i = j; forrige = "/"; continue;
    }
    if(c === "{" || c === "(" || c === "[") dybde++;
    else if(c === "}" || c === ")" || c === "]"){
      dybde--;
      if(dybde < 0) fejl("ubalancerede klammer ved tegn " + i);
      if(stopVed === "luk" && dybde === 0) return i + 1;
    }
    else if(c === ";" && stopVed === "semikolon" && dybde === 0) return i + 1;
    if(!/\s/.test(c)) forrige = c;
    i++;
  }
  fejl("fandt ikke slutningen (startede ved tegn " + start + ")");
}

// Netop ÉN definition i starten af en linje. Ingen eller to = fejl.
function find(moenster, navn){
  const alle = [...html.matchAll(moenster)];
  if(alle.length === 0) fejl("mangler " + navn);
  if(alle.length > 1) fejl(navn + " er defineret " + alle.length + " gange");
  return alle[0].index + alle[0][1].length;
}
function funktion(navn){
  const i = find(new RegExp("(^|\\n)function " + navn + "\\(", "g"), "function " + navn);
  const efterParametre = skan(html, html.indexOf("(", i), "luk");
  const krop = html.indexOf("{", efterParametre);
  if(html.slice(efterParametre, krop).trim()) fejl("uventet tekst mellem parametre og krop i " + navn);
  return html.slice(i, skan(html, krop, "luk"));
}
function konstant(navn){
  const i = find(new RegExp("(^|\\n)const " + navn + " *=", "g"), "const " + navn);
  return html.slice(i, skan(html, i, "semikolon"));
}

// --- det, der skaeres ud -------------------------------------------------------------
// 1) Hele fodteknik-blokken, praecis som tests/logik/udtraek.mjs tager den. Den rummer
//    ogsaa dagsISO/iDagISO, juggleActiveDays, footworkStamp/footworkHusk, pointene og
//    reglerne for Maanedens spiller (maanederTilKaaring, maanedStat, maanedensSpillerRangering)
//    og Maanedens topscorer (maanedTopscorerStat, maanedensTopscorerRangering).
const blokStart = html.indexOf("\n// DAGLIG FODTEKNIK");
const blokSlut = html.indexOf("\nconst POINT_BASE =");
if(blokStart < 0 || blokSlut < 0 || blokSlut < blokStart) fejl("kunne ikke finde blokken fra // DAGLIG FODTEKNIK til const POINT_BASE");
const blok = html.slice(blokStart + 1, blokSlut);

// 2) Jongleringsstigen og resten, enkeltvis efter navn.
const KONSTANTER = ["POINTREGLER", "CLUB_TOP_N", "JUGGLE_MAIN", "JUGGLE_WEAK", "JUGGLE_MAIN_POINT", "JUGGLE_WEAK_POINT", "JUGGLE_GATE_AFTER", "JUGGLE_TRICKS",
  // Morgenoprydningen (oprydning.js): videoernes frister.
  "CHALLENGE_VIDEO_MAX_AGE_MS", "VIDEO_MAX_AGE_MS", "VIDEO_SET_RYDDES_EFTER_MS"];
const FUNKTIONER = [
  "normalizeYearValue",
  "juggleMainPoints", "juggleWeakPoints", "juggleTrick",
  "juggleFor", "juggleLogFor", "juggleMainStep", "juggleWeakStep", "juggleTricks",
  "ladderPoints", "totalPoints", "ladderPointsInWindow", "ladderFoersteGang",
  // Maanedens topscorer: trinnene paa stigen i et vindue (til "flest oevelser").
  "ladderTrinIVindue",
  "startOfWeek", "startOfMonth", "pointsInWindow",
  // Maanedens spiller: spillerne goeres klar, som appen goer det, naar de hentes.
  "migratePlayer", "inferYearFromNote",
  // Logins (logins.js): aargangslisten paa et nyt traenerlogin, som appen regner den ud.
  "normalizeYearsList",
  // Morgenoprydningen (oprydning.js): hvornaar en video slettes - samme regler som
  // sweepExpiredVideos i appen.
  "tidspunktMs", "videoSkalSlettes"
];
// Det, blokken SKAL indeholde (ellers er den flyttet, og serveren ville regne forkert).
const I_BLOKKEN = ["dagsISO", "iDagISO", "juggleActiveDays", "footworkHusk", "footworkPoints", "footworkPointsInWindow",
  // Maanedens spiller (kaaring.js): de samme funktioner, som kaarMaanedensSpiller() i appen bruger.
  "maanedPlus", "forrigeMaaned", "maanedAfgoeres", "maanederTilKaaring", "maanedStat", "maanedSammenlign", "maanedensSpillerRangering",
  // Maanedens topscorer (kaaring.js): de samme funktioner, som kaarMaanedensSpiller() bruger.
  "maanedTopscorerStat", "maanedTopscorerSammenlign", "maanedensTopscorerRangering", "topscorerVinder",
  // Morgenoprydningen (oprydning.js): hvilke joker-begrundelser der skal slettes.
  "jokerBegrundelserAtSlette"];
const KONSTANTER_I_BLOKKEN = ["FOOTWORK_V2_FRA", "MAANEDENS_FOERSTE", "MAANEDENS_AFGOERES_DAG", "TOPSCORER_FELTER",
  "FOOTWORK_REASON_MAX_AGE_MS", "JUGGLE_FREMDRIFT", "JUGGLE_LOG_MAX"];
for(const navn of I_BLOKKEN){
  if(!new RegExp("(^|\\n)function " + navn + "\\(").test(blok)) fejl(navn + " ligger ikke i fodteknik-blokken");
}
for(const navn of KONSTANTER_I_BLOKKEN){
  if(!new RegExp("(^|\\n)const " + navn + " *=").test(blok)) fejl("const " + navn + " ligger ikke i fodteknik-blokken");
}
if(!/(^|\n)let footworkStamp = 0;/.test(blok)) fejl("let footworkStamp = 0; ligger ikke i fodteknik-blokken");
for(const navn of [...KONSTANTER, ...FUNKTIONER]){
  if(new RegExp("(^|\\n)(function|const|let) " + navn + "\\b").test(blok)) fejl(navn + " ligger nu i fodteknik-blokken - fjern det fra listen i byg.mjs");
}
const udskaaret = [
  ...KONSTANTER.map(konstant),
  ...FUNKTIONER.map(funktion)
].join("\n");
const regler = /^const POINTREGLER = "([^"]+)";$/.exec(konstant("POINTREGLER"));
if(!regler) fejl("POINTREGLER skal staa som const POINTREGLER = \"...\";");

// --- den genererede fil --------------------------------------------------------------
const forspil = `// GENERERET af functions/byg.mjs ud fra ../index.html - RET IKKE HER, ret index.html.
// Pointreglerne ${regler[1]}.
//
// Appens kode laeser modul-globale lister (footwork, juggleLadder, ...). Serveren saetter
// dem til et enkelt barns data (saetBarn) eller alle boerns (saetAlleBoern) og regner synkront
// bagefter. Der er intet await imellem, saa to kald i samme instans kan ikke flette sig ind
// i hinanden.
process.env.TZ = "Europe/Copenhagen";   // appen regner i lokal tid - det er dansk tid
// "Hvad er klokken?" Appens kode spoerger med new Date() og Date.now() - fx er en dag efter
// i dag ikke med i footworkDays. Paa serveren skal svaret vaere det tidspunkt, beregningen
// gaelder (nu), ikke maskinens ur, saa en linje eller en kaaring regnet "pr. nu" er den samme,
// uanset hvornaar den regnes. saetNu(nu) saetter uret for modulet; saetNu(null) = maskinens ur.
// Kun herinde: Date er skygget i dette modul og ingen andre steder.
const EgentligDate = globalThis.Date;
let fastNu = null;
const Date = class extends EgentligDate {
  constructor(...a){ if(a.length) super(...a); else super(fastNu === null ? EgentligDate.now() : fastNu); }
  static now(){ return fastNu === null ? EgentligDate.now() : fastNu; }
};
let players = [], submissions = [], footwork = [], footworkLogs = [], juggleLadder = [], juggleLog = [];
// Stubbe for det, fodteknik-blokken naevner, men som pointene aldrig kalder.
const db = null, currentUser = null, currentPlayerLink = null, currentUserDoc = null;
const ikkePaaServeren = navn => () => { throw new Error(navn + " findes ikke paa serveren"); };
const setDoc = ikkePaaServeren("setDoc"), doc = ikkePaaServeren("doc"), besked = ikkePaaServeren("besked"),
  indtast = ikkePaaServeren("indtast"), spoerg = ikkePaaServeren("spoerg"), renderFootwork = ikkePaaServeren("renderFootwork");
function serverTimestamp(){ return null; }
function deleteField(){ return null; }
function isPlayer(){ return false; }
function isDemoUser(){ return false; }
function demoBlocked(){ return false; }
function canAccessPlayer(){ return true; }
function escapeHtml(s){ return String(s); }
`;
const efterspil = `
// Saet et enkelt barns data. footworkStamp haeves, saa appens huskeliste (footworkHusk) aldrig
// giver et svar, der blev regnet ud for et andet barn eller andre data.
export function saetNu(nu){
  fastNu = nu == null ? null : new EgentligDate(nu).getTime();
  if(fastNu !== null && !Number.isFinite(fastNu)) throw new Error("saetNu: ugyldigt tidspunkt");
  footworkStamp++;
}
export function saetBarn({ spiller = null, stige = null, stigelog = null, fodteknik = null, indsendelser = [] } = {}){
  players = spiller ? [spiller] : [];
  juggleLadder = stige ? [stige] : [];
  juggleLog = stigelog ? [stigelog] : [];
  footwork = fodteknik ? [fodteknik] : [];
  footworkLogs = [];
  submissions = Array.isArray(indsendelser) ? indsendelser : [];
  footworkStamp++;
}
// Saet ALLE boerns data paa én gang - til Maanedens spiller og Maanedens topscorer, som
// sammenligner en hel aargang. maanedStat laeser kun fodteknik-dokumenterne (dagene og
// jokerafgoerelserne ligger paa dem) og spillerne; maanedTopscorerStat ogsaa indsendelserne,
// stigen og stigens log. Det, der ikke gives med, toemmes, saa intet fra et tidligere kald
// kan snige sig med.
export function saetAlleBoern({ spillere = [], fodteknik = [], indsendelser = [], stiger = [], stigelogge = [] } = {}){
  const liste = x => (Array.isArray(x) ? x : []);
  players = liste(spillere);
  footwork = liste(fodteknik);
  submissions = liste(indsendelser);
  juggleLadder = liste(stiger);
  juggleLog = liste(stigelogge);
  footworkLogs = [];
  footworkStamp++;
}
export {
  POINTREGLER, CLUB_TOP_N, normalizeYearValue, dagsISO, iDagISO,
  totalPoints, ladderPoints, ladderPointsInWindow, footworkPoints, footworkPointsInWindow,
  pointsInWindow, startOfWeek, startOfMonth, FOOTWORK_V2_FRA,
  migratePlayer, normalizeYearsList, MAANEDENS_FOERSTE, MAANEDENS_AFGOERES_DAG, maanedPlus, forrigeMaaned, maanedAfgoeres,
  maanederTilKaaring, maanedStat, maanedensSpillerRangering,
  ladderTrinIVindue, maanedTopscorerStat, maanedensTopscorerRangering, topscorerVinder,
  juggleActiveDays, footworkDays,
  jokerBegrundelserAtSlette, FOOTWORK_REASON_MAX_AGE_MS, videoSkalSlettes, tidspunktMs,
  VIDEO_MAX_AGE_MS, CHALLENGE_VIDEO_MAX_AGE_MS, VIDEO_SET_RYDDES_EFTER_MS
};
`;
// Skrives foerst ved siden af og proeves; foerst naar den kan regne, erstatter den den gamle.
const NY = new URL(MAAL.href.replace(/(\.m?js)$/, ".ny$1"));
mkdirSync(new URL(".", MAAL), { recursive: true });
writeFileSync(NY, forspil + "\n" + udskaaret + "\n\n" + blok + "\n" + efterspil);

// Kan filen indlaeses og regne? En syntaksfejl eller et navn, der mangler, skal stoppe en
// udrulning HER - ikke dukke op som en fejl i hver eneste trigger.
try{
  const m = await import(NY.href + "?t=" + Date.now());
  m.saetBarn({ spiller: { id: "x", name: "x", year: "U9", points: 5 },
    stige: { id: "x", mainStep: 2, tricks: ["oploft"], days: ["2026-01-05"] },
    fodteknik: { id: "x", days: { "2026-01-05": { t: 3 } } } });
  const total = m.totalPoints({ id: "x", points: 5 });
  if(!Number.isFinite(total) || total <= 5) fejl("proeveberegningen gav " + total);
  if(m.normalizeYearValue("U9") !== "2017") fejl("normalizeYearValue virker ikke som ventet");
  m.footworkPointsInWindow("x", m.startOfWeek(new Date()));
  m.pointsInWindow("x", m.startOfMonth(new Date()));
  // Maanedens spiller paa et lille, haandregnet eksempel: to dage i november, ét barn.
  m.saetAlleBoern({ spillere: [m.migratePlayer({ id: "x", name: "x", year: "U9" })],
    fodteknik: [{ id: "x", days: { "2026-11-16": { t: 1 }, "2026-11-17": { t: 1 } } }] });
  const k = m.maanedensSpillerRangering([{ id: "x", name: "x", year: "2017" }], "2026-11", []);
  if(k.vindere.length !== 1 || k.vindere[0].dage !== 2) fejl("proevekaaringen gav " + JSON.stringify(k.vindere));
  if(m.maanederTilKaaring("2026-12-05").join() !== m.MAANEDENS_FOERSTE) fejl("maanederTilKaaring virker ikke som ventet");
  // Maanedens topscorer paa et lille, haandregnet eksempel: x har en Starter-dag (2 point),
  // et trin paa stigen (5) og en medalje godkendt i november (25); y vandt Maanedens spiller
  // og kan ikke ogsaa vinde; z har kun én Starter-dag (2) og skal tabe til x.
  m.saetAlleBoern({ spillere: ["x", "y", "z"].map(id => m.migratePlayer({ id, name: id, year: "U9" })),
    fodteknik: [{ id: "x", days: { "2026-11-16": { t: 1 } } }, { id: "y", days: { "2026-11-16": { k: 9 } } }, { id: "z", days: { "2026-11-18": { t: 1 } } }],
    stiger: [{ id: "x", mainStep: 1 }], stigelogge: [{ id: "x", entries: [{ t: "main", v: 0, at: "2026-11-20T10:00:00Z" }] }],
    indsendelser: [{ playerId: "x", status: "approved", reviewedAt: "2026-11-30T12:00:00Z", pointsAwarded: 25 }] });
  const ts = m.maanedensTopscorerRangering([{ id: "x", name: "x" }, { id: "y", name: "y" }, { id: "z", name: "z" }], "2026-11", ["y"]);
  if(ts.vindere.length !== 1 || JSON.stringify(m.topscorerVinder(ts.vindere[0])) !== JSON.stringify({ id: "x", navn: "x", point: 32, oevelser: 2, svaer: 0, mellem: 0, let: 0, starter: 1 }))
    fejl("proeven paa Maanedens topscorer gav " + JSON.stringify(ts.vindere));
  // Morgenoprydningen paa haandregnede eksempler: en joker afgjort for 3 doegn + 1 minut siden
  // skal ryddes, én for 2 doegn og 23 timer siden og en ubehandlet skal ikke.
  const NU = Date.parse("2026-11-22T05:00:00+01:00"), H = 3600 * 1000;
  const jb = m.jokerBegrundelserAtSlette({ "2026-11-01": { tekst: "syg", afgjortAt: new Date(NU - 72 * H - 60000).toISOString() },
    "2026-11-02": { tekst: "syg", afgjortAt: new Date(NU - 71 * H).toISOString() }, "2026-11-03": { tekst: "syg" } }, NU);
  if(jb.join() !== "2026-11-01") fejl("proeven paa jokerBegrundelserAtSlette gav " + JSON.stringify(jb));
  const vid = { url: "https://x", path: "submissions/u/1.mp4", ny: true };
  if(m.videoSkalSlettes({ status: "approved" }, vid, NU)?.grund !== "behandlet"
    || m.videoSkalSlettes({ status: "pending", submittedAt: new Date(NU - 6 * 24 * H).toISOString() }, vid, NU) !== null
    || m.videoSkalSlettes({ status: "pending", submittedAt: new Date(NU - 7 * 24 * H - 60000).toISOString() }, vid, NU)?.grund !== "udloebet")
    fejl("proeven paa videoSkalSlettes gik galt");
}catch(e){
  rmSync(NY, { force: true });
  throw e;
}
renameSync(NY, MAAL);
console.log(`byg.mjs: ${MAAL.pathname.split("/").slice(-2).join("/")} skrevet (${KONSTANTER.length} konstanter, ${FUNKTIONER.length} funktioner, fodteknik-blok paa ${blok.length} tegn, POINTREGLER ${regler[1]})`);
