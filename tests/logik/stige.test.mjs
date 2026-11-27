// Point paa Jongleringsstigen, hentet ud af index.html og koert som den er.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const a = html.indexOf("// JONGLERINGSSTIGEN");
const b = html.indexOf("// DAGLIG FODTEKNIK");
if(a < 0 || b < 0 || b < a) throw new Error("kunne ikke finde stige-blokken");

// Talentmaerkets rigtige trin og krav, saa medaljemaerkaterne paa stigen proeves mod dem.
const stepsKode = /\nconst steps = \[[\s\S]*?\n\];/.exec(html)?.[0];
const kravKode = /\nconst criteria = \{[\s\S]*?\n\};/.exec(html)?.[0];
if(!stepsKode || !kravKode) throw new Error("kunne ikke finde steps/criteria");
// Hvad der er en registrering (og hvor lang loggen er) staar i fodteknik-blokken, hvor
// juggleActiveDays bruger det; writeJuggle her i stige-blokken bruger det ogsaa.
const fremdriftKode = ["JUGGLE_FREMDRIFT", "JUGGLE_LOG_MAX"].map(n=>new RegExp("\nconst " + n + " = [^\n]*;").exec(html)?.[0]);
if(fremdriftKode.some(x=>!x)) throw new Error("kunne ikke finde JUGGLE_FREMDRIFT/JUGGLE_LOG_MAX");

