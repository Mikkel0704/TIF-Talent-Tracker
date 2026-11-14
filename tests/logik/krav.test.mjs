// Trin 3: krav og point pr. gennemførelse kommer fra KATEGORIEN - ikke fra den enkelte øvelse.
import * as K from "./kode.mjs";

let ok = 0, fejl = 0;
function t(navn, fik, vent){
  const a = JSON.stringify(fik), b = JSON.stringify(vent);
  if(a === b){ ok++; console.log("  ok   " + navn); }
  else { fejl++; console.log("  FEJL " + navn + "\n         fik:      " + a + "\n         ventede:  " + b); }
}
const afsnit = s => console.log("\n" + s);
const V2 = K.FOOTWORK_V2_FRA, GAMMEL = K.isoPlus(V2, -1);
const iKat = k => K.FOOTWORK.filter(x=>x.kategori === k);

afsnit("Efter de nye regler");
for(const k of K.FOOTWORK_NIVEAUER){
  t(`${K.FOOTWORK_KATEGORIER[k].navn}: alle øvelser er 3 × 30 sek.`, iKat(k).map(x=>K.footworkBlock(x, V2)), iKat(k).map(()=>"3 × 30 sek."));
}
t("Grundtræning: alle fire er 5 minutter", iKat("grund").map(x=>K.footworkBlock(x, V2)), ["5 minutter","5 minutter","5 minutter","5 minutter"]);
t("8-tal mellem kegler er 5 minutter og 5 point", [K.footworkBlock(K.footworkEx("ottetal"), V2), K.footworkPointsPaa(K.footworkEx("ottetal"), V2)], ["5 minutter", 5]);
t("point pr. gennemførelse følger kategorien for alle 20",
  K.FOOTWORK.map(x=>K.footworkPointsPaa(x, V2)), K.FOOTWORK.map(x=>K.FOOTWORK_KATEGORIER[x.kategori].point));
t("ingen øvelse har sin egen tid eller sine egne point - kun kategorien bestemmer",
  K.FOOTWORK.filter(x=>"varighed" in x || "point" in x).map(x=>x.navn), []);
t("flyttes en øvelse til en anden kategori, følger tid og point med af sig selv", (()=>{
  const prøve = {...K.footworkEx("square"), kategori: "grund"};
  return [K.footworkBlock(prøve, V2), K.footworkPointsPaa(prøve, V2)];
})(), ["5 minutter", 5]);

afsnit("En gammel dag viser det, der gjaldt dengang");
t("jongleringstræning var 5 minutter og 8 point", [K.footworkBlock(K.footworkEx("jongler"), GAMMEL), K.footworkPointsPaa(K.footworkEx("jongler"), GAMMEL)], ["5 minutter", 8]);
t("de elleve andre gamle var 3 × 30 sek.",
  K.FOOTWORK.filter(x=>x.id !== "jongler" && K.footworkFindesPaa(x, GAMMEL)).map(x=>K.footworkBlock(x, GAMMEL)),
  Array(11).fill("3 × 30 sek."));
t("en ny øvelse har intet krav på en dag, hvor den ikke fandtes", K.footworkBlock(K.footworkEx("murafl"), GAMMEL), "");

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
