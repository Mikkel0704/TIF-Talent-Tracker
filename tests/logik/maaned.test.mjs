// Månedens spiller: beregningen. A og B er i samme årgang og har samme antal
// træningsdage, medmindre andet står (som i bestillingen).
import * as K from "./kode.mjs";

let ok = 0, fejl = 0;
function t(navn, fik, vent){
  const a = JSON.stringify(fik), b = JSON.stringify(vent);
  if(a === b){ ok++; console.log("  ok   " + navn); }
  else { fejl++; console.log("  FEJL " + navn + "\n         fik:      " + a + "\n         ventede:  " + b); }
}
const afsnit = s => console.log("\n" + s);
const M = "2026-12";                                       // en måned efter de nye regler
const dag = n => `${M}-${String(n).padStart(2, "0")}`;
// Niveau-øvelser: Toe-taps (t) og Sålerul (s) er Starter. Grundtræning: Jongleringstræning (j).
// En spiller = {id, year, dage: {dato: {kode: antal}}, jokers?}
function kaar(spillere, forrige = [], maaned = M){
  K.footworkComboMemo.clear();
  K.saetData(spillere.map(p=>({id: p.id, days: p.dage, jokers: p.jokers || {}, year: p.year || "2017", gender: "dreng"})), [], [], []);
  const res = K.maanedensSpillerRangering(spillere.filter(p=>(p.year || "2017") === "2017").map(p=>({id: p.id, name: p.id, year: "2017"})), maaned, forrige);
  return {vindere: res.vindere.map(v=>v.id), res};
}
const ens = (antalDage, pr) => Object.fromEntries(Array.from({length: antalDage}, (_, i)=>[dag(i + 1), pr]));

afsnit("De bestilte tests");
t("1: A har 15 dage, B har 14 -> A vinder", kaar([{id:"A", dage: ens(15, {t:1})}, {id:"B", dage: ens(14, {t:1})}]).vindere, ["A"]);

let r = kaar([{id:"A", dage: {[dag(1)]: {j: 6}}}, {id:"B", dage: {[dag(1)]: {t: 10, s: 8}}}]);
t("2: A 6× grundtræning (30 min) mod B 18× niveau (27 min) -> A vinder på tid", r.vindere, ["A"]);
t("2: tallene er 30 og 27 minutter, 6 og 18 øvelser",
  r.res.rangliste.map(x=>[x.id, x.halveMin / 2, x.oevelser]), [["A", 30, 6], ["B", 27, 18]]);

r = kaar([{id:"A", dage: {[dag(1)]: {t: 10}}}, {id:"B", dage: {[dag(1)]: {j: 3}}}]);
t("3: A 10× niveau (15 min) mod B 3× grundtræning (15 min) -> lige tid, A vinder på øvelser", r.vindere, ["A"]);
t("3: begge har 15 minutter", r.res.rangliste.map(x=>x.halveMin / 2), [15, 15]);

r = kaar([{id:"A", dage: {[dag(1)]: {k: 3}}}, {id:"B", dage: {[dag(1)]: {t: 1, s: 1, d: 1}}}]);
t("4: A 3× samme svære (20 point) mod B 3× forskellige starter (6 point) -> A vinder på point", r.vindere, ["A"]);
t("4: tid 4,5 og 4,5 min, 3 og 3 øvelser, point 20 og 6",
  r.res.rangliste.map(x=>[x.halveMin / 2, x.oevelser, x.point]), [[4.5, 3, 20], [4.5, 3, 6]]);

t("5: lige på alt -> A og B deler prisen", kaar([{id:"A", dage: ens(4, {t:2})}, {id:"B", dage: ens(4, {t:2})}]).vindere, ["A", "B"]);

r = kaar([{id:"A", dage: ens(10, {t:1})}, {id:"B", dage: ens(8, {t:1})}, {id:"C", dage: ens(5, {t:1})}], ["A"]);
t("6: A vandt sidste måned og er nr. 1 igen -> nr. 2 (B) vinder", r.vindere, ["B"]);
t("6: og A står som sprunget over", r.res.sprunget, ["A"]);

t("7: kun A har trænet, og A vandt sidste måned -> ingen vinder",
  kaar([{id:"A", dage: ens(10, {t:1})}, {id:"B", dage: {}}], ["A"]).vindere, []);

