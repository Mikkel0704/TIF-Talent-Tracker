// Trin 1: kategorier, versioner og migreringen af de eksisterende øvelser.
//
// Det vigtigste her er beviset på, at ingen dag FØR skiftet ændrer point. Det føres mod
// en frossen kopi af den beregning, der kørte live før ændringen (fodteknik-v1-reference.mjs),
// på tusindvis af tilfældige dage og historikker - ikke mod tal, nogen har regnet i hovedet.
import * as K from "./kode.mjs";
import * as R from "./fodteknik-v1-reference.mjs";

let ok = 0, fejl = 0;
function t(navn, fik, vent){
  const a = JSON.stringify(fik), b = JSON.stringify(vent);
  if(a === b){ ok++; console.log("  ok   " + navn); }
  else { fejl++; console.log("  FEJL " + navn + "\n         fik:      " + a + "\n         ventede:  " + b); }
}
const afsnit = s => console.log("\n" + s);
const V2 = K.FOOTWORK_V2_FRA, SIDSTE_V1 = K.isoPlus(V2, -1), V1DAG = "2026-11-10";
const ex = id => K.footworkEx(id);

afsnit("Kategorierne");
t("fire niveauer og grundtræning, i den rækkefølge de vises", K.FOOTWORK_KATEGORI_ORDEN, ["starter","let","mellem","svaer","grund"]);
t("navne", K.FOOTWORK_KATEGORI_ORDEN.map(k=>K.FOOTWORK_KATEGORIER[k].navn), ["Starter","Let","Mellem","Svær","Grundtræning"]);
t("point pr. gennemførelse: 2, 3, 4, 5 og 5", K.FOOTWORK_KATEGORI_ORDEN.map(k=>K.FOOTWORK_KATEGORIER[k].point), [2,3,4,5,5]);
t("krav: 3 × 30 sek. for niveauerne, 5 minutter for grundtræning",
  K.FOOTWORK_KATEGORI_ORDEN.map(k=>K.FOOTWORK_KATEGORIER[k].krav), ["3 × 30 sek.","3 × 30 sek.","3 × 30 sek.","3 × 30 sek.","5 minutter"]);
t("grundtræning er IKKE et niveau", K.FOOTWORK_NIVEAUER, ["starter","let","mellem","svaer"]);
t("hver øvelse har en kategori, der findes", K.FOOTWORK.every(x=>x.kategori in K.FOOTWORK_KATEGORIER), true);

afsnit("De eksisterende øvelser i de nye kategorier");
const ny = Object.fromEntries(K.FOOTWORK.map(x=>[x.id, x.kategori]));
t("Toe-taps, Sålerul, Trommestikker og Step-over er Starter", ["toetaps","saalerul","trommestik","stepover"].map(i=>ny[i]), ["starter","starter","starter","starter"]);
t("Træk-skub og Yder-yder-stop er Let", [ny.traekskub, ny.yderstop], ["let","let"]);
t("V-rul yderside, L-rul og Square er Mellem", [ny.vrul, ny.lrul, ny.square], ["mellem","mellem","mellem"]);
t("L+V-rul og Croqueta er Svær", [ny.vlrul, ny.croqueta], ["svaer","svaer"]);
t("Jonglering er Grundtræning", ny.jongler, "grund");

afsnit("Omdøbningen bevarer koden - og dermed historik og video");
t("V-rul hedder nu 'V-rul yderside' og har stadig koden v", [ex("vrul").navn, ex("vrul").kode], ["V-rul yderside", "v"]);
t("V+L rul hedder nu 'L+V-rul' og har stadig koden k", [ex("vlrul").navn, ex("vlrul").kode], ["L+V-rul", "k"]);
t("opslag på koden giver den omdøbte øvelse", [K.footworkEx("v").navn, K.footworkEx("k").navn], ["V-rul yderside", "L+V-rul"]);
t("ingen kode har skiftet betydning: de tolv gamle koder peger på de samme øvelser",
  ["t","s","d","v","p","o","y","j","l","k","c","q"].map(k=>K.footworkEx(k).id),
  ["toetaps","saalerul","trommestik","vrul","traekskub","stepover","yderstop","jongler","lrul","vlrul","croqueta","square"]);
