import * as K from "./kode.mjs";

let ok = 0, fejl = 0;
function t(navn, fik, vent){
  const a = JSON.stringify(fik), b = JSON.stringify(vent);
  if(a === b){ ok++; console.log("  ok   " + navn); }
  else { fejl++; console.log("  FEJL " + navn + "\n         fik:      " + a + "\n         ventede:  " + b); }
}
function afsnit(s){ console.log("\n" + s); }

const PID = "spiller1";
// dage: {dato: {kode: antal}}, jokers/jokerRequests som i databasen
function saet({dage = {}, jokers = {}, anmodninger = {}, stigeDage = [], stigeLog = []} = {}){
  K.footworkComboMemo.clear();
  K.saetData(
    [{id: PID, days: dage, jokers, jokerRequests: anmodninger, year: "2016", gender: "dreng"}],
    [{id: PID, entries: [], reasons: {}, year: "2016", gender: "dreng"}],
    [{id: PID, days: stigeDage}],
    [{id: PID, entries: stigeLog}]
  );
}
const iDag = K.dagsISO(new Date());
const d = n => K.isoPlus(iDag, n);
const kode = id => K.FOOTWORK.find(x=>x.id===id).kode;
// En fast dag fra FØR de nye regler. Testene her beskriver version 1 - de gamle point og
// kombier - og skal blive ved med det, også når skiftedatoen er passeret.
const V1DAG = "2026-11-10";

// ---------------------------------------------------------------------------
afsnit("Datohjælpere");
t("isoDage over et månedsskifte", K.isoDage("2026-01-31", "2026-02-01"), 1);
t("isoDage over et årsskifte", K.isoDage("2025-12-31", "2026-01-01"), 1);
t("isoPlus over et månedsskifte", K.isoPlus("2026-02-28", 1), "2026-03-01");
t("isoPlus hen over sommertidsskiftet", K.isoPlus("2026-03-28", 2), "2026-03-30");
t("isoDage hen over sommertidsskiftet", K.isoDage("2026-03-28", "2026-03-30"), 2);
t("isoDage hen over vintertidsskiftet", K.isoDage("2026-10-24", "2026-10-26"), 2);

// ---------------------------------------------------------------------------
afsnit("Kombi-tabellen");
const i = id => K.FOOTWORK.findIndex(x=>x.id===id);
t("3 gange samme øvelse", K.footworkBoost(i("toetaps"), i("toetaps"), i("toetaps")), 2);
t("2 ens + 1 anden giver nul", K.footworkBoost(i("toetaps"), i("toetaps"), i("vrul")), 0);
t("3 forskellige lette", K.footworkBoost(i("toetaps"), i("saalerul"), i("trommestik")), 3);
t("2 lette + 1 mellem", K.footworkBoost(i("toetaps"), i("saalerul"), i("vrul")), 3);
t("2 lette + 1 svær", K.footworkBoost(i("toetaps"), i("saalerul"), i("lrul")), 3);
t("1 let + 2 svære", K.footworkBoost(i("toetaps"), i("lrul"), i("croqueta")), 3);
t("allround: let + mellem + svær", K.footworkBoost(i("toetaps"), i("vrul"), i("lrul")), 5);
t("3 forskellige mellem", K.footworkBoost(i("vrul"), i("traekskub"), i("stepover")), 5);
t("2 mellem + 1 svær", K.footworkBoost(i("vrul"), i("traekskub"), i("lrul")), 5);
t("1 mellem + 2 svære", K.footworkBoost(i("vrul"), i("lrul"), i("croqueta")), 5);
t("3 forskellige svære", K.footworkBoost(i("lrul"), i("croqueta"), i("square")), 8);
t("version 1: point pr. sværhedsgrad - jonglering har sin egen takst", K.FOOTWORK.map(x=>K.footworkPointsPaa(x, V1DAG)), [2,2,2,3,3,3,3,8,4,4,4,4]);

