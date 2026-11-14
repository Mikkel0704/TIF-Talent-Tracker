// Trin 4: kombi-bonus efter de nye regler.
//   samme øvelse 3 gange: +5 (alle øvelser, også grundtræning)
//   én fra hvert niveau (Starter + Let + Mellem + Svær): +7 (ikke grundtræning)
// Ubegrænset antal, hver gennemførelse i højst én kombi, og den HØJESTE samlede bonus.
import * as K from "./kode.mjs";

let ok = 0, fejl = 0;
function t(navn, fik, vent){
  const a = JSON.stringify(fik), b = JSON.stringify(vent);
  if(a === b){ ok++; console.log("  ok   " + navn); }
  else { fejl++; console.log("  FEJL " + navn + "\n         fik:      " + a + "\n         ventede:  " + b); }
}
const afsnit = s => console.log("\n" + s);
const V2 = K.FOOTWORK_V2_FRA;
const navn2id = Object.fromEntries(K.FOOTWORK.map(x=>[x.navn, x.id]));

// En dag som {navn: antal}. Regnes PRÆCIS som appen gør: grundpoint + kombibonus på dagen.
function dag(spec, pid = "p" + Math.random()){
  const days = {[V2]: {}};
  for(const [n, antal] of Object.entries(spec)){
    const ex = K.footworkEx(navn2id[n]);
    if(!ex) throw new Error("ukendt øvelse: " + n);
    days[V2][ex.kode] = antal;
  }
  K.footworkComboMemo.clear();
  K.saetData([{id: pid, days, year: "2016", gender: "dreng"}], [], [], []);
  const counts = K.footworkDayCounts(pid, V2);
  const grund = K.footworkGrundpoint(counts, V2);
  const k = K.footworkDayCombos(counts, 2);
  return {grund, bonus: k.boost, i_alt: K.footworkDayPoints(pid, V2), kombier: k.kombier.map(x=>K.footworkKombiVisning(x, 2)), counts, raa: k};
}
const beskriv = d => d.kombier.map(k=>k.navn + (k.navn.startsWith("3 × ") ? "" : ": " + k.oevelser.map(i=>K.FOOTWORK[i].navn).join(" + ")) + " +" + k.bonus).sort();

afsnit("De bestilte cases");
let d = dag({"L+V-rul": 4, "Sålerul": 1, "Træk-skub": 1, "V-rul inderside": 1});
t("1: 4x L+V-rul, Sålerul, Træk-skub, V-rul inderside -> 29 + 12 = 41", [d.grund, d.bonus, d.i_alt], [29, 12, 41]);
t("1: kombierne er 3 × L+V-rul og én fra hvert niveau med den fjerde L+V-rul", beskriv(d),
  ["3 × L+V-rul +5", "Én fra hvert niveau: Sålerul + Træk-skub + V-rul inderside + L+V-rul +7"]);

d = dag({"E-rul": 6, "Toe-taps": 1, "Træk-skub": 1, "Square": 1});
t("2: 6x E-rul, Toe-taps, Træk-skub, Square -> 39 + 12 = 51 (ikke 2 × '3 af samme' = +10)", [d.grund, d.bonus, d.i_alt], [39, 12, 51]);
t("2: kombierne er 3 × E-rul og én fra hvert niveau", beskriv(d),
  ["3 × E-rul +5", "Én fra hvert niveau: Toe-taps + Træk-skub + Square + E-rul +7"]);

d = dag({"Jongleringstræning": 3});
t("3: 3x Jonglering -> 15 + 5 = 20", [d.grund, d.bonus, d.i_alt], [15, 5, 20]);

d = dag({"8-tal mellem kegler": 3});
t("4: 3x 8-tal mellem kegler -> 15 + 5 = 20", [d.grund, d.bonus, d.i_alt], [15, 5, 20]);

d = dag({"Square": 2, "Croqueta": 1});
t("5: 2x Square + Croqueta -> 8 + 5 = 13, ingen bonus", [d.grund, d.bonus, d.i_alt], [13, 0, 13]);