t("og kopien af den gamle beregning har de samme koder", R.FOOTWORK.map(x=>x.kode).sort().join(""), "cdjklopqstvy");

afsnit("Version pr. dag");
t("dagen før skiftet er version 1", K.footworkVersion(SIDSTE_V1), 1);
t("skiftedagen er version 2", K.footworkVersion(V2), 2);
t("en dag efter er version 2", K.footworkVersion(K.isoPlus(V2, 30)), 2);
t("version 1 er frosset med de tolv øvelser, som de var", Object.keys(K.FOOTWORK_V1.grad).sort().join(""), "cdjklopqstvy");
const fremtidig = {id:"proeve", kode:"z", navn:"Prøve", kategori:"svaer"};
t("en øvelse, der kommer til i version 2, fandtes ikke før skiftet", [K.footworkFindesPaa(fremtidig, SIDSTE_V1), K.footworkFindesPaa(fremtidig, V2)], [false, true]);
t("og giver 0 point på en gammel dag", K.footworkPointsPaa(fremtidig, SIDSTE_V1), 0);

afsnit("Point pr. gennemførelse: gamle dage beholder deres værdi");
const foerEfter = id => [K.footworkPointsPaa(ex(id), SIDSTE_V1), K.footworkPointsPaa(ex(id), V2)];
t("Step-over: 3 før, 2 efter", foerEfter("stepover"), [3, 2]);
t("V-rul yderside: 3 før, 4 efter", foerEfter("vrul"), [3, 4]);
t("L+V-rul: 4 før, 5 efter", foerEfter("vlrul"), [4, 5]);
t("Croqueta: 4 før, 5 efter", foerEfter("croqueta"), [4, 5]);
t("Square og L-rul: 4 før, 4 efter", [foerEfter("square"), foerEfter("lrul")], [[4, 4], [4, 4]]);
t("Træk-skub og Yder-yder-stop: 3 før, 3 efter", [foerEfter("traekskub"), foerEfter("yderstop")], [[3, 3], [3, 3]]);
t("Toe-taps, Sålerul, Trommestikker: 2 før, 2 efter", ["toetaps","saalerul","trommestik"].map(foerEfter), [[2,2],[2,2],[2,2]]);
t("Jonglering: 8 før, 5 efter", foerEfter("jongler"), [8, 5]);
t("kategorien på dagen følger også versionen",
  [K.footworkKategoriPaa(ex("stepover"), SIDSTE_V1).navn, K.footworkKategoriPaa(ex("stepover"), V2).navn], ["Mellem", "Starter"]);

afsnit("Samme registreringer, to dage: før og efter skiftet");
const dagData = {v: 2, k: 1, j: 1, o: 1};
const tal = K.FOOTWORK.map(x=>dagData[x.kode] || 0);
t("grundpoint før: 2×3 + 4 + 8 + 3 = 21", K.footworkGrundpoint(tal, SIDSTE_V1), 21);
t("grundpoint efter: 2×4 + 5 + 5 + 2 = 20", K.footworkGrundpoint(tal, V2), 20);
t("kombierne kræver at få versionen at vide", (()=>{ try{ K.footworkDayCombos(tal); return "ingen fejl"; }catch(e){ return "fejl"; } })(), "fejl");

afsnit("Grupperne på siden følger dagens version");
const grp = d => K.footworkGrupper(d).map(g=>[g.navn, g.oevelser.map(x=>x.navn)]);
t("en gammel dag viser de tre gamle grader og de gamle placeringer", grp(SIDSTE_V1), [
  ["Let", ["Toe-taps","Sålerul","Trommestikker"]],
  ["Mellem", ["V-rul yderside","Træk-skub","Step-over","Yder-yder-stop","Jongleringstræning"]],
  ["Svær", ["L-rul","L+V-rul","Croqueta","Square"]]]);