afsnit("Jongleringstræning har sin egen blok og takst");
const jong = K.footworkEx("jongler");
t("5 minutter, ikke 3 × 30 sek.", K.footworkBlock(jong), "5 minutter");
t("alle andre har standardblokken",
  K.FOOTWORK.filter(x=>x.id!=="jongler").every(x=>K.footworkBlock(x) === K.FOOTWORK_DEFAULT_BLOCK), true);
t("8 point i version 1", K.footworkPointsPaa(jong, V1DAG), 8);
t("den var 'mellem' i version 1, så de gamle kombier er uændrede", K.FOOTWORK_V1.grad.j, "mellem");
// Der var før tre svære øvelser, så +8-kombien krævede dem alle tre hver gang. Med V+L rul
// er der fire at vælge imellem - det er et bevidst valg, ikke et udslag. Kombien kræver
// stadig tre FORSKELLIGE svære øvelser, og tallet står her, så en femte ikke slipper ind
// uden at nogen har set det.
t("der er fire svære øvelser (+8-kombien vælger tre forskellige af dem)",
  Object.values(K.FOOTWORK_V1.grad).filter(g=>g==="svaer").length, 4);
// Taksten skal ligge mellem let og mellem pr. minut: jonglering optjener jo også point
// på stigen, så den må ikke være den bedste forretning i modulet.
const prMinut = (p, min) => p / min;
t("pr. minut ligger den mellem let (1,33) og mellem (2,0)", (()=>{
  const j = prMinut(8, 5);
  return j > prMinut(2, 1.5) && j < prMinut(3, 1.5);
})(), true);

// ---------------------------------------------------------------------------
afsnit("Optimal opdeling i kombier");
function boost(dag){
  K.footworkComboMemo.clear();
  const counts = K.FOOTWORK.map(ex=>dag[ex.id] || 0);
  return K.footworkDayCombos(counts, 1).boost;
}
t("under 3 gennemførelser giver ingen kombi", boost({toetaps:2}), 0);
t("3 ens", boost({toetaps:3}), 2);
t("6 ens bliver to kombier", boost({toetaps:6}), 4);
t("8 ens bliver to kombier (to i overskud)", boost({toetaps:8}), 4);
t("2 ens + 1 anden giver intet", boost({toetaps:2, vrul:1}), 0);
// Det tilfælde, hvor grådig udvælgelse er beviseligt forkert: tag de tre svære først
// (+8), og de fire resterende kan ikke danne en kombi. To allround-kombier giver 10.
t("grådig tager de svære (8) - optimalt er to allround (10)",
  boost({toetaps:2, vrul:2, lrul:1, croqueta:1, square:1}), 10);
// Samme fælde en etage op: grådig tager hhh + hhh = 16, og så står 3 lette + 3 mellem
// tilbage som eee (3) + mmm (5) = 8, i alt 24. Tre allround + ... giver mere.
// Her er det omvendt: to hhh (16) PLUS eee (3) og mmm (5) slår tre allround (15) + hhh (8).
t("to lag af samme fælde",
  boost({toetaps:1, saalerul:1, trommestik:1, vrul:1, traekskub:1, stepover:1, lrul:2, croqueta:2, square:2}), 24);
t("rene svære i overskud", boost({lrul:2, croqueta:2, square:2}), 16);
t("allround slår mellem/svær, når der er lette nok",
  boost({toetaps:1, vrul:1, lrul:1}), 5);
// 10 gennemførelser rummer højst 3 kombier: hhh (8) + mmm (5) + eee (3).
t("en dag med én af hver af de ti øvelser",
  boost({toetaps:1, saalerul:1, trommestik:1, vrul:1, traekskub:1, stepover:1, jongler:1, lrul:1, croqueta:1, square:1}), 16);
