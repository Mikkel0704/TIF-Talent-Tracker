// Point paa Jongleringsstigen, hentet ud af index.html og koert som den er.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const a = html.indexOf("// JONGLERINGSSTIGEN");
const b = html.indexOf("// DAGLIG FODTEKNIK");
if(a < 0 || b < 0 || b < a) throw new Error("kunne ikke finde stige-blokken");

const forspil = `
export let juggleLadder = [];
export let juggleLog = [];
export function saetData(l, g){ juggleLadder = l || []; juggleLog = g || []; }
const db = null, players = [], currentUser = null, currentPlayerLink = null;
function setDoc(){ throw new Error("ikke i test"); } function doc(){ throw new Error("ikke i test"); }
function serverTimestamp(){ return null; } function normalizeYearValue(v){ return String(v); }
function isPlayer(){ return false; } function demoBlocked(){ return false; }
function canAccessPlayer(){ return true; } function alert(){} function prompt(){ return null; }
function confirm(){ return false; }
function dagsISO(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
const steps = [], criteria = {};
`;
const efterspil = `
export { JUGGLE_MAIN, JUGGLE_WEAK, JUGGLE_WEAK_FACTOR, JUGGLE_TRICKS, juggleMainPoints, juggleWeakPoints,
         ladderPoints, ladderPointsInWindow, juggleMainStep, juggleWeakStep, juggleTricks };
`;
const sti = new URL("./stigekode.mjs", import.meta.url);
writeFileSync(sti, forspil + html.slice(a, b) + efterspil);
const K = await import(sti.href);

let ok = 0, fejl = 0;
const t = (navn, fik, vent) => {
  const x = JSON.stringify(fik), y = JSON.stringify(vent);
  if(x === y){ ok++; console.log("  ok   " + navn); }
  else { fejl++; console.log("  FEJL " + navn + "\n         fik: " + x + "   ventede: " + y); }
};
const PID = "p1";
const saet = (mainStep, weakStep, tricks, entries=[]) =>
  K.saetData([{id:PID, mainStep, weakStep, tricks}], [{id:PID, entries}]);

console.log("\nPoint pr. trin");
t("trin 1 = 3 jongleringer = 3 point", K.juggleMainPoints(0), 3);
t("trin 10 = 40 jongleringer = 40 point", K.juggleMainPoints(9), 40);
t("trin 15 = 150 jongleringer = 150 point", K.juggleMainPoints(14), 150);
t("point følger altid tallet på trinnet", K.JUGGLE_MAIN.map((n,i)=>K.juggleMainPoints(i)), K.JUGGLE_MAIN);
t("dårligt ben tæller dobbelt", K.JUGGLE_WEAK.map((n,i)=>K.juggleWeakPoints(i)), K.JUGGLE_WEAK.map(n=>n*2));
t("hvert trin er mere værd end det foregående (hoved)",
  K.JUGGLE_MAIN.every((_,i)=>i===0 || K.juggleMainPoints(i) > K.juggleMainPoints(i-1)), true);
t("hvert trin er mere værd end det foregående (dårligt ben)",
  K.JUGGLE_WEAK.every((_,i)=>i===0 || K.juggleWeakPoints(i) > K.juggleWeakPoints(i-1)), true);
t("et trin uden for stigen giver nul", [K.juggleMainPoints(99), K.juggleWeakPoints(-1)], [0,0]);

console.log("\nSamlede point");
saet(0,0,[]);
t("en tom stige giver nul", K.ladderPoints(PID), 0);
saet(15,10,K.JUGGLE_TRICKS.map(x=>x.id));
const ventet = K.JUGGLE_MAIN.reduce((a,b)=>a+b,0) + 2*K.JUGGLE_WEAK.reduce((a,b)=>a+b,0) + 75;
t("hele stigen", K.ladderPoints(PID), ventet);
t("og det er 1030", ventet, 1030);
saet(3,0,[]);
t("tre trin = 3+5+7", K.ladderPoints(PID), 15);
saet(10,4,["oploft","vrist","skiftefod"]);
t("trin 10, svagt 4, 3 tricks", K.ladderPoints(PID), (3+5+7+10+15+20+25+30+35+40) + 2*(2+3+5+7) + 30);
t("det er mere end de 82, det gav før", K.ladderPoints(PID) > 82, true);
saet(0,0,["oploft","oploft","oploft"]);
t("dubletter i tricks tæller stadig kun én gang", K.ladderPoints(PID), 10);
saet(99,99,[]);
t("et håndskrevet trin klippes stadig til stigens længde",
  K.ladderPoints(PID), K.JUGGLE_MAIN.reduce((a,b)=>a+b,0) + 2*K.JUGGLE_WEAK.reduce((a,b)=>a+b,0));