t("en ny dag viser Starter, Let, Mellem, Svær og Grundtræning", grp(V2).map(g=>g[0]), ["Starter","Let","Mellem","Svær","Grundtræning"]);
t("Step-over står under Starter på en ny dag", grp(V2)[0][1].includes("Step-over"), true);

afsnit("Migreringen: ingen dag før skiftet ændrer point (mod den frosne kopi af live-koden)");
// Tilfældige, men gentagelige dage: samme frø giver samme dage hver gang.
let frø = 20261114;
const tilfaeldig = () => (frø = (frø * 1103515245 + 12345) % 2147483648) / 2147483648;
const KODER = R.FOOTWORK.map(x=>x.kode);
function tilfaeldigDag(){
  const dag = {};
  const hvor_mange = Math.floor(tilfaeldig() * 8);              // 0-7 forskellige øvelser
  for(let n = 0; n < hvor_mange; n++){
    const kode = KODER[Math.floor(tilfaeldig() * KODER.length)];
    dag[kode] = Math.min(10, (dag[kode] || 0) + 1 + Math.floor(tilfaeldig() * (tilfaeldig() < 0.15 ? 10 : 3)));
  }
  return dag;
}
let ensDage = 0, forskelDage = [];
for(let n = 0; n < 3000; n++){
  const pid = "dag" + n, dag = tilfaeldigDag();
  const data = [{id: pid, days: {[V1DAG]: dag}, year: "2016", gender: "dreng"}];
  K.saetData(data, [], [], []); R.saetData(data, [], [], []);
  const a = R.footworkDayPoints(pid, V1DAG), b = K.footworkDayPoints(pid, V1DAG);
  if(a === b) ensDage++; else forskelDage.push({dag, foer: a, nu: b});
}
t("3000 tilfældige dage giver præcis de samme point som før", forskelDage.length, 0);
if(forskelDage.length) console.log("         fx:", JSON.stringify(forskelDage.slice(0, 3)));

let ensHist = 0, forskelHist = [];
for(let n = 0; n < 300; n++){
  const pid = "hist" + n, dage = {}, jokers = {};
  let d = K.isoPlus(SIDSTE_V1, -Math.floor(tilfaeldig() * 400));
  const antal = 5 + Math.floor(tilfaeldig() * 60);
  for(let i = 0; i < antal && d <= SIDSTE_V1; i++){
    if(tilfaeldig() < 0.08) jokers[d] = tilfaeldig() < 0.7 ? "approved" : "rejected";
    else dage[d] = tilfaeldigDag();
    d = K.isoPlus(d, tilfaeldig() < 0.75 ? 1 : 1 + Math.floor(tilfaeldig() * 4));
  }
  const data = [{id: pid, days: dage, jokers, year: "2016", gender: "dreng"}];
  K.saetData(data, [], [], []); R.saetData(data, [], [], []);
  const a = R.footworkPoints(pid), b = K.footworkPoints(pid);
  if(a === b) ensHist++; else forskelHist.push({pid, foer: a, nu: b});
}
t("300 tilfældige historikker (med streaks og jokere) giver samme samlede point", forskelHist.length, 0);
if(forskelHist.length) console.log("         fx:", JSON.stringify(forskelHist.slice(0, 3)));
console.log(`         (${ensDage} dage og ${ensHist} historikker sammenlignet)`);

afsnit("Migreringen rører ikke databasen");
t("en dag gemmes stadig som {kode: antal} - der skrives ingen point eller kategori",
  (K.saetData([{id:"m", days:{}}], [], [], []), K.footworkDayPatch("m", V2, "v", 2)), {v: 2});

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