// En lang, men mulig dag: 3 gange hver af de ti øvelser. Den overskrider søgebudgettet,
// og før greedy-nødløsningen gav den NUL i bonus efter fem sekunders frys.
t("30 gennemførelser giver stadig en rigtig bonus", (()=>{
  const b = boost(Object.fromEntries(K.FOOTWORK.map(ex=>[ex.id, 3])));
  return b >= 24;      // mindst 10 kombier à 2+, i praksis en del mere
})(), true);
t("og den er ikke urealistisk høj", (()=>{
  const b = boost(Object.fromEntries(K.FOOTWORK.map(ex=>[ex.id, 3])));
  return b <= Math.floor(30/3) * 8;   // 10 kombier, hoejst +8 hver
})(), true);
t("en dag der overskrider budgettet svarer hurtigt", (()=>{
  K.footworkComboMemo.clear();
  const counts = K.FOOTWORK.map(()=>3);
  const t0 = Date.now(); K.footworkDayCombos(counts, 1); const koldt = Date.now() - t0;
  const t1 = Date.now(); K.footworkDayCombos(counts, 1); const varmt = Date.now() - t1;
  return koldt < 2000 && varmt < 20;   // og anden gang kommer den fra huskelisten
})(), true);
t("nødløsningen rammer aldrig over det rigtige svar", (()=>{
  // 10 af hver: for stor til den udtømmende søgning, så nødløsningen tager over. Den må
  // give et tal, der er lovligt (dvs. ikke højere end 3 kombier pr. 9 gennemførelser).
  const b = boost(Object.fromEntries(K.FOOTWORK.map(ex=>[ex.id, 10])));
  return b > 0 && b <= Math.floor(100/3) * 8;
})(), true);

// ---------------------------------------------------------------------------
afsnit("Yder-yder-stop og V+L rul");
const yd = K.footworkEx("yderstop"), vl = K.footworkEx("vlrul");
t("begge findes, med deres egen kode", [yd?.kode, vl?.kode], ["y", "k"]);
t("Yder-yder-stop var mellem og gav 3 point i version 1", [K.FOOTWORK_V1.grad.y, K.footworkPointsPaa(yd, V1DAG)], ["mellem", 3]);
t("V+L rul var svær og gav 4 point i version 1", [K.FOOTWORK_V1.grad.k, K.footworkPointsPaa(vl, V1DAG)], ["svaer", 4]);
t("begge har standardblokken, 3 × 30 sek.", [K.footworkBlock(yd), K.footworkBlock(vl)], [K.FOOTWORK_DEFAULT_BLOCK, K.FOOTWORK_DEFAULT_BLOCK]);
t("begge har en tekst, og ingen af dem gemmer sig bag jonglerings undtagelse", [!!yd.tekst, !!vl.tekst, "point" in yd, "point" in vl], [true, true, false, false]);
t("koderne er entydige - ellers lægges to øvelsers dage sammen i databasen",
  new Set(K.FOOTWORK.map(x=>x.kode)).size, K.FOOTWORK.length);
t("og ids er entydige", new Set(K.FOOTWORK.map(x=>x.id)).size, K.FOOTWORK.length);
t("og koderne er ét bogstav", K.FOOTWORK.every(x=>/^[a-z]$/.test(x.kode)), true);
t("de gamle ti koder er uændrede, så gemte dage stadig passer",
  ["toetaps","saalerul","trommestik","vrul","traekskub","stepover","jongler","lrul","croqueta","square"].map(id=>K.footworkEx(id).kode),
  ["t","s","d","v","p","o","j","l","c","q"]);
