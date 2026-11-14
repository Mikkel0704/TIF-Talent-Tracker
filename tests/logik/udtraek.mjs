// Haeler fodteknik-logikken ud af index.html, saa testene koerer paa den RIGTIGE kode
// og ikke paa en kopi, der langsomt kommer til at vaere noget andet.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const start = html.indexOf("// DAGLIG FODTEKNIK");
const slut = html.indexOf("const POINT_BASE =");
if(start < 0 || slut < 0 || slut < start) throw new Error("kunne ikke finde fodteknik-blokken i index.html");
const blok = html.slice(start, slut);

// Stigen bruges af streaken, saa de faa funktioner derfra skal med.
const stige = [
  "function juggleFor(pid)",
  "function juggleLogFor(pid)"
].map(sig=>{
  const i = html.indexOf(sig);
  if(i < 0) throw new Error("mangler " + sig);
  const j = html.indexOf("\n", i);
  return html.slice(i, j);
}).join("\n");

const forspil = `
// --- stubbe, saa den udtrukne kode kan indlaeses uden browser og uden Firebase ---
export let footwork = [];
export let footworkLogs = [];
export let juggleLadder = [];
export let juggleLog = [];
export function saetData(f, fl, jl, jlog){ footwork = f || []; footworkLogs = fl || []; juggleLadder = jl || []; juggleLog = jlog || []; footworkStamp++; }
const db = null, players = [], currentUser = null, currentPlayerLink = null, currentUserDoc = null;
function setDoc(){ throw new Error("ikke i test"); }
function doc(){ throw new Error("ikke i test"); }
function serverTimestamp(){ return null; }
function deleteField(){ return "__DELETE__"; }
function normalizeYearValue(v){ return String(v); }
function isPlayer(){ return false; }
function isDemoUser(){ return false; }
function demoBlocked(){ return false; }
function canAccessPlayer(){ return true; }
function besked(){ return Promise.resolve(); }
function indtast(){ return Promise.resolve(null); }
function spoerg(){ return Promise.resolve(false); }
function escapeHtml(s){ return String(s); }
function renderFootwork(){}
`;

const efterspil = `
export {
  FOOTWORK, FOOTWORK_STREAK, FOOTWORK_MAX_PER_DAY, FOOTWORK_BACKDATE_DAYS,
  FOOTWORK_KATEGORIER, FOOTWORK_KATEGORI_ORDEN, FOOTWORK_NIVEAUER, FOOTWORK_V1, FOOTWORK_V2_FRA,
  FOOTWORK_VISNING, footworkIVisningsorden, footworkVersion, footworkFindesPaa, footworkKategoriPaa, footworkPointsPaa, footworkGrupper, footworkGrundpoint,
  footworkEx, footworkPointsFor, footworkBlock, FOOTWORK_DEFAULT_BLOCK, dagsISO, isoPlus, isoDage,
  footworkBoost, footworkBoostNavn, footworkDayCombos, footworkComboMemo,
  footworkKombierV2, footworkKombiVisning, FOOTWORK_KOMBI_SAMME, FOOTWORK_KOMBI_NIVEAUER,
  MAANEDENS_FOERSTE, MAANEDENS_AFGOERES_DAG, maanedPlus, forrigeMaaned, maanedAfgoeres, maanederTilKaaring, maanedStat, maanedensSpillerRangering,
  footworkDays, footworkCount, footworkDayCounts, footworkTotals, footworkGradeSplit, footworkJokerStatus, footworkJokerDays,
  footworkDayPoints, footworkActiveDays, juggleActiveDays,
  footworkRuns, footworkStreakBonus, footworkNextStreakBonus, footworkCurrentStreak,
  footworkPoints, footworkPointsInWindow, footworkCache, footworkDayPatch, footworkDayOpenForPlayer
};
`;

writeFileSync(new URL("./kode.mjs", import.meta.url), forspil + stige + "\n" + blok + efterspil);
console.log("udtrukket " + blok.length + " tegn fodteknik-kode");