{
  K.footworkComboMemo.clear();
  const data = [{id:"A", year:"2017", dage: ens(3, {t:1})}, {id:"B", year:"2016", dage: ens(2, {t:1})}];
  K.saetData(data.map(p=>({id: p.id, days: p.dage, jokers: {}, year: p.year, gender: "dreng"})), [], [], []);
  const i2017 = K.maanedensSpillerRangering([{id:"A", name:"A", year:"2017"}], M, []).vindere.map(v=>v.id);
  const i2016 = K.maanedensSpillerRangering([{id:"B", name:"B", year:"2016"}], M, []).vindere.map(v=>v.id);
  t("8: A og B i hver sin årgang -> begge vinder i deres egen", [i2017, i2016], [["A"], ["B"]]);
}

afsnit("Flere regler");
t("ingen har trænet -> ingen vinder", kaar([{id:"A", dage: {}}, {id:"B", dage: {}}]).vindere, []);
t("tre lige deler", kaar([{id:"A", dage: ens(2, {t:1})}, {id:"B", dage: ens(2, {t:1})}, {id:"C", dage: ens(2, {t:1})}]).vindere, ["A", "B", "C"]);
t("delte vindere sidste måned springes alle over",
  kaar([{id:"A", dage: ens(5, {t:1})}, {id:"B", dage: ens(5, {t:1})}, {id:"C", dage: ens(2, {t:1})}], ["A", "B"]).vindere, ["C"]);
t("deler nr. 2 og 3, når nr. 1 springes over, deler de",
  kaar([{id:"A", dage: ens(5, {t:1})}, {id:"B", dage: ens(3, {t:1})}, {id:"C", dage: ens(3, {t:1})}], ["A"]).vindere, ["B", "C"]);
t("en dag med en godkendt joker er ingen træningsdag",
  kaar([{id:"A", dage: ens(3, {t:1}), jokers: {[dag(1)]: "approved", [dag(2)]: "approved"}}, {id:"B", dage: ens(2, {t:1})}]).vindere, ["B"]);
t("dage i måneden før og efter tæller ikke",
  kaar([{id:"A", dage: {"2026-11-30": {t:5}, "2027-01-01": {t:5}, [dag(10)]: {t:1}}}, {id:"B", dage: ens(2, {t:1})}]).vindere, ["B"]);
r = kaar([{id:"A", dage: {[dag(1)]: {t: 1}}}], [], M);
t("point er dagens point uden streakbonus", r.res.rangliste[0].point, 2);
r = kaar([{id:"A", dage: ens(3, {t: 1})}]);
t("tre dage i træk giver streakbonus i appen, men ikke i kåringen", r.res.rangliste[0].point, 6);

afsnit("Gamle dage (før de nye regler) i november");
K.footworkComboMemo.clear();
K.saetData([{id:"A", days: {"2026-11-10": {j: 1, t: 2}, "2026-11-20": {j: 1}}, year: "2017", gender: "dreng"}], [], [], []);
const nov = K.maanedStat("A", "2026-11");
t("jongleringstræning tæller 5 min både før og efter skiftet; toe-taps 1,5 min", nov.halveMin / 2, 5 + 2 * 1.5 + 5);
t("og pointene er dagens egne: 10/11 efter de gamle regler (8 + 2×2), 20/11 efter de nye (5)", nov.point, 8 + 4 + 5);

afsnit("Hvornår en måned er afgjort");
t("november afgøres 5. december", K.maanedAfgoeres("2026-11"), "2026-12-05");
t("december afgøres 5. januar året efter", K.maanedAfgoeres("2026-12"), "2027-01-05");
t("4. december: intet er afgjort endnu", K.maanederTilKaaring("2026-12-04"), []);
t("5. december: november", K.maanederTilKaaring("2026-12-05"), ["2026-11"]);
t("5. januar: november og december, i rækkefølge", K.maanederTilKaaring("2027-01-05"), ["2026-11", "2026-12"]);
t("første kåring er november 2026", K.MAANEDENS_FOERSTE, "2026-11");
t("forrige måned over et årsskifte", K.forrigeMaaned("2027-01"), "2026-12");

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