t("Yder-yder-stop indgår i kombierne som en mellem", K.footworkBoost(i("toetaps"), i("yderstop"), i("lrul")), 5);
t("tre forskellige mellem, hvor den nye er den ene", K.footworkBoost(i("vrul"), i("traekskub"), i("yderstop")), 5);
t("1 let + 2 mellem, med den nye", K.footworkBoost(i("toetaps"), i("vrul"), i("yderstop")), 3);
t("V+L rul tæller som svær i allround", K.footworkBoost(i("toetaps"), i("vrul"), i("vlrul")), 5);
t("tre forskellige svære giver stadig 8 - også med V+L rul", K.footworkBoost(i("lrul"), i("vlrul"), i("square")), 8);
t("og to svære plus V+L rul og croqueta er ikke fire i en kombi", K.footworkBoost(i("vlrul"), i("vlrul"), i("croqueta")), 0);
saet({dage: {[V1DAG]: {[kode("yderstop")]: 2, [kode("vlrul")]: 1}}});
t("point for en dag: 2 × 3 + 1 × 4, ingen kombi på tre gennemførelser af to slags", K.footworkDayPoints(PID, V1DAG), 2*3 + 4);
saet({dage: {[V1DAG]: {[kode("yderstop")]: 1, [kode("vlrul")]: 1, [kode("toetaps")]: 1}}});
t("allround med begge nye: 3 + 4 + 2 + 5", K.footworkDayPoints(PID, V1DAG), 3 + 4 + 2 + 5);
saet({dage: {[V1DAG]: {[kode("lrul")]: 1, [kode("vlrul")]: 1, [kode("croqueta")]: 1}}});
t("tre svære, hvoraf den ene er V+L rul: 12 + 8", K.footworkDayPoints(PID, V1DAG), 3*4 + 8);
t("aktive dage tæller en dag med kun de nye", (saet({dage: {[V1DAG]: {[kode("vlrul")]: 1}}}), K.footworkActiveDays(PID)), [V1DAG]);
t("totalerne tæller de nye øvelser, og alle tolv er med",
  (saet({dage: {[V1DAG]: {[kode("yderstop")]: 2}, [d(-1)]: {[kode("yderstop")]: 1, [kode("vlrul")]: 4}}}),
   (()=>{ const x = K.footworkTotals(PID); return [x.length, x[K.FOOTWORK.findIndex(e=>e.id==="yderstop")].antal, x[K.FOOTWORK.findIndex(e=>e.id==="vlrul")].antal]; })()), [12, 3, 4]);
// Den udtømmende søgning er eksponentiel i antallet af øvelser. Med tolv øvelser er den
// værste dag 12 × 3 = 36 gennemførelser - og den skal stadig svare hurtigt, og ikke give
// mindre end nødløsningen.
t("en dag med alle tolv øvelser tre gange hver svarer hurtigt og giver bonus", (()=>{
  const counts = K.FOOTWORK.map(()=>3);
  K.footworkComboMemo.clear();
  const t0 = Date.now(); const r = K.footworkDayCombos(counts, 1); const koldt = Date.now() - t0;
  const t1 = Date.now(); K.footworkDayCombos(counts, 1); const varmt = Date.now() - t1;
  return [koldt < 2000, varmt < 20, r.boost > 0, r.kombier.length * 3 <= 36];
})(), [true, true, true, true]);
t("og ti af hver er stadig lovligt", (()=>{
  K.footworkComboMemo.clear();
  const r = K.footworkDayCombos(K.FOOTWORK.map(()=>10), 1);
  return r.boost > 0 && r.kombier.length * 3 <= 120;
})(), true);

// ---------------------------------------------------------------------------
afsnit("Dagens point");
saet({dage: {[V1DAG]: {[kode("toetaps")]: 2, [kode("vrul")]: 2, [kode("lrul")]: 1, [kode("croqueta")]: 1, [kode("square")]: 1}}});
t("grundpoint + bedste kombi-bonus", K.footworkDayPoints(PID, V1DAG), 2*2 + 2*3 + 3*4 + 10);
saet({dage: {[V1DAG]: {[kode("jongler")]: 1, [kode("toetaps")]: 1, [kode("lrul")]: 1}}});
t("en dag med jonglering: 8 + 2 + 4, plus allround-kombi 5", K.footworkDayPoints(PID, V1DAG), 8 + 2 + 4 + 5);
saet({dage: {[V1DAG]: {[kode("jongler")]: 3}}});
t("tre gange jonglering: 24 + 'tre ens' 2", K.footworkDayPoints(PID, V1DAG), 24 + 2);
saet({dage: {[V1DAG]: {[kode("toetaps")]: 99}}});
t("et håndskrevet tal klippes til loftet", K.footworkCount(PID, V1DAG, kode("toetaps")), K.FOOTWORK_MAX_PER_DAY);
t("og dagens point følger det klippede tal", K.footworkDayPoints(PID, V1DAG), 10*2 + 3*2);
saet({dage: {[V1DAG]: {[kode("toetaps")]: 3}}, jokers: {[V1DAG]: "approved"}});
t("en godkendt joker nulstiller dagens point", K.footworkDayPoints(PID, V1DAG), 0);
t("og dagen tæller ikke som aktiv", K.footworkActiveDays(PID), []);