console.log("\nUge/måned-vinduet");
const nu = new Date();
const iso = n => { const d = new Date(nu); d.setDate(d.getDate()+n); return d.toISOString(); };
saet(3, 2, [], [
  {t:"main", v:0, at: iso(-10)},
  {t:"main", v:1, at: iso(-1)},
  {t:"main", v:2, at: iso(-1)},
  {t:"weak", v:0, at: iso(-1)},
  {t:"weak", v:1, at: iso(-1)}
]);
const siden = new Date(nu); siden.setDate(siden.getDate()-3);
t("kun trin inden for vinduet tælles, og hvert med SIN egen takst",
  K.ladderPointsInWindow(PID, siden), 5 + 7 + 2*2 + 2*3);
t("hele perioden giver det samme som ladderPoints",
  K.ladderPointsInWindow(PID, new Date(2000,0,1)), K.ladderPoints(PID));
saet(1, 0, [], [{t:"main", v:0, at: iso(-1)}, {t:"main", v:1, at: iso(-1)}]);
t("et trin træneren har rullet tilbage, tæller ikke med i vinduet",
  K.ladderPointsInWindow(PID, siden), 3);

console.log("\nFortryd må ikke kunne give point to gange");
// Spilleren tager trin 1, fortryder, og tager det igen. Loggen rummer nu to linjer for
// samme trin - men trinnet er kun taget én gang, så det må kun tælle én gang i vinduet.
saet(1, 0, [], [
  {t:"main", v:0, at: iso(-1)},
  {t:"undo", stige:"main", fra:1, til:0, at: iso(-1)},
  {t:"main", v:0, at: iso(-1)}
]);
t("samme trin to gange i loggen tæller kun én gang", K.ladderPointsInWindow(PID, siden), 3);
t("og all-time er uberørt, fordi det regnes af fremdriften", K.ladderPoints(PID), 3);
saet(2, 0, [], [
  {t:"main", v:0, at: iso(-1)}, {t:"main", v:1, at: iso(-1)},
  {t:"undo", stige:"main", fra:2, til:1, at: iso(-1)}, {t:"main", v:1, at: iso(-1)}
]);
t("to trin, hvoraf det ene er taget om", K.ladderPointsInWindow(PID, siden), 3 + 5);
saet(0, 0, ["oploft"], [
  {t:"trick", v:"oploft", at: iso(-1)},
  {t:"undo", stige:"trick", trick:"oploft", at: iso(-1)},
  {t:"trick", v:"oploft", at: iso(-1)}
]);
t("samme trick to gange i loggen tæller kun én gang", K.ladderPointsInWindow(PID, siden), 10);
saet(0, 2, [], [
  {t:"weak", v:0, at: iso(-1)}, {t:"weak", v:0, at: iso(-1)}, {t:"weak", v:1, at: iso(-1)}
]);
t("dårligt ben: dubletter tæller også kun én gang", K.ladderPointsInWindow(PID, siden), 4 + 6);

console.log("\nEt fortrudt trin holder op med at tælle");
saet(0, 0, [], [{t:"main", v:0, at: iso(-1)}, {t:"undo", stige:"main", fra:1, til:0, at: iso(-1)}]);
t("fortrudt trin giver ingen point i vinduet", K.ladderPointsInWindow(PID, siden), 0);
t("og heller ikke all-time", K.ladderPoints(PID), 0);
saet(0, 0, [], [{t:"trick", v:"oploft", at: iso(-1)}, {t:"undo", stige:"trick", trick:"oploft", at: iso(-1)}]);
t("fortrudt trick giver ingen point", K.ladderPointsInWindow(PID, siden), 0);

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
