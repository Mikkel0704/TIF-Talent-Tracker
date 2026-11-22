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
function canAccessPlayer(){ return true; }
function besked(m){ beskeder.push(String(m)); }
async function spoerg(m){ beskeder.push(String(m)); return ja; }
async function indtast(m){ beskeder.push(String(m)); return svar; }
function dagsISO(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
${stepsKode}
${kravKode}
`;
const efterspil = `
export { JUGGLE_MAIN, JUGGLE_WEAK, JUGGLE_MAIN_POINT, JUGGLE_WEAK_POINT, JUGGLE_TRICKS, JUGGLE_PHASES, JUGGLE_WEAK_PHASES, JUGGLE_RULES,
         JUGGLE_GATE_AFTER, JUGGLE_TRICK_NIVEAUER, juggleTrick, juggleTrickSpaerret, juggleTrickEfterfoelgere, ladderTrinIVindue, juggleMainPoints, juggleWeakPoints, jugglePhaseFor, juggleMedalMarks,
         ladderPoints, ladderPointsInWindow, juggleMainStep, juggleWeakStep, juggleTricks,
         registerJuggle, undoJuggle, undoJuggleTrick, correctJuggle, correctJuggleTrick, criteria };
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
t("tricks i alt = 50 + 90 + 100 = 240", sum(K.JUGGLE_TRICKS.map(x=>x.point)), 240);
saet(0,0,[]);
t("en tom stige giver nul", K.ladderPoints(PID), 0);
saet(16,12,K.JUGGLE_TRICKS.map(x=>x.id));
t("hele stigen = 200 + 150 + 240 = 590", K.ladderPoints(PID), 590);
saet(15,10,K.JUGGLE_TRICKS.map(x=>x.id));
t("hovedstige 15, dårligt ben 10, alle tricks = 180 + 110 + 240 = 530", K.ladderPoints(PID), 530);
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
// Et barn, der tager hele stigen paa én eftermiddag (som den 2026-11-20), faar 590 i ugen.
saet(16, 12, K.JUGGLE_TRICKS.map(x=>x.id), [
  ...K.JUGGLE_MAIN.map((_,i)=>({t:"main", v:i, at: iso(0)})),
  ...K.JUGGLE_WEAK.map((_,i)=>({t:"weak", v:i, at: iso(0)})),
  ...K.JUGGLE_TRICKS.map(x=>({t:"trick", v:x.id, at: iso(0)}))
]);
t("hele stigen på én dag giver 590 i ugen", K.ladderPointsInWindow(PID, siden), 590);

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

console.log("\nReglerne, børnene læser");
const regler = K.JUGGLE_RULES.join(" ");
t("reglerne nævner 5, 10, 15 og 20 point pr. trin",
  /5 point pr\. trin i Find kontakten, 10 i Rytme, 15 i Kontrol og 20 i Udholdenhed/.test(regler), true);
t("og intet om at point = antal jongleringer eller dobbelt", /lige så mange point|dobbelt/.test(regler), false);
t("guiden til forældre siger det samme", /Hvert trin giver 5, 10, 15 eller 20 point/.test(html) && !/40 jongleringer giver 40 point/.test(html), true);

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