// ---------------------------------------------------------------------------
afsnit("Streak-bonus");
t("3 dage", K.footworkStreakBonus(3), 5);
t("4 dage giver ikke mere end 3", K.footworkStreakBonus(4), 5);
t("5 dage er kumulativ", K.footworkStreakBonus(5), 10);
t("7 dage er kumulativ", K.footworkStreakBonus(7), 20);
t("125 dage giver 400 i alt", K.footworkStreakBonus(125), 400);
t("200 dage giver ikke mere end 125", K.footworkStreakBonus(200), 400);
t("næste bonus efter 4 dage er ved 5", K.footworkNextStreakBonus(4), [5,5]);
t("ingen næste bonus efter 125", K.footworkNextStreakBonus(125), null);

// ---------------------------------------------------------------------------
afsnit("Streaks");
function dageMedTraening(liste){
  const dage = {};
  liste.forEach(n=>{ dage[d(n)] = {[kode("toetaps")]: 1}; });
  return dage;
}
saet({dage: dageMedTraening([0,-1,-2])});
t("tre dage i træk", K.footworkCurrentStreak(PID).laengde, 3);
t("og streaken lever", K.footworkCurrentStreak(PID).lever, true);
t("bonussen er med i point", K.footworkPoints(PID), 3*2 + 5);

saet({dage: dageMedTraening([-1,-2,-3])});
t("intet i dag, men i går: streaken lever", K.footworkCurrentStreak(PID).lever, true);
t("og er stadig 3 dage", K.footworkCurrentStreak(PID).laengde, 3);

saet({dage: dageMedTraening([-2,-3,-4])});
t("sidst aktiv for to dage siden: streaken er brudt", K.footworkCurrentStreak(PID).lever, false);
t("men bonussen for det afsluttede forløb består", K.footworkPoints(PID), 3*2 + 5);

saet({dage: dageMedTraening([0,-1,-2,-4,-5,-6])});
t("to forløb giver to bonusser", K.footworkPoints(PID), 6*2 + 5 + 5);
t("aktuel streak er kun det sidste forløb", K.footworkCurrentStreak(PID).laengde, 3);
t("antal forløb", K.footworkRuns(PID, false).length, 2);

// Et forløb hen over et månedsskifte må ikke knække ved den 1.
saet({dage: {"2026-01-30": {t:1}, "2026-01-31": {t:1}, "2026-02-01": {t:1}, "2026-02-02": {t:1}}});
t("streak hen over månedsskiftet", K.footworkRuns(PID, false)[0].laengde, 4);
t("og den er ét forløb", K.footworkRuns(PID, false).length, 1);
saet({dage: {"2025-12-30": {t:1}, "2025-12-31": {t:1}, "2026-01-01": {t:1}}});
t("streak hen over årsskiftet", K.footworkRuns(PID, false)[0].laengde, 3);
saet({dage: {"2024-02-28": {t:1}, "2024-02-29": {t:1}, "2024-03-01": {t:1}}});
t("streak hen over skuddagen", K.footworkRuns(PID, false)[0].laengde, 3);

// ---------------------------------------------------------------------------
afsnit("Bagudregistrering og sletning");
saet({dage: dageMedTraening([0,-1,-3,-4])});
t("to forløb før bagudregistreringen", K.footworkRuns(PID, false).map(r=>r.laengde), [2,2]);
t("point: fire dage, ingen bonus", K.footworkPoints(PID), 4*2);
saet({dage: dageMedTraening([0,-1,-2,-3,-4])});
t("den manglende dag registreres bagud og binder forløbene sammen", K.footworkRuns(PID, false).map(r=>r.laengde), [5]);
t("nu udløses både 3- og 5-dagsbonus", K.footworkPoints(PID), 5*2 + 5 + 5);
saet({dage: dageMedTraening([0,-1,-3,-4])});
t("og sletter man dagen igen, forsvinder bonussen af sig selv", K.footworkPoints(PID), 4*2);

