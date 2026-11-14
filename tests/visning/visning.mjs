// Bygger en lille side med den RIGTIGE renderFootwork (hentet ud af index.html) og
// koerer den i en rigtig browser. Formaalet er ikke at teste point - det goer test.mjs -
// men at fange en fejl i selve skabelonen, som kun en browser ser.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
function udtraek(startMarkoer, slutMarkoer){
  const a = html.indexOf(startMarkoer);
  const b = html.indexOf(slutMarkoer, a);
  if(a < 0 || b < 0) throw new Error("kunne ikke finde " + startMarkoer);
  return html.slice(a, b);
}
const logik  = udtraek("// DAGLIG FODTEKNIK", "const POINT_BASE =")
  // Denne test beskriver visningen efter de GAMLE regler (version 1) - det, en dag fra før
  // skiftet viser. Den låses derfor til version 1; de nye reglers visning tester fodteknik-v2.mjs.
  .replace(/const FOOTWORK_V2_FRA = "[0-9-]+";/, 'const FOOTWORK_V2_FRA = "2099-01-01";');
const render = udtraek("function renderFootwork(){", "\n// GENTEGNING UDEN AT TRAEDE PAA BRUGEREN");
const stil   = udtraek("<style>", "</style>") + "</style>";

const iDag = new Date();
const dato = n => { const d = new Date(iDag); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

const side = `<!doctype html><html lang="da"><head><meta charset="utf-8">${stil}</head><body>
<div id="footworkArea"></div><div id="footworkRulesArea"></div><div id="footworkIndoorArea"></div><div id="footworkExerciseArea"></div>
<script>
const footwork = [{id:"p1", days:{
  "${dato(0)}":  {t:2, v:2, l:1, c:1, q:1},
  "${dato(-1)}": {t:1},
  "${dato(-3)}": {t:3}
}, jokers:{"${dato(-4)}":"approved"}, jokerRequests:{"${dato(-4)}":true, "${dato(-2)}":true}, year:"2016", gender:"dreng"}];
const footworkLogs = [{id:"p1", entries:[], reasons:{}, year:"2016", gender:"dreng"}];
const juggleLadder = [{id:"p1", days:["${dato(-5)}"]}];
const juggleLog = [];
const players = [{id:"p1", name:"Test Testesen", year:"2016", gender:"dreng", points:0}];
const currentPlayerLink = players[0];
const currentUser = {uid:"u1", email:"t@x.invalid"};
const currentUserDoc = {role:"player", playerId:"p1"};
function isPlayer(){ return true; }
function isDemoUser(){ return false; }
function demoBlocked(){ return false; }
function canAccessPlayer(){ return true; }
function normalizeYearValue(v){ return String(v); }
function escapeHtml(str){ return String(str||"").replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#039;"}[s])); }
function juggleFor(pid){ return juggleLadder.find(x=>x.id===pid) || null; }
function juggleLogFor(pid){ const d = juggleLog.find(x=>x.id===pid); return Array.isArray(d?.entries) ? d.entries : []; }
const db = null;
function doc(){ throw new Error("ikke i test"); }
function setDoc(){ throw new Error("ikke i test"); }
function serverTimestamp(){ return null; }
function deleteField(){ return "__DELETE__"; }
${logik}
${render}
renderFootwork();
window.__klar = true;
</script></body></html>`;

const fil = new URL("./visning.html", import.meta.url);
writeFileSync(fil, side);

const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:390, height:900}});
const fejl = [];
page.on("console", m=>{ if(m.type() === "error") fejl.push(m.text()); });
page.on("pageerror", e=>fejl.push("pageerror: " + e.message));
await page.goto(fil.href);
await page.waitForFunction(()=>window.__klar === true, {timeout:10000}).catch(()=>{});

const resultat = await page.evaluate(()=>{
  const el = document.getElementById("footworkArea");
  return {
    html: el.innerHTML,
    tekst: el.innerText,
    dagChips: document.querySelectorAll(".daychip").length,
    taellere: document.querySelectorAll(".counter button").length,
    jokerChips: document.querySelectorAll(".daychip.joker").length,
    aktiveChips: document.querySelectorAll(".daychip.has").length,
    regler: document.getElementById("footworkRulesArea").innerText.length,
    indendoers: document.getElementById("footworkIndoorArea").innerText.length,
    oevelser: document.getElementById("footworkExerciseArea").innerText.length,
    bredde: document.documentElement.scrollWidth,
    vindue: window.innerWidth
  };
});

let ok = 0, d = 0;
const t = (n, b) => { if(b){ ok++; console.log("  ok   " + n); } else { d++; console.log("  FEJL " + n); } };
console.log("\nVisning i browser (390px bred)");
t("ingen JS-fejl på siden", fejl.length === 0);
if(fejl.length) console.log("   " + fejl.join("\n   "));
t("14 dag-knapper", resultat.dagChips === 14);
t("en knap pr. retning pr. øvelse (12 øvelser)", resultat.taellere === 24);
t("jokerdage er markeret", resultat.jokerChips === 2);
t("dage med træning er markeret", resultat.aktiveChips === 3);
t("dagens kombier står på siden", /Dagens kombier/.test(resultat.tekst));
// Der er flere opdelinger, der alle giver 10 - det afgørende er, at den IKKE tager de
// tre svære (+8) og lader resten ligge. Så to kombier, der tilsammen giver +10.
t("to kombier, ikke de tre svære alene", (resultat.tekst.match(/· \+5/g) || []).length === 2);
t("dagens point er 32 (22 grundpoint + 10 i kombi)", /32 point/.test(resultat.tekst));
t("streaken vises", /aktuel streak/.test(resultat.tekst));
t("reglerne er fyldt ud", resultat.regler > 200);
t("indendørs-noterne er fyldt ud", resultat.indendoers > 100);
t("øvelsesbeskrivelserne er fyldt ud", resultat.oevelser > 500);
t("ingen vandret scroll på en telefon", resultat.bredde <= resultat.vindue + 1);
t("jongleringsrækken viser 5 minutter og 8 point", /5 minutter · 8 point/.test(resultat.tekst));
t("en gulvøvelse viser 3 × 30 sek. og sin egen takst", /3 × 30 sek\. · 2 point/.test(resultat.tekst));
t("grupperne påstår ikke længere én fælles takst", !/point pr\. gennemførelse/.test(resultat.tekst));

await page.screenshot({path: new URL("./fodteknik.png", import.meta.url).pathname, fullPage: true, animations: "disabled"});
await browser.close();
console.log(`\n${ok} ok, ${d} fejl`);
process.exit(d ? 1 : 0);