d = dag({"Step-over": 1, "Træk-skub": 1, "Square": 1, "Jongleringstræning": 1});
t("6: Step-over, Træk-skub, Square, Jonglering -> 14, ingen bonus (grundtræning er ikke Svær)", [d.grund, d.bonus, d.i_alt], [14, 0, 14]);

d = dag({"V-rul inderside": 2, "V-rul yderside": 1});
t("7: 2x V-rul inderside + V-rul yderside -> 12, ingen bonus (to forskellige øvelser)", [d.grund, d.bonus, d.i_alt], [12, 0, 12]);

d = dag({});
t("8: ingen gennemførelser -> 0", [d.grund, d.bonus, d.i_alt], [0, 0, 0]);

afsnit("Reglerne hver for sig");
d = dag({"Toe-taps": 2, "Træk-skub": 2, "Square": 2, "Croqueta": 2});
t("ubegrænset: to af hvert niveau giver to gange 'én fra hvert niveau'", [d.bonus, d.kombier.length], [14, 2]);
d = dag({"Toe-taps": 6});
t("ubegrænset: 6 × samme giver to gange +5", d.bonus, 10);
d = dag({"Toe-taps": 5});
t("5 × samme giver kun én kombi - de to sidste kan ikke bruges to gange", d.bonus, 5);
d = dag({"Toe-taps": 1, "Træk-skub": 1, "Square": 1, "Aflevering mod mur": 1});
t("grundtræning kan ikke stå for Svær", d.bonus, 0);
d = dag({"Toe-taps": 1, "Sålerul": 1, "Trommestikker": 1});
t("tre forskellige på samme niveau er ikke 'samme øvelse'", d.bonus, 0);
d = dag({"Toe-taps": 3, "Træk-skub": 1, "Square": 1, "Croqueta": 1});
t("3 × Toe-taps + én af hver anden: én fra hvert niveau (+7) slår 3 af samme (+5)", [d.bonus, beskriv(d).length], [7, 1]);
d = dag({"Toe-taps": 4, "Træk-skub": 1, "Square": 1, "Croqueta": 1});
t("4 × Toe-taps + én af hver anden: begge kan fås (+12)", d.bonus, 12);
d = dag({"Jongleringstræning": 3, "Toe-taps": 1, "Træk-skub": 1, "Square": 1, "Croqueta": 1});
t("grundtræningens +5 kommer oveni niveaukombien", d.bonus, 12);

afsnit("Bonus genberegnes, når en gennemførelse kommer til eller fjernes");
const trin = [{"Toe-taps": 1, "Træk-skub": 1, "Square": 1}, {"Toe-taps": 1, "Træk-skub": 1, "Square": 1, "Croqueta": 1}, {"Toe-taps": 1, "Træk-skub": 1, "Square": 1}];
t("uden Svær 0, med Croqueta +7, Croqueta fjernet igen 0", trin.map(x=>dag(x, "samme-spiller").bonus), [0, 7, 0]);