saet({dage: dageMedTraening([0,-1,-2,-3,-4,-5,-6])});
t("syv dage i træk", K.footworkCurrentStreak(PID).laengde, 7);
t("kumulativ bonus for syv dage", K.footworkPoints(PID), 7*2 + 20);
saet({dage: dageMedTraening([0,-1,-2,-4,-5,-6])});
t("træneren nulstiller en dag i midten: streaken brydes", K.footworkRuns(PID, false).map(r=>r.laengde), [3,3]);
t("og bonussen falder til to gange 3-dagsbonus", K.footworkPoints(PID), 6*2 + 5 + 5);

// ---------------------------------------------------------------------------
afsnit("Joker");
saet({dage: dageMedTraening([0,-1,-2,-4,-5]), anmodninger: {[d(-3)]: true}});
t("ubehandlet joker bygger bro i visningen", K.footworkCurrentStreak(PID).laengde, 5);
t("og visningen siger, at den afventer", K.footworkCurrentStreak(PID).afventer, true);
t("men bonussen gives først ved godkendelse", K.footworkPoints(PID), 5*2 + 5);
t("status er 'pending'", K.footworkJokerStatus(PID, d(-3)), "pending");

saet({dage: dageMedTraening([0,-1,-2,-4,-5]), anmodninger: {[d(-3)]: true}, jokers: {[d(-3)]: "approved"}});
t("godkendt joker: status", K.footworkJokerStatus(PID, d(-3)), "approved");
t("godkendt joker binder forløbet sammen", K.footworkRuns(PID, false).map(r=>r.laengde), [5]);
t("jokerdagen tæller ikke med i længden", K.footworkCurrentStreak(PID).laengde, 5);
t("ikke længere 'afventer'", K.footworkCurrentStreak(PID).afventer, false);
t("og nu udløses 3- og 5-dagsbonus", K.footworkPoints(PID), 5*2 + 5 + 5);

saet({dage: dageMedTraening([0,-1,-2,-4,-5]), anmodninger: {[d(-3)]: true}, jokers: {[d(-3)]: "rejected"}});
t("afvist joker: status", K.footworkJokerStatus(PID, d(-3)), "rejected");
t("afvist joker bryder streaken", K.footworkRuns(PID, false).map(r=>r.laengde), [2,3]);
t("og bonussen genberegnes", K.footworkPoints(PID), 5*2 + 5);

saet({dage: dageMedTraening([-1,-2,-3]), jokers: {[d(0)]: "approved"}, anmodninger: {[d(0)]: true}});
t("en joker i dag holder streaken i live", K.footworkCurrentStreak(PID).lever, true);
saet({anmodninger: {[d(0)]: true}});
t("en joker uden en eneste aktiv dag er ikke en streak", K.footworkRuns(PID, true).length, 0);

// ---------------------------------------------------------------------------
afsnit("Jongleringsstigen tæller som aktiv dag");
saet({dage: dageMedTraening([0,-2]), stigeDage: [d(-1)]});
t("stigens dato binder forløbet sammen", K.footworkRuns(PID, false).map(r=>r.laengde), [3]);
t("og 3-dagsbonussen udløses", K.footworkPoints(PID), 2*2 + 5);
saet({dage: dageMedTraening([0,-2]), stigeLog: [{t:"main", v:3, at: new Date(K.isoPlus(iDag,-1) + "T18:30:00").toISOString()}]});
t("stigens LOG virker også (dage fra før datolisten fandtes)", K.footworkRuns(PID, false).map(r=>r.laengde), [3]);
saet({dage: {}, stigeDage: [d(0), d(-1), d(-2)]});
t("en streak kan bæres af stigen alene", K.footworkCurrentStreak(PID).laengde, 3);
t("men stigens dage giver ingen fodteknik-dagspoint", K.footworkPoints(PID), 5);
saet({dage: dageMedTraening([0,-2]), stigeLog: [{t:"correct", stige:"main", fra:3, til:2, at: new Date(K.isoPlus(iDag,-1) + "T18:30:00").toISOString()}]});
t("en trænerrettelse på stigen er ikke en aktiv dag", K.footworkRuns(PID, false).map(r=>r.laengde), [1,1]);