// Dialogerne (spoerg/besked/indtast) gribes, saa beskederne til fortryd og rettelser kan
// laeses. spoerg svarer nej, saa intet bliver skrevet - medmindre testen beder om ja
// (saetJa), og saa gribes skrivningerne i "skrivninger" i stedet for at gaa til Firestore.
const forspil = `
export let juggleLadder = [];
export let juggleLog = [];
export function saetData(l, g){ juggleLadder = l || []; juggleLog = g || []; }
export const beskeder = [];
let rolle = "traener", svar = null;
export function saetRolle(r){ rolle = r; currentPlayerLink = r === "spiller" ? players[0] : null; }
export function saetSvar(x){ svar = x; }
let ja = false;
export function saetJa(x){ ja = x; }
export const skrivninger = [];
const db = null, players = [{id:"p1", name:"Testbarn", year:"2017"}], currentUser = null;
let currentPlayerLink = null;
async function setDoc(ref, data){ skrivninger.push({ref, data}); } function doc(_db, samling, id){ return samling + "/" + id; }
function serverTimestamp(){ return null; } function normalizeYearValue(v){ return String(v); }
function isPlayer(){ return rolle === "spiller"; } function demoBlocked(){ return false; }
const seSomSpiller = null; function seSomSpillerSpaerret(){ return false; }
function canAccessPlayer(){ return true; }
function besked(m){ beskeder.push(String(m)); }
async function spoerg(m){ beskeder.push(String(m)); return ja; }
async function indtast(m){ beskeder.push(String(m)); return svar; }
function dagsISO(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
${stepsKode}
${kravKode}
${fremdriftKode.join("\n")}
`;
const efterspil = `
export { JUGGLE_MAIN, JUGGLE_WEAK, JUGGLE_MAIN_POINT, JUGGLE_WEAK_POINT, JUGGLE_TRICKS, JUGGLE_PHASES, JUGGLE_WEAK_PHASES, JUGGLE_RULES,
         JUGGLE_GATE_AFTER, JUGGLE_TRICK_NIVEAUER, JUGGLE_TRICK_ALIAS, juggleTrick, juggleTrickKanonisk, juggleTrickNavn, juggleTricksAf, juggleTrickSpaerret, juggleTrickEfterfoelgere, ladderTrinIVindue, juggleMainPoints, juggleWeakPoints, jugglePhaseFor, juggleMedalMarks,
         ladderPoints, ladderPointsInWindow, juggleMainStep, juggleWeakStep, juggleTricks,
         registerJuggle, undoJuggle, undoJuggleTrick, correctJuggle, correctJuggleTrick, criteria, dagsISO };
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
const sum = xs => xs.reduce((a,b)=>a+b,0);
const hovedPoint = n => sum(K.JUGGLE_MAIN.slice(0, n).map((_,i)=>K.juggleMainPoints(i)));
const svagPoint = n => sum(K.JUGGLE_WEAK.slice(0, n).map((_,i)=>K.juggleWeakPoints(i)));

console.log("\nStigerne");
t("hovedstigen har 16 trin og slutter på 300", K.JUGGLE_MAIN, [3,5,7,10, 15,20,30,40, 50,75,100,125, 150,200,250,300]);
t("dårligt ben har 12 trin og slutter på 100", K.JUGGLE_WEAK, [2,3,5, 7,10,15, 20,30,40, 50,75,100]);
t("tallene stiger hele vejen (dårligt ben)", K.JUGGLE_WEAK.every((x,i)=>i===0 || x > K.JUGGLE_WEAK[i-1]), true);
t("dårligt ben: fire faser med tre trin i hver", K.JUGGLE_WEAK_PHASES.map(f=>f.til), [3,6,9,12]);
t("og samme fasenavne som hovedstigen", K.JUGGLE_WEAK_PHASES.map(f=>f.navn), K.JUGGLE_PHASES.map(f=>f.navn));
t("tallene stiger hele vejen (hoved)", K.JUGGLE_MAIN.every((x,i)=>i===0 || x > K.JUGGLE_MAIN[i-1]), true);
t("pointtabellerne er lige så lange som stigerne",
  [K.JUGGLE_MAIN_POINT.length, K.JUGGLE_WEAK_POINT.length], [K.JUGGLE_MAIN.length, K.JUGGLE_WEAK.length]);
t("fire faser med fire trin i hver", K.JUGGLE_PHASES.map(f=>f.til), [4,8,12,16]);
t("sidste fase dækker trin 16", K.JUGGLE_PHASES[K.JUGGLE_PHASES.length-1].til, K.JUGGLE_MAIN.length);
t("trin 16 hører til Udholdenhed", K.jugglePhaseFor(16).navn, "Udholdenhed");

console.log("\nPoint pr. trin");
t("hovedstigen trin for trin", K.JUGGLE_MAIN.map((_,i)=>K.juggleMainPoints(i)),
  [5,5,5,5, 10,10,10,10, 15,15,15,15, 20,20,20,20]);
t("dårligt ben trin for trin", K.JUGGLE_WEAK.map((_,i)=>K.juggleWeakPoints(i)),
  [5,5,5, 10,10,10, 15,15,15, 20,20,20]);
const faseTakst = {"Find kontakten":5, "Rytme":10, "Kontrol":15, "Udholdenhed":20};
t("hovedstigens point følger faserne (5/10/15/20)",
  K.JUGGLE_MAIN.every((_,i)=>K.juggleMainPoints(i) === faseTakst[K.jugglePhaseFor(i+1).navn]), true);
t("dårligt bens point følger dets faser (5/10/15/20)",
  K.JUGGLE_WEAK.every((_,i)=>K.juggleWeakPoints(i) === faseTakst[K.jugglePhaseFor(i+1, K.JUGGLE_WEAK_PHASES).navn]), true);
t("trin 1 = 3 jongleringer = 5 point", K.juggleMainPoints(0), 5);
t("trin 8 = 40 jongleringer = 10 point", [K.JUGGLE_MAIN[7], K.juggleMainPoints(7)], [40, 10]);
t("trin 10 = 75 jongleringer = 15 point", [K.JUGGLE_MAIN[9], K.juggleMainPoints(9)], [75, 15]);
t("trin 13 = 150 jongleringer = 20 point", [K.JUGGLE_MAIN[12], K.juggleMainPoints(12)], [150, 20]);
t("trin 16 = 300 jongleringer = 20 point", [K.JUGGLE_MAIN[15], K.juggleMainPoints(15)], [300, 20]);
t("dårligt ben trin 3 = 5 berøringer = 5 point", [K.JUGGLE_WEAK[2], K.juggleWeakPoints(2)], [5, 5]);
t("dårligt ben trin 8 = 30 berøringer = 15 point", [K.JUGGLE_WEAK[7], K.juggleWeakPoints(7)], [30, 15]);
t("dårligt ben trin 12 = 100 berøringer = 20 point", [K.JUGGLE_WEAK[11], K.juggleWeakPoints(11)], [100, 20]);
t("intet trin er mindre værd end det foregående (hoved)",
  K.JUGGLE_MAIN.every((_,i)=>i===0 || K.juggleMainPoints(i) >= K.juggleMainPoints(i-1)), true);
t("intet trin er mindre værd end det foregående (dårligt ben)",
  K.JUGGLE_WEAK.every((_,i)=>i===0 || K.juggleWeakPoints(i) >= K.juggleWeakPoints(i-1)), true);
t("intet trin er værd mere end 20 - under den mindste medalje (25)",
  Math.max(...K.JUGGLE_MAIN_POINT, ...K.JUGGLE_WEAK_POINT), 20);
t("et trin uden for stigen giver nul",
  [K.juggleMainPoints(16), K.juggleMainPoints(99), K.juggleMainPoints(-1), K.juggleWeakPoints(12), K.juggleWeakPoints(-1)], [0,0,0,0,0]);

console.log("\nSamlede point");
t("hovedstigen i alt = 200", hovedPoint(K.JUGGLE_MAIN.length), 200);
t("dårligt ben i alt = 150", svagPoint(K.JUGGLE_WEAK.length), 150);
t("tricks i alt = 30 + 90 + 100 = 220", sum(K.JUGGLE_TRICKS.map(x=>x.point)), 220);
saet(0,0,[]);
t("en tom stige giver nul", K.ladderPoints(PID), 0);
saet(16,12,K.JUGGLE_TRICKS.map(x=>x.id));
t("hele stigen = 200 + 150 + 220 = 570", K.ladderPoints(PID), 570);
saet(15,10,K.JUGGLE_TRICKS.map(x=>x.id));
t("hovedstige 15, dårligt ben 10, alle tricks = 180 + 110 + 220 = 510", K.ladderPoints(PID), 510);
saet(11,8,["oploft"]);
t("hovedstige 11, dårligt ben 8, opløft = (4x5+4x10+3x15) + (3x5+3x10+2x15) + 10 = 190", K.ladderPoints(PID), 190);
saet(12,10,["oploft"]);
t("hovedstige 12, dårligt ben 10, opløft = 120 + 110 + 10 = 240", K.ladderPoints(PID), 240);
saet(3,0,[]);
t("tre trin = 5+5+5", K.ladderPoints(PID), 15);
saet(10,4,["oploft","vrist","skiftefod"]);
t("trin 10, svagt 4, 3 tricks = 90 + 25 + 30", K.ladderPoints(PID), 145);
saet(0,0,["oploft","oploft","oploft"]);
t("dubletter i tricks tæller stadig kun én gang", K.ladderPoints(PID), 10);
saet(99,99,[]);
t("et håndskrevet trin klippes stadig til stigens længde (16 og 12)",
  [K.juggleMainStep(PID), K.juggleWeakStep(PID), K.ladderPoints(PID)], [16, 12, 350]);
saet(16,0,[]);
t("trin 16 gemt som mainStep 16 virker", [K.juggleMainStep(PID), K.ladderPoints(PID)], [16, 200]);
saet(0,12,[]);
t("trin 12 gemt som weakStep 12 virker", [K.juggleWeakStep(PID), K.ladderPoints(PID)], [12, 150]);

console.log("\nMedaljemærkater (Talentmærkets krav er uændrede)");
const marks = K.juggleMedalMarks();
t("Talentmærkets højeste krav er stadig 150", K.criteria["Jonglering"][3]["Guld"][0], "150 jongleringer");
t("mærkaterne hentes stadig fra alle Talentmærkets krav", marks.hoved, {10:"N1 B",20:"N1 S",35:"N1 G",40:"N2 B",55:"N2 S",75:"N2 G",80:"N3 B",100:"N3 S",150:"N3 G"});
t("mærkater på dårligt ben", marks.daarligt, {5:"N2 S",10:"N2 G",15:"N3 B",20:"N3 S",30:"N3 G"});
t("trin med et mærkat på hovedstigen", K.JUGGLE_MAIN.filter(n=>marks.hoved[n]).map(n=>n+" "+marks.hoved[n]),
  ["10 N1 B","20 N1 S","40 N2 B","75 N2 G","100 N3 S","150 N3 G"]);
t("trin med et mærkat på dårligt ben (alle fem krav har et trin)", K.JUGGLE_WEAK.filter(n=>marks.daarligt[n]), [5,10,15,20,30]);
t("de nye trin 50, 200, 250 og 300 får intet mærkat", [50,200,250,300].map(n=>marks.hoved[n]), [undefined,undefined,undefined,undefined]);

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
  K.ladderPointsInWindow(PID, siden), 5 + 5 + 5 + 5);
t("hele perioden giver det samme som ladderPoints",
  K.ladderPointsInWindow(PID, new Date(2000,0,1)), K.ladderPoints(PID));
saet(1, 0, [], [{t:"main", v:0, at: iso(-1)}, {t:"main", v:1, at: iso(-1)}]);
t("et trin træneren har rullet tilbage, tæller ikke med i vinduet",
  K.ladderPointsInWindow(PID, siden), 5);
saet(16, 10, ["oploft"], [
  {t:"main", v:15, at: iso(-1)}, {t:"main", v:12, at: iso(-1)}, {t:"main", v:9, at: iso(-1)}, {t:"main", v:4, at: iso(-1)},
  {t:"weak", v:9, at: iso(-1)}, {t:"weak", v:7, at: iso(-1)}, {t:"weak", v:4, at: iso(-1)},
  {t:"trick", v:"oploft", at: iso(-1)}, {t:"main", v:0, at: iso(-10)}
]);
t("trin 16 og hver fase tælles med den nye takst i vinduet",
  K.ladderPointsInWindow(PID, siden), 20 + 20 + 15 + 10 + 20 + 15 + 10 + 10);
// Et barn, der tager hele stigen paa én eftermiddag (som den 2026-11-20), faar 570 i ugen.
saet(16, 12, K.JUGGLE_TRICKS.map(x=>x.id), [
  ...K.JUGGLE_MAIN.map((_,i)=>({t:"main", v:i, at: iso(0)})),
  ...K.JUGGLE_WEAK.map((_,i)=>({t:"weak", v:i, at: iso(0)})),
  ...K.JUGGLE_TRICKS.map(x=>({t:"trick", v:x.id, at: iso(0)}))
]);
t("hele stigen på én dag giver 570 i ugen", K.ladderPointsInWindow(PID, siden), 570);

console.log("\nFortryd må ikke kunne give point to gange");
// Spilleren tager trin 1, fortryder, og tager det igen. Loggen rummer nu to linjer for
// samme trin - men trinnet er kun taget én gang, så det må kun tælle én gang i vinduet.
saet(1, 0, [], [
  {t:"main", v:0, at: iso(-1)},
  {t:"undo", stige:"main", fra:1, til:0, at: iso(-1)},
  {t:"main", v:0, at: iso(-1)}
]);
t("samme trin to gange i loggen tæller kun én gang", K.ladderPointsInWindow(PID, siden), 5);
t("og all-time er uberørt, fordi det regnes af fremdriften", K.ladderPoints(PID), 5);
saet(2, 0, [], [
  {t:"main", v:0, at: iso(-1)}, {t:"main", v:1, at: iso(-1)},
  {t:"undo", stige:"main", fra:2, til:1, at: iso(-1)}, {t:"main", v:1, at: iso(-1)}
]);
t("to trin, hvoraf det ene er taget om", K.ladderPointsInWindow(PID, siden), 5 + 5);
saet(0, 0, ["oploft"], [
  {t:"trick", v:"oploft", at: iso(-1)},
  {t:"undo", stige:"trick", trick:"oploft", at: iso(-1)},
  {t:"trick", v:"oploft", at: iso(-1)}
]);
t("samme trick to gange i loggen tæller kun én gang", K.ladderPointsInWindow(PID, siden), 10);
saet(0, 2, [], [
  {t:"weak", v:0, at: iso(-1)}, {t:"weak", v:0, at: iso(-1)}, {t:"weak", v:1, at: iso(-1)}
]);
t("dårligt ben: dubletter tæller også kun én gang", K.ladderPointsInWindow(PID, siden), 5 + 5);

console.log("\nEt trin tæller kun i vinduet, hvor det blev nået første gang (pointreglerne 2026-11-24)");
// Spilleren tager trin 1 og 2 i oktober, fortryder trin 2 i oktober og tager det igen i
// november. Trinnet er stadig kun taget én gang - det hører til oktober.
const okt = new Date(2026, 9, 1), nov = new Date(2026, 10, 1), dec = new Date(2026, 11, 1);
const vind = (fra, til) => K.ladderPointsInWindow(PID, fra) - K.ladderPointsInWindow(PID, til);
const trinI = (fra, til) => K.ladderTrinIVindue(PID, fra) - K.ladderTrinIVindue(PID, til);
saet(2, 0, [], [
  {t:"main", v:1, at:"2026-11-03T17:00:00.000Z"},
  {t:"undo", stige:"main", fra:2, til:1, at:"2026-10-20T17:05:00.000Z"},
  {t:"main", v:1, at:"2026-10-20T17:00:00.000Z"},
  {t:"main", v:0, at:"2026-10-18T17:00:00.000Z"}
]);
t("fortryd i oktober, tag det igen i november: begge trin tæller i oktober", vind(okt, nov), 5 + 5);
t("og intet i november", vind(nov, dec), 0);
t("topscorerens trin: 2 i oktober, 0 i november", [trinI(okt, nov), trinI(nov, dec)], [2, 0]);
t("all-time er det samme som før", K.ladderPoints(PID), 10);
saet(0, 0, ["oploft"], [
  {t:"trick", v:"oploft", at:"2026-11-02T10:00:00.000Z"},
  {t:"undo", stige:"trick", trick:"oploft", at:"2026-10-30T10:00:00.000Z"},
  {t:"trick", v:"oploft", at:"2026-10-29T10:00:00.000Z"}
]);
t("et trick, fortrudt og taget igen i den næste måned, tæller i den første", [vind(okt, nov), vind(nov, dec)], [10, 0]);
saet(0, 1, [], [
  {t:"weak", v:0, at:"2026-11-02T10:00:00.000Z"},
  {t:"undo", stige:"weak", fra:1, til:0, at:"2026-10-30T10:00:00.000Z"},
  {t:"weak", v:0, at:"2026-10-29T10:00:00.000Z"}
]);
t("dårligt ben på samme måde", [vind(okt, nov), vind(nov, dec), trinI(okt, nov), trinI(nov, dec)], [5, 0, 1, 0]);
// Træneren ruller trin 2 tilbage i oktober; spilleren tager det igen i november. Det
// første trin 2 var stadig det første - det blev nået i oktober.
saet(2, 0, [], [
  {t:"main", v:1, at:"2026-11-04T10:00:00.000Z"},
  {t:"correct", stige:"main", fra:2, til:1, at:"2026-10-25T10:00:00.000Z"},
  {t:"main", v:1, at:"2026-10-21T10:00:00.000Z"}, {t:"main", v:0, at:"2026-10-20T10:00:00.000Z"}
]);
t("også efter trænerens rettelse tæller trinnet kun første gang", [vind(okt, nov), vind(nov, dec)], [10, 0]);
// Uge-vinduet: samme regel.
saet(1, 0, [], [{t:"main", v:0, at: iso(0)}, {t:"undo", stige:"main", fra:1, til:0, at: iso(-9)}, {t:"main", v:0, at: iso(-10)}]);
t("et trin taget for 10 dage siden og taget om i dag giver intet i ugen", K.ladderPointsInWindow(PID, siden), 0);

console.log("\nKun en registrering er en aktiv dag - ikke fortryd og ikke trænerens rettelse");
K.saetRolle("spiller");
K.saetJa(true);
const iDagIso = K.dagsISO(new Date());
K.skrivninger.length = 0;
K.saetData([{id:PID, mainStep: 2, weakStep: 0, tricks: [], days: ["2026-10-01"]}], [{id:PID, entries: []}]);
await K.undoJuggle("main");
const stigeSkrivning = () => K.skrivninger.find(x=>x.ref === "juggleLadder/" + PID)?.data || {};
t("fortryd skriver ikke dagen i days", "days" in stigeSkrivning(), false);
t("men fortrydelsen logges stadig", K.skrivninger.find(x=>x.ref === "juggleLog/" + PID)?.data.entries[0].t, "undo");
K.skrivninger.length = 0;
K.saetData([{id:PID, mainStep: 0, weakStep: 0, tricks: [], days: ["2026-10-01"]}], [{id:PID, entries: []}]);
await K.registerJuggle("main", 0);
t("en registrering skriver dagen i days", stigeSkrivning().days, ["2026-10-01", iDagIso]);
K.skrivninger.length = 0;
K.saetData([{id:PID, mainStep: 0, weakStep: 0, tricks: ["oploft"], days: []}], [{id:PID, entries: []}]);
await K.undoJuggleTrick("oploft");
t("fortryd af et trick skriver heller ikke dagen", "days" in stigeSkrivning(), false);
K.saetRolle("traener");
K.skrivninger.length = 0;
K.saetData([{id:PID, mainStep: 2, weakStep: 0, tricks: [], days: []}], [{id:PID, entries: []}]);
K.saetSvar("1");
await K.correctJuggle(PID, "main");
t("trænerens rettelse skriver ikke dagen", "days" in stigeSkrivning(), false);
K.saetSvar("3");
K.saetData([{id:PID, mainStep: 0, weakStep: 2, tricks: [], days: []}], [{id:PID, entries: []}]);
await K.correctJuggle(PID, "weak");
t("rettelsen af dårligt ben spørger om berøringer, ikke jongleringer",
  K.beskeder.some(b=>/3 berøringer med det dårlige ben|\(3 berøringer med det dårlige ben\)/.test(b)) && !K.beskeder.some(b=>/Ret .*dårligt ben-stigen.*jongleringer/s.test(b)), true);
K.saetJa(false);
K.saetSvar(null);

console.log("\nEt fortrudt trin holder op med at tælle");
saet(0, 0, [], [{t:"main", v:0, at: iso(-1)}, {t:"undo", stige:"main", fra:1, til:0, at: iso(-1)}]);
t("fortrudt trin giver ingen point i vinduet", K.ladderPointsInWindow(PID, siden), 0);
t("og heller ikke all-time", K.ladderPoints(PID), 0);
saet(0, 0, [], [{t:"trick", v:"oploft", at: iso(-1)}, {t:"undo", stige:"trick", trick:"oploft", at: iso(-1)}]);
t("fortrudt trick giver ingen point", K.ladderPointsInWindow(PID, siden), 0);

console.log("\nBeskederne viser de nye point");
const sidste = () => K.beskeder[K.beskeder.length-1] || "";
const pointI = m => (/(?:giver|mister) (\d+) point/.exec(m) || /([+-]\d+) point/.exec(m) || [])[1];
K.saetRolle("spiller");
saet(15, 9, ["oploft"]);
await K.registerJuggle("main", 15);
t("registrér trin 16: \"300 jongleringer\" giver 20 point", [/"300 jongleringer"/.test(sidste()), pointI(sidste())], [true, "20"]);
await K.registerJuggle("weak", 9);
t("registrér dårligt ben trin 10 (50) giver 20 point", [/"50 med dårligt ben"/.test(sidste()), pointI(sidste())], [true, "20"]);
saet(0, 11, []);
await K.registerJuggle("weak", 11);
t("registrér dårligt ben trin 12 (100) giver 20 point", [/"100 med dårligt ben"/.test(sidste()), pointI(sidste())], [true, "20"]);
saet(4, 0, ["oploft"]);
await K.registerJuggle("main", 4);
t("registrér trin 5 (15 jongleringer) giver 10 point", pointI(sidste()), "10");
saet(16, 10, ["oploft"]);
await K.undoJuggle("main");
t("fortryd trin 16: mister 20 point", [/"300 jongleringer"/.test(sidste()), pointI(sidste())], [true, "20"]);
saet(10, 0, ["oploft"]);
await K.undoJuggle("main");
t("fortryd trin 10 (75 jongleringer): mister 15 point", [/"75 jongleringer"/.test(sidste()), pointI(sidste())], [true, "15"]);
saet(0, 8, []);
await K.undoJuggle("weak");
t("fortryd dårligt ben trin 8 (30): mister 15 point", [/"30 med dårligt ben"/.test(sidste()), pointI(sidste())], [true, "15"]);
saet(0, 3, []);
await K.undoJuggle("weak");
t("fortryd dårligt ben trin 3: mister 5 point", pointI(sidste()), "5");

console.log("\nOpløft lukker porten - tabet regnes med de nye point");
saet(16, 0, ["oploft"]);
await K.undoJuggleTrick("oploft");
// Trin 4-16 ruller tilbage: 5 + 4x10 + 4x15 + 4x20 = 185, plus opløft 10.
t("fortryd opløft på trin 16: hovedstigen tilbage til 3 og 195 point i alt", /tilbage til trin 3, og du mister 195 point i alt/.test(sidste()), true);
saet(5, 0, ["oploft"]);
await K.undoJuggleTrick("oploft");
t("fortryd opløft på trin 5: 5 + 10 + opløft 10 = 25", /du mister 25 point i alt/.test(sidste()), true);
saet(3, 0, ["oploft","vrist"]);
await K.undoJuggleTrick("oploft");
t("på trin 3 lukker porten ingenting: kun opløftets 10", sidste().endsWith("Du mister 10 point."), true);
await K.undoJuggleTrick("vrist");
t("et andet trick: kun dets egne point", sidste().endsWith("Du mister 10 point."), true);

console.log("\nTrænerens rettelser viser forskellen med de nye point");
K.saetRolle("traener");
saet(11, 8, ["oploft"]);
t("udgangspunktet: 190", K.ladderPoints(PID), 190);
K.saetSvar("16");
await K.correctJuggle(PID, "main");
t("prompten siger 11 af 16 trin", /Står nu på 11 af 16 trin \(100 jongleringer\)/.test(K.beskeder[K.beskeder.length-2]), true);
t("hovedstige 11 -> 16: +15 + 4x20 = +95 point", pointI(sidste()), "+95");
K.saetSvar("9");
await K.correctJuggle(PID, "main");
t("hovedstige 11 -> 9: -15x2 = -30 point", pointI(sidste()), "-30");
K.saetSvar("0");
await K.correctJuggle(PID, "main");
t("hovedstige 11 -> 0: -105 point", pointI(sidste()), "-105");
K.saetSvar("5");
await K.correctJuggle(PID, "weak");
t("prompten siger 8 af 12 trin", /Står nu på 8 af 12 trin/.test(K.beskeder[K.beskeder.length-2]), true);
t("dårligt ben 8 -> 5: -(15 + 15 + 10) = -40 point", pointI(sidste()), "-40");
K.saetSvar("12");
await K.correctJuggle(PID, "weak");
t("dårligt ben 8 -> 12: +(15 + 3x20) = +75 point", pointI(sidste()), "+75");
K.saetSvar("13");
await K.correctJuggle(PID, "weak");
t("13 trin på dårligt ben afvises - stigen har 12", sidste(), "Skriv et tal mellem 0 og 12.");
K.saetSvar("17");
await K.correctJuggle(PID, "main");
t("17 trin afvises - stigen har 16", sidste(), "Skriv et tal mellem 0 og 16.");
await K.correctJuggleTrick(PID, "oploft");
t("træneren fjerner opløft: -10 point (trickets egne)", pointI(sidste()), "-10");

console.log("\n14 tricks i tre grupper (pointreglerne 2026-11-28)");
const trickPoint = Object.fromEntries(K.JUGGLE_TRICKS.map(x=>[x.id, x.point]));
t("hvert tricks point (godkendt liste)", trickPoint, {
  oploft:10, vrist:10, skiftefod:10,
  laarfod:15, hoved:15, gribfod:15, inderside3:15, yderside3:15, haelbagom3:15,
  jordenrundt:20, hoved10:20, inderside5:20, yderside5:20, haelbagom5:20});
t("navnene i rækkefølge", K.JUGGLE_TRICKS.map(x=>x.navn), ["Opløft","Stop på vristen","Skiftefod",
  "Lår-fod-lår-fod","3 hovedstød","Grib bolden på foden","Inderside 3","Yderside 3","Hælen bagom 3",
  "Jorden rundt","10 hovedstød","Inderside 5","Yderside 5","Hælen bagom 5"]);
t("teksterne på de nye og flyttede serietricks", ["inderside3","yderside3","inderside5","yderside5"].map(id=>K.juggleTrick(id).tekst),
  ["3 i træk med indersiden af foden.","3 i træk med ydersiden af foden.","5 i træk med indersiden af foden.","5 i træk med ydersiden af foden."]);
t("14 tricks med hver sit id", [K.JUGGLE_TRICKS.length, new Set(K.JUGGLE_TRICKS.map(x=>x.id)).size], [14, 14]);
t("højst 16 i Firestore-reglerne - plads til hele listen", K.JUGGLE_TRICKS.length <= 16, true);
t("grupperne: Let 10, Mellem 15, Svær 20", K.JUGGLE_TRICK_NIVEAUER.map(n=>n.navn + " " + n.point), ["Let 10","Mellem 15","Svær 20"]);
t("hvert tricks point passer til dets gruppe",
  K.JUGGLE_TRICKS.every(x=>x.point === K.JUGGLE_TRICK_NIVEAUER.find(n=>n.id === x.niveau)?.point), true);
t("3 lette (30), 6 mellem (90), 5 svære (100)", K.JUGGLE_TRICK_NIVEAUER.map(n=>{
  const xs = K.JUGGLE_TRICKS.filter(x=>x.niveau === n.id); return [xs.length, sum(xs.map(x=>x.point))]; }), [[3,30],[6,90],[5,100]]);
t("de seks gamle id'er findes stadig og betyder det samme",
  ["oploft","vrist","skiftefod","laarfod","hoved","jordenrundt"].map(id=>K.juggleTrick(id)?.navn),
  ["Opløft","Stop på vristen","Skiftefod","Lår-fod-lår-fod","3 hovedstød","Jorden rundt"]);
t("de udgåede id'er er ikke tricks længere", ["inderside10","inderside20","yderside10","yderside20"].map(id=>K.juggleTrick(id)), [null,null,null,null]);
saet(0,0,["jordenrundt"]);
t("Jorden rundt giver nu 20 (også for et barn, der allerede havde den)", K.ladderPoints(PID), 20);
saet(0,0,["oploft","vrist","skiftefod","laarfod","hoved","jordenrundt"]);
t("de seks gamle tricks = 30 + 30 + 20 = 80 (før 75)", K.ladderPoints(PID), 80);
saet(0,0,["hoved10","gribfod","inderside3","ukendt","hoved10"]);
t("nye tricks tæller, ukendte og dubletter ikke: 20 + 15 + 15", K.ladderPoints(PID), 50);
t("serierne: hvem kræver hvem", K.JUGGLE_TRICKS.filter(x=>x.kraever).map(x=>x.kraever + ">" + x.id),
  ["inderside3>inderside5","yderside3>yderside5","haelbagom3>haelbagom5"]);
t("et krævet trick står altid før i listen og i en lettere gruppe",
  K.JUGGLE_TRICKS.filter(x=>x.kraever).every(x=>{
    const f = K.juggleTrick(x.kraever), niv = id=>K.JUGGLE_TRICK_NIVEAUER.findIndex(n=>n.id===id);
    return f && K.JUGGLE_TRICKS.indexOf(f) < K.JUGGLE_TRICKS.indexOf(x) && niv(f.niveau) < niv(x.niveau); }), true);
t("10 hovedstød kræver ikke 3 hovedstød", K.juggleTrick("hoved10").kraever, undefined);
t("efterfølgerne i en serie", ["inderside3","inderside5","yderside3","haelbagom3","hoved"].map(id=>K.juggleTrickEfterfoelgere(id).map(x=>x.id)),
  [["inderside5"],[],["yderside5"],["haelbagom5"],[]]);

console.log("\nUdgåede id'er tæller som deres alias, og serierne er altid hele (ingen omskrivning i databasen)");
t("aliaserne", Object.fromEntries(Object.entries(K.JUGGLE_TRICK_ALIAS).map(([k, v])=>[k, v.til])),
  {inderside10:"inderside5", inderside20:"inderside5", yderside10:"yderside5", yderside20:"yderside5"});
t("et alias peger altid på et trick, der findes, og er aldrig selv et trick",
  Object.entries(K.JUGGLE_TRICK_ALIAS).every(([k, v])=>!K.juggleTrick(k) && K.juggleTrick(v.til)), true);
t("juggleTrickKanonisk: alias, nyt id, ukendt og prototype-navne",
  ["inderside10","yderside20","inderside5","ukendt","constructor","__proto__"].map(K.juggleTrickKanonisk),
  ["inderside5","yderside5","inderside5","ukendt","constructor","__proto__"]);
t("constructor/__proto__ giver ingen tricks", K.juggleTricksAf(["constructor","__proto__","toString"]), []);
const point = tricks => { saet(0,0,tricks); return K.ladderPoints(PID); };
const har = tricks => { saet(0,0,tricks); return K.juggleTricks(PID); };
t("gemt inderside10 = Inderside 5 + Inderside 3 = 35", [har(["inderside10"]), point(["inderside10"])], [["inderside3","inderside5"], 35]);
t("gemt inderside5 alene (fra da den var let) = 35", [har(["inderside5"]), point(["inderside5"])], [["inderside3","inderside5"], 35]);
t("gemt inderside20 = 35 (ikke 20 + 35)", point(["inderside20"]), 35);
t("gemt inderside5 + 10 + 20 = stadig kun 35", [har(["inderside5","inderside10","inderside20"]), point(["inderside5","inderside10","inderside20"])], [["inderside3","inderside5"], 35]);
t("gemt inderside20 + yderside10 = 35 + 35 = 70", [har(["inderside20","yderside10"]), point(["inderside20","yderside10"])],
  [["inderside3","inderside5","yderside3","yderside5"], 70]);
t("alle 16 gamle id'er (en fuld gammel liste) = alle 14 nye = 220",
  [har(["oploft","vrist","skiftefod","inderside5","yderside5","laarfod","hoved","gribfod","inderside10","yderside10","haelbagom3","jordenrundt","hoved10","inderside20","yderside20","haelbagom5"]).length,
   point(["oploft","vrist","skiftefod","inderside5","yderside5","laarfod","hoved","gribfod","inderside10","yderside10","haelbagom3","jordenrundt","hoved10","inderside20","yderside20","haelbagom5"])], [14, 220]);
t("Hælen bagom 5 alene giver også Hælen bagom 3 = 35", [har(["haelbagom5"]), point(["haelbagom5"])], [["haelbagom3","haelbagom5"], 35]);
t("Inderside 3 alene giver ikke Inderside 5", [har(["inderside3"]), point(["inderside3"])], [["inderside3"], 15]);
t("rækkefølgen er den gemte, med de forrige i serien lige før", har(["vrist","yderside20","inderside3","inderside10"]), ["vrist","yderside3","yderside5","inderside3","inderside5"]);
t("gamle og nye blandet med dubletter tæller hver kun én gang", point(["inderside3","inderside5","inderside10","inderside10","inderside3"]), 35);
saet(0,0,["inderside10"]);
t("en gemt inderside10 åbner ikke noget nyt - Inderside 5 står som klaret, ikke spærret", [K.juggleTrickSpaerret(PID, "inderside5"), K.juggleTricks(PID).includes("inderside5")], [null, true]);
t("navnet i trænerens log", ["inderside10","yderside20","inderside5","ukendt"].map(K.juggleTrickNavn),
  ["Inderside 10 (tæller som Inderside 5)","Yderside 20 (tæller som Yderside 5)","Inderside 5","ukendt"]);

console.log("\nSerierne tages i rækkefølge");
K.saetRolle("spiller");
K.skrivninger.length = 0;
const laast = async (tricks, id) => { saet(0,0,tricks); await K.registerJuggle("trick", id); return sidste(); };
t("Inderside 5 uden Inderside 3 er låst", await laast([], "inderside5"), '"Inderside 5" er låst.\n\nTag Inderside 3 først - serien tages i rækkefølge.');
t("Yderside 5 åbnes ikke af Inderside 3", /Tag Yderside 3 først/.test(await laast(["inderside3"], "yderside5")), true);
t("Hælen bagom 5 uden 3 er låst", /Tag Hælen bagom 3 først/.test(await laast([], "haelbagom5")), true);
t("et låst trick skrives ikke", K.skrivninger.length, 0);
t("Inderside 5 efter Inderside 3: giver 20 point", pointI(await laast(["inderside3"], "inderside5")), "20");
t("Yderside 5 efter Yderside 3: giver 20 point", pointI(await laast(["yderside3"], "yderside5")), "20");
t("Hælen bagom 5 efter 3: giver 20 point", pointI(await laast(["haelbagom3"], "haelbagom5")), "20");
t("10 hovedstød kan tages uden 3 hovedstød: giver 20 point", pointI(await laast([], "hoved10")), "20");
t("Grib bolden på foden: giver 15 point", pointI(await laast([], "gribfod")), "15");
t("Inderside 3 kan altid tages: giver 15 point", pointI(await laast([], "inderside3")), "15");
t("Skiftefod: giver 10 point", pointI(await laast([], "skiftefod")), "10");
t("Inderside 5 hos et barn med gemt inderside10 er allerede registreret", await laast(["inderside10"], "inderside5"), "Det trick er allerede registreret.");
t("og det er Inderside 3 også", await laast(["inderside10"], "inderside3"), "Det trick er allerede registreret.");
const foerUdgaaet = K.beskeder.length;
await laast([], "inderside10");
t("et udgået id kan ikke registreres (ingen dialog, ingen skrivning)", [K.beskeder.length - foerUdgaaet, K.skrivninger.length], [0, 0]);
saet(0,0,[]);
t("spærringen spørges direkte", [K.juggleTrickSpaerret(PID, "inderside3"), K.juggleTrickSpaerret(PID, "inderside5")?.id], [null, "inderside3"]);
K.saetJa(true);
K.skrivninger.length = 0;
await laast(["inderside3"], "inderside5");
const [stigeSkriv, logSkriv] = K.skrivninger;
t("registreringen i rækkefølge skriver begge tricks", [stigeSkriv?.ref, stigeSkriv?.data.tricks], ["juggleLadder/p1", ["inderside3","inderside5"]]);
t("og logger tricket", [logSkriv?.ref, logSkriv?.data.entries[0].t, logSkriv?.data.entries[0].v], ["juggleLog/p1", "trick", "inderside5"]);
K.skrivninger.length = 0;
await laast(["inderside20","yderside10","haelbagom5","oploft","inderside20"], "vrist");
t("en ny registrering gemmer kun nye id'er - de udgåede forsvinder, serierne står hele",
  K.skrivninger[0]?.data.tricks, ["inderside3","inderside5","yderside3","yderside5","haelbagom3","haelbagom5","oploft","vrist"]);
K.skrivninger.length = 0;
const fuldGammel = ["oploft","vrist","skiftefod","inderside5","yderside5","laarfod","hoved","gribfod","inderside10","yderside10","haelbagom3","jordenrundt","hoved10","inderside20","yderside20"];
await laast(fuldGammel, "haelbagom5");
t("en gammel liste med 15 id'er + et nyt trick: 14 id'er gemmes, under loftet på 16",
  [K.skrivninger[0]?.data.tricks.length, K.skrivninger[0]?.data.tricks.every(id=>K.juggleTrick(id))], [14, true]);
K.saetJa(false);

console.log("\nFortryd ruller serien med tilbage");
const fortrydTrick = async (tricks, id) => { saet(0,0,tricks); K.skrivninger.length = 0; await K.undoJuggleTrick(id); return sidste(); };
t("fortryd Inderside 3 med 5: dialogen nævner den og 35 point",
  await fortrydTrick(["inderside3","inderside5","hoved"], "inderside3"),
  'Fortryd "Inderside 3"?\n\nInderside 5 bygger på Inderside 3 og bliver også fortrudt. Du mister 35 point i alt.');
t("fortryd det sidste i serien: kun dets egne 20", (await fortrydTrick(["inderside3","inderside5"], "inderside5")).endsWith("Du mister 20 point."), true);
t("fortryd Inderside 3 alene: kun 15", (await fortrydTrick(["inderside3","yderside3","yderside5"], "inderside3")).endsWith("Du mister 15 point."), true);
t("fortryd Hælen bagom 3 med 5: 35 point i alt", /Hælen bagom 5 bygger på Hælen bagom 3 og bliver også fortrudt\. Du mister 35 point i alt\./.test(await fortrydTrick(["haelbagom3","haelbagom5"], "haelbagom3")), true);
t("fortryd 3 hovedstød rører ikke 10 hovedstød", (await fortrydTrick(["hoved","hoved10"], "hoved")).endsWith("Du mister 15 point."), true);
t("gemt inderside10: fortryd Inderside 3 nævner Inderside 5 og 35 point",
  /Inderside 5 bygger på Inderside 3 og bliver også fortrudt\. Du mister 35 point i alt\./.test(await fortrydTrick(["inderside10"], "inderside3")), true);
const foerFortrydUdgaaet = K.beskeder.length;
await fortrydTrick(["inderside10"], "inderside10");
t("et udgået id kan ikke fortrydes direkte (der er ingen knap) - ingen dialog, ingen skrivning", [K.beskeder.length - foerFortrydUdgaaet, K.skrivninger.length], [0, 0]);
t("nej skriver ingenting", K.skrivninger.length, 0);
K.saetJa(true);
await fortrydTrick(["inderside3","inderside5","hoved"], "inderside3");
t("ja: kun 3 hovedstød er tilbage", K.skrivninger[0]?.data.tricks, ["hoved"]);
t("loggen siger hvad der rullede med", (({t: a, stige, trick, ogsaa})=>({a, stige, trick, ogsaa}))(K.skrivninger[1]?.data.entries[0] || {}),
  {a:"undo", stige:"trick", trick:"inderside3", ogsaa:["inderside5"]});
await fortrydTrick(["inderside10","hoved"], "inderside5");
t("gemt inderside10, fortryd Inderside 5: inderside10 fjernes også (ellers kom 5'eren tilbage), Inderside 3 bliver",
  K.skrivninger[0]?.data.tricks, ["inderside3","hoved"]);
saet(0,0,K.skrivninger[0]?.data.tricks);
t("og bagefter har barnet Inderside 3 og ikke 5 (15 + 15)", [K.juggleTricks(PID), K.ladderPoints(PID)], [["inderside3","hoved"], 30]);
await fortrydTrick(["inderside5","inderside10","inderside20","vrist"], "inderside5");
t("gemt 5 + 10 + 20, fortryd Inderside 5: alle tre forsvinder", K.skrivninger[0]?.data.tricks, ["inderside3","vrist"]);
await fortrydTrick(["inderside20","yderside10"], "inderside3");
t("gemt inderside20 + yderside10, fortryd Inderside 3: hele inderside-serien og inderside20 væk, Yderside bliver",
  K.skrivninger[0]?.data.tricks, ["yderside3","yderside5"]);
t("og loggen siger, Inderside 5 rullede med", K.skrivninger[1]?.data.entries[0].ogsaa, ["inderside5"]);
await fortrydTrick(["yderside3","yderside5","inderside3"], "yderside5");
t("fortryd Yderside 5: Yderside 3 og Inderside 3 bliver", K.skrivninger[0]?.data.tricks, ["yderside3","inderside3"]);
await fortrydTrick(["vrist"], "vrist");
t("et trick uden serie logges uden ogsaa", "ogsaa" in (K.skrivninger[1]?.data.entries[0] || {}), false);
K.saetJa(false);
saet(0, 0, ["hoved"], [
  {t:"trick", v:"inderside3", at: iso(-1)}, {t:"trick", v:"inderside5", at: iso(-1)},
  {t:"trick", v:"hoved", at: iso(-1)}, {t:"undo", stige:"trick", trick:"inderside3", ogsaa:["inderside5"], at: iso(-1)}]);
t("efter fortrydelsen tæller de fortrudte heller ikke i ugen", [K.ladderPointsInWindow(PID, siden), K.ladderPoints(PID)], [15, 15]);
saet(0, 0, ["inderside3"], [{t:"trick", v:"inderside10", at: iso(-1)}, {t:"undo", stige:"trick", trick:"inderside5", at: iso(-1)}]);
t("en fortrudt inderside10 i loggen tæller ikke i ugen, når Inderside 5 er fortrudt", K.ladderPointsInWindow(PID, siden), 0);

console.log("\nTrænerens rettelse holder serien hel");
K.saetRolle("traener");
const ret = async (tricks, id) => { saet(0,0,tricks); K.skrivninger.length = 0; await K.correctJuggleTrick(PID, id); return sidste(); };
t("fjern Inderside 3: Inderside 5 ryger med, -35",
  await ret(["inderside3","inderside5"], "inderside3"),
  'Fjern "Inderside 3" for Testbarn?\n\nInderside 5 bygger på Inderside 3 og bliver også fjernet.\n\n-35 point. Rettelsen bliver logget med din e-mail.');
t("giv Inderside 5 til et barn uden serien: 3 gives med, +35",
  await ret([], "inderside5"),
  'Giv "Inderside 5" for Testbarn?\n\nInderside 3 kommer før i serien og bliver også givet.\n\n+35 point. Rettelsen bliver logget med din e-mail.');
t("giv Yderside 5 med Yderside 3: kun den, +20", /^Giv "Yderside 5" for Testbarn\?\n\n\+20 point/.test(await ret(["yderside3"], "yderside5")), true);
t("giv 10 hovedstød: kun det, +20", /^Giv "10 hovedstød" for Testbarn\?\n\n\+20 point/.test(await ret([], "hoved10")), true);
t("fjern Jorden rundt: -20", pointI(await ret(["jordenrundt"], "jordenrundt")), "-20");
t("gemt inderside10: Inderside 5 står som klaret og fjernes, -20", /^Fjern "Inderside 5" for Testbarn\?\n\n-20 point/.test(await ret(["inderside10"], "inderside5")), true);
t("gemt yderside20: fjern Yderside 3 tager 5'eren med, -35", /Yderside 5 bygger på Yderside 3 og bliver også fjernet\.\n\n-35 point/.test(await ret(["yderside20"], "yderside3")), true);
K.saetJa(true);
await ret([], "inderside5");
t("ja: hele serien gemmes i rækkefølge", K.skrivninger[0]?.data.tricks, ["inderside3","inderside5"]);
t("og logges som én rettelse med de andre i ogsaa", (({til, trick, ogsaa})=>({til, trick, ogsaa}))(K.skrivninger[1]?.data.entries[0] || {}),
  {til:"givet", trick:"inderside5", ogsaa:["inderside3"]});
await ret(["inderside3","inderside5","haelbagom3","haelbagom5"], "inderside3");
t("fjern Inderside 3: kun Hælen bagom bliver", K.skrivninger[0]?.data.tricks, ["haelbagom3","haelbagom5"]);
await ret(["inderside10","inderside20","vrist"], "inderside5");
t("gemt inderside10 + 20, fjern Inderside 5: begge udgåede id'er væk, Inderside 3 bliver", K.skrivninger[0]?.data.tricks, ["inderside3","vrist"]);
await ret(["yderside10"], "hoved");
t("en rettelse af et andet trick gemmer kun nye id'er", K.skrivninger[0]?.data.tricks, ["yderside3","yderside5","hoved"]);
// Uanset udgangspunkt og hvilket trick træneren trykker på, står serierne hele bagefter.
const hel = xs => xs.every(id=>{ const k = K.juggleTrick(id)?.kraever; return !k || xs.includes(k); });
const udgangspunkter = [[], K.JUGGLE_TRICKS.map(x=>x.id), ["inderside3","yderside3","haelbagom3"], ["inderside3","inderside5","yderside3","hoved"], ["yderside3","yderside5"],
  ["inderside10"], ["inderside20","yderside10","haelbagom5"], ["inderside5","yderside5"], fuldGammel];
let alleHele = true, alleVendt = true, kunNye = true;
for(const start of udgangspunkter) for(const x of K.JUGGLE_TRICKS){
  await ret(start, x.id);
  const efter = K.skrivninger[0]?.data.tricks || [];
  if(!hel(efter)) alleHele = false;
  if(!efter.every(id=>K.juggleTrick(id)) || new Set(efter).size !== efter.length || efter.length > 16) kunNye = false;
  if(efter.includes(x.id) === K.juggleTricksAf(start).includes(x.id)) alleVendt = false;
}
t("hver rettelse fra ni udgangspunkter (også gamle id'er) efterlader hele serier", alleHele, true);
t("og vender altid det trick, træneren trykkede på", alleVendt, true);
t("og gemmer kun nye id'er, uden dubletter, højst 16", kunNye, true);
K.saetJa(false);

console.log("\nTricks i vinduet og i Månedens topscorer");
saet(3, 0, K.JUGGLE_TRICKS.map(x=>x.id), [
  {t:"trick", v:"inderside3", at: iso(-10)}, {t:"trick", v:"inderside5", at: iso(-1)},
  {t:"trick", v:"jordenrundt", at: iso(-1)}, {t:"trick", v:"hoved10", at: iso(-1)}, {t:"trick", v:"hoved10", at: iso(-1)},
  {t:"main", v:0, at: iso(-1)}, {t:"main", v:1, at: iso(-1)}, {t:"main", v:2, at: iso(-10)}
]);
t("tricks tæller efter loggens dato med deres egne point: 20 + 20 + 20 (+ 2 trin à 5)", K.ladderPointsInWindow(PID, siden), 20 + 20 + 20 + 5 + 5);
t("topscorerens øvelser tæller kun trin, ikke tricks", K.ladderTrinIVindue(PID, siden), 2);
saet(0, 0, ["inderside3","inderside5","hoved10"], [{t:"trick", v:"inderside3", at: iso(-1)}, {t:"trick", v:"inderside5", at: iso(-1)}, {t:"trick", v:"hoved10", at: iso(-1)}]);
t("kun tricks i måneden: 55 point, 0 øvelser", [K.ladderPointsInWindow(PID, siden), K.ladderTrinIVindue(PID, siden)], [55, 0]);
saet(0, 0, ["inderside10"], [{t:"trick", v:"inderside5", at: iso(-1)}, {t:"trick", v:"inderside10", at: iso(-1)}]);
t("gemt inderside10, logget i ugen: Inderside 5 tæller (20); Inderside 3 har ingen log-linje og tæller kun i alt",
  [K.ladderPointsInWindow(PID, siden), K.ladderPoints(PID), K.ladderTrinIVindue(PID, siden)], [20, 35, 0]);
saet(0, 0, ["inderside5","inderside10","inderside20"], [{t:"trick", v:"inderside20", at: iso(-1)}, {t:"trick", v:"inderside10", at: iso(-1)}, {t:"trick", v:"inderside5", at: iso(-10)}]);
t("5 for 10 dage siden, 10 og 20 i ugen: Inderside 5 blev nået første gang for 10 dage siden - 0 i ugen",
  [K.ladderPointsInWindow(PID, siden), K.ladderPointsInWindow(PID, new Date(2000,0,1)), K.ladderPoints(PID)], [0, 20, 35]);
saet(0, 0, ["inderside20","yderside10"], [{t:"trick", v:"inderside20", at: iso(-10)}, {t:"trick", v:"yderside10", at: iso(-1)}]);
t("inderside20 for 10 dage siden, yderside10 i ugen: kun Yderside 5 (20) i ugen", K.ladderPointsInWindow(PID, siden), 20);
saet(0, 0, [], [{t:"trick", v:"inderside10", at: iso(-1)}]);
t("en logget inderside10 uden noget på stigen tæller ikke", K.ladderPointsInWindow(PID, siden), 0);
const okt2 = new Date(2026, 9, 1), nov2 = new Date(2026, 10, 1), dec2 = new Date(2026, 11, 1);
saet(2, 0, ["oploft","yderside20"], [
  {t:"trick", v:"yderside20", at:"2026-11-24T10:00:00Z"}, {t:"trick", v:"yderside10", at:"2026-11-23T10:00:00Z"},
  {t:"trick", v:"yderside5", at:"2026-10-30T10:00:00Z"}, {t:"main", v:1, at:"2026-11-02T10:00:00Z"}, {t:"main", v:0, at:"2026-10-02T10:00:00Z"},
  {t:"trick", v:"oploft", at:"2026-10-01T10:00:00Z"}]);
const vind2 = (fra, til) => K.ladderPointsInWindow(PID, fra) - K.ladderPointsInWindow(PID, til);
const trin2 = (fra, til) => K.ladderTrinIVindue(PID, fra) - K.ladderTrinIVindue(PID, til);
t("måned for måned: oktober opløft 10 + trin 5 + Yderside 5 20; november trin 5 (yderside10/20 er den samme Yderside 5)",
  [vind2(okt2, nov2), vind2(nov2, dec2)], [35, 5]);
t("topscorerens trin er de samme som uden tricks: 1 og 1", [trin2(okt2, nov2), trin2(nov2, dec2)], [1, 1]);
t("i alt: 10 trin + opløft 10 + Yderside 3 og 5 (35)", K.ladderPoints(PID), 10 + 10 + 35);

console.log("\nReglerne, børnene læser");
const regler = K.JUGGLE_RULES.join(" ");
t("reglerne nævner 5, 10, 15 og 20 point pr. trin",
  /5 point pr\. trin i Find kontakten, 10 i Rytme, 15 i Kontrol og 20 i Udholdenhed/.test(regler), true);
t("reglerne nævner tricksenes point og serierne",
  /Tricks: Let giver 10 point, Mellem 15 og Svær 20\. Inderside, Yderside og Hælen bagom er serier, der tages i rækkefølge/.test(regler), true);
t("og intet om at point = antal jongleringer eller dobbelt", /lige så mange point|dobbelt/.test(regler), false);
t("guiden til forældre siger det samme", /Hvert trin giver 5, 10, 15 eller 20 point/.test(html) && !/40 jongleringer giver 40 point/.test(html), true);

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