afsnit("Mod en ren rekursion med huskeliste");
// Den langsomme, men åbenlyst rigtige måde: se på den første gennemførelse, der er tilbage.
// Den er enten ikke med i nogen kombi, med i "samme øvelse 3 gange", eller med i
// "én fra hvert niveau" sammen med én fra hvert af de andre niveauer. Prøv alle tre.
function rekursion(counts){
  const memo = new Map();
  const niveauAf = i => K.FOOTWORK[i].kategori;
  const erNiveau = i => K.FOOTWORK_KATEGORIER[niveauAf(i)].niveau;
  function r(c){
    const noegle = c.join(",");
    if(memo.has(noegle)) return memo.get(noegle);
    const i = c.findIndex(x=>x > 0);
    if(i < 0) return 0;
    const a = c.slice(); a[i]--;
    let bedst = r(a);
    if(c[i] >= 3){ const b = c.slice(); b[i] -= 3; bedst = Math.max(bedst, 5 + r(b)); }
    if(erNiveau(i)){
      const andre = K.FOOTWORK_NIVEAUER.filter(k=>k !== niveauAf(i));
      const kandidater = andre.map(k=>c.map((x, j)=>j).filter(j=>c[j] > 0 && niveauAf(j) === k));
      const vaelg = (l, valgt)=>{
        if(l === andre.length){ const b = c.slice(); b[i]--; valgt.forEach(j=>b[j]--); bedst = Math.max(bedst, 7 + r(b)); return; }
        for(const j of kandidater[l]) vaelg(l + 1, [...valgt, j]);
      };
      vaelg(0, []);
    }
    memo.set(noegle, bedst);
    return bedst;
  }
  return r(counts);
}
let frø = 41;
const tilf = () => (frø = (frø * 1103515245 + 12345) % 2147483648) / 2147483648;
let ens = 0, forskel = [], ugyldige = 0;
for(let n = 0; n < 3000; n++){
  const counts = K.FOOTWORK.map(()=>0);
  const hvor = 1 + Math.floor(tilf() * 6);
  for(let m = 0; m < hvor; m++){ const i = Math.floor(tilf() * counts.length); counts[i] = Math.min(10, counts[i] + 1 + Math.floor(tilf() * 4)); }
  if(counts.reduce((a, b)=>a + b, 0) > 16){ n--; continue; }       // hold rekursionen hurtig
  K.footworkComboMemo.clear();
  const app = K.footworkDayCombos(counts, 2);
  const ref = rekursion(counts);
  if(app.boost === ref) ens++; else if(forskel.length < 3) forskel.push({counts: counts.join(""), app: app.boost, ref});
  // Hver kombi skal være lovlig, og ingen gennemførelse må bruges to gange.
  const brugt = counts.map(()=>0); let lovlig = true;
  for(const k of app.kombier){
    k.oevelser.forEach(i=>brugt[i]++);
    if(k.type === "samme") lovlig &&= k.oevelser.every(i=>i === k.oevelser[0]) && k.bonus === 5;
    else lovlig &&= k.bonus === 7 && k.oevelser.map(i=>K.FOOTWORK[i].kategori).join() === K.FOOTWORK_NIVEAUER.join();
  }
  if(!lovlig || brugt.some((b, i)=>b > counts[i]) || app.kombier.reduce((a, k)=>a + k.bonus, 0) !== app.boost) ugyldige++;
}
t("3000 tilfældige dage: samme bonus som den rene rekursion", forskel, []);
t("og hver kombi er lovlig, og ingen gennemførelse er brugt to gange", ugyldige, 0);
console.log(`         (${ens} dage sammenlignet)`);

afsnit("Store dage");
const alt10 = K.FOOTWORK.map(()=>10);
K.footworkComboMemo.clear();
let t0 = Date.now(); const stor = K.footworkDayCombos(alt10, 2); const tid = Date.now() - t0;
t("alle 20 øvelser 10 gange hver svarer hurtigt", tid < 200, true);
// 10 af hver. Grundtræning: 4 øvelser × 3 × (+5) = 60. Hvert niveau har 40 gennemførelser;
// tager man t gange "3 af samme" pr. niveau, giver niveauerne 4·5·t + 7·(40 − 3t) = 280 − t,
// så det bedste er t = 0: alle 40 bruges i "én fra hvert niveau". Grådig (største først)
// ville tage alle 12 tripletter pr. niveau og ende på 268.
const forventet = 60 + Math.max(...Array.from({length: 13}, (_, tt)=>4 * 5 * tt + 7 * (40 - 3 * tt)));
t("og giver den bedste bonus: 60 + 280 = 340 (grådig ville give 268)", [stor.boost, forventet], [340, 340]);
console.log(`         (${tid} ms)`);

afsnit("Gamle dage er urørte");
const V1 = K.isoPlus(V2, -1);
K.saetData([{id:"g", days:{[V1]: {l: 1, c: 1, q: 1}}}], [], [], []);
K.footworkComboMemo.clear();
t("tre forskellige svære på en gammel dag giver stadig de gamle +8", K.footworkDayCombos(K.footworkDayCounts("g", V1), 1).boost, 8);
t("og samme tre på en ny dag giver 0 (L-rul og Square er nu Mellem, og der mangler Starter og Let)", (()=>{
  K.saetData([{id:"h", days:{[V2]: {l: 1, c: 1, q: 1}}}], [], [], []); K.footworkComboMemo.clear();
  return K.footworkDayCombos(K.footworkDayCounts("h", V2), 2).boost; })(), 0);

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