// ---------------------------------------------------------------------------
afsnit("Uge- og månedsvindue");
saet({dage: dageMedTraening([0,-1,-2,-3,-4])});
const [y0,m0,dd0] = d(-2).split("-").map(Number);
const siden = new Date(y0, m0-1, dd0);
// Dag -4..0: 3-dagsmilepælen blev nået på dag -2 og 5-dagsmilepælen på dag 0, så begge
// bonusser ligger inde i vinduet - mens de to første dages grundpoint ikke gør.
t("kun dagene i vinduet tælles", K.footworkPointsInWindow(PID, siden), 3*2 + 5 + 5);
const [y1,m1,dd1] = d(-1).split("-").map(Number);
t("3-dagsbonussen hører til den dag, milepælen blev nået - og falder uden for vinduet",
  K.footworkPointsInWindow(PID, new Date(y1, m1-1, dd1)), 2*2 + 5);
t("hele perioden giver det samme som all-time", K.footworkPointsInWindow(PID, new Date(2000,0,1)), K.footworkPoints(PID));

// ---------------------------------------------------------------------------
afsnit("14-dagesgrænsen i brugerfladen");
t("i dag er åben", K.footworkDayOpenForPlayer(d(0)), true);
t("13 dage tilbage er åben", K.footworkDayOpenForPlayer(d(-13)), true);
t("14 dage tilbage er låst", K.footworkDayOpenForPlayer(d(-14)), false);
t("i morgen er låst", K.footworkDayOpenForPlayer(d(1)), false);

// ---------------------------------------------------------------------------
afsnit("Sletning af et felt under {merge:true}");
saet({dage: {[d(0)]: {[kode("toetaps")]: 2, [kode("vrul")]: 1}}});
t("et tal sættes ned", K.footworkDayPatch(PID, d(0), kode("toetaps"), 1), {[kode("toetaps")]: 1});
t("en øvelse fjernes, men dagen har flere", K.footworkDayPatch(PID, d(0), kode("toetaps"), 0), {[kode("toetaps")]: "__DELETE__"});
saet({dage: {[d(0)]: {[kode("toetaps")]: 2}}});
t("sidste øvelse fjernet: hele dagen ryger", K.footworkDayPatch(PID, d(0), kode("toetaps"), 0), "__DELETE__");

afsnit("Trænerens øvelsesoversigt");
const kd = id => K.FOOTWORK.find(x=>x.id===id).kode;
saet({dage: {
  [d(0)]:  {[kd("toetaps")]:2, [kd("vrul")]:1},
  [d(-1)]: {[kd("toetaps")]:1},
  [d(-5)]: {[kd("lrul")]:1, [kd("toetaps")]:3}
}});
const tot = K.footworkTotals(PID);
const vedId = id => tot[K.FOOTWORK.findIndex(x=>x.id===id)];
t("toe-taps lagt sammen på tværs af dage", vedId("toetaps").antal, 6);
t("og sidst-datoen er den nyeste", vedId("toetaps").sidst, d(0));
t("v-rul talt rigtigt", vedId("vrul").antal, 1);
t("l-rul kun på den gamle dag", [vedId("lrul").antal, vedId("lrul").sidst], [1, d(-5)]);
t("en øvelse der aldrig er lavet", [vedId("croqueta").antal, vedId("croqueta").sidst], [0, null]);
t("alle øvelser er med i oversigten", tot.length, K.FOOTWORK.length);

const split = K.footworkGradeSplit(PID);
t("i alt otte gennemførelser", split.i_alt, 8);
// Toe-taps 6 (starter), V-rul yderside 1 og L-rul 1 (begge mellem). Fordelingen følger
// øvelsernes NUVÆRENDE kategori - den viser, hvad barnet træner.
t("fordelingen regnes på gennemførelser, i de fem kategorier",
  K.FOOTWORK_KATEGORI_ORDEN.map(k=>split.pct[k]), [75, 0, 25, 0, 0]);
saet({dage: {}});
t("en spiller uden registreringer giver ingen fordeling", K.footworkGradeSplit(PID), {i_alt:0, pct:null});
t("og alle øvelser står som aldrig prøvet", K.footworkTotals(PID).every(x=>x.antal===0 && x.sidst===null), true);
// Et håndskrevet tal skal klippes her ligesom alle andre steder.
saet({dage: {[d(0)]: {[kd("toetaps")]: 99}}});
t("oversigten bruger det klippede tal, ikke det skrevne",
  K.footworkTotals(PID)[K.FOOTWORK.findIndex(x=>x.id==="toetaps")].antal, K.FOOTWORK_MAX_PER_DAY);

afsnit("Huskelisten må aldrig give et gammelt svar");
saet({dage: dageMedTraening([0,-1,-2])});
t("første opslag", K.footworkPoints(PID), 3*2 + 5);
t("andet opslag er det samme", K.footworkPoints(PID), 3*2 + 5);
saet({dage: dageMedTraening([0,-1,-2,-3,-4])});
t("nye data giver nyt svar med det samme", K.footworkPoints(PID), 5*2 + 5 + 5);
saet({dage: dageMedTraening([0])});
t("og færre data giver et lavere svar", K.footworkPoints(PID), 2);
t("streaken følger med", K.footworkCurrentStreak(PID).laengde, 1);
saet({dage: dageMedTraening([0,-2]), stigeDage: [d(-1)]});
t("en ændring på STIGEN slår også igennem", K.footworkPoints(PID), 2*2 + 5);
saet({dage: dageMedTraening([0,-1,-2,-4,-5]), anmodninger: {[d(-3)]: true}, jokers: {[d(-3)]: "approved"}});
t("og en joker-afgørelse gør", K.footworkPoints(PID), 5*2 + 5 + 5);

afsnit("Ydelse med et års historik for en hel klub");
(()=>{
  const koder = K.FOOTWORK.map(x=>x.kode);
  const klub = [];
  for(let sp=0; sp<24; sp++){
    const days = {};
    for(let dg=0; dg<365; dg++){
      if((dg+sp)%7===6) continue;
      const dag = {};
      for(let n=0;n<3;n++) dag[koder[(dg*3+n+sp)%koder.length]] = 1 + ((dg+n)%2);
      days[d(-dg)] = dag;
    }
    klub.push({id:"s"+sp, days, jokers:{}, jokerRequests:{}});
  }
  K.saetData(klub, [], klub.map(x=>({id:x.id, days:[]})), []);
  // Én optegning spørger om hver spillers point mange gange: rangliste, sortering,
  // profil, registrering. Her 10 gange pr. spiller, som et forsigtigt skøn.
  const t0 = performance.now();
  for(let gang=0; gang<10; gang++) for(const x of klub){ K.footworkPoints(x.id); K.footworkCurrentStreak(x.id); }
  const foerste = performance.now() - t0;
  const t1 = performance.now();
  for(let gang=0; gang<10; gang++) for(const x of klub){ K.footworkPoints(x.id); K.footworkCurrentStreak(x.id); }
  const naeste = performance.now() - t1;
  console.log(`   første optegning efter en dataændring: ${foerste.toFixed(0)} ms · de næste: ${naeste.toFixed(1)} ms`);
  t("første optegning efter en ændring er under et halvt sekund", foerste < 500, true);
  t("optegninger uden dataændring koster næsten ingenting", naeste < 20, true);
})();

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
