// Rangstigen, hentet ud af index.html.
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync(new URL("../../index.html", import.meta.url),"utf8");
const a = html.indexOf("const RANK_TIERS = [");
const b = html.indexOf("function nextTier");
const sti = new URL("./rangkode.mjs", import.meta.url);
writeFileSync(sti, html.slice(a, b) + `
function nextTier(points){ return RANK_TIERS.find(t=>t.min > (points||0)) || null; }
export { RANK_TIERS, tierForPoints, nextTier };`);
const K = await import(sti.href);

let ok=0, fejl=0;
const t=(n,f,v)=>{const x=JSON.stringify(f),y=JSON.stringify(v);
  if(x===y){ok++;console.log("  ok   "+n);}else{fejl++;console.log("  FEJL "+n+"\n         fik: "+x+"  ventede: "+y);}};

console.log("\nRangstigen");
t("ni trin", K.RANK_TIERS.length, 9);
t("rækkefølgen", K.RANK_TIERS.map(x=>x.name),
  ["Debutant","Klubspiller","Talent","Licens","Akademi","Superliga","Champions League","Landsholdsspiller","Verdensstjerne"]);
t("grænserne stiger hele vejen", K.RANK_TIERS.every((x,i)=>i===0 || x.min > K.RANK_TIERS[i-1].min), true);
t("første trin starter på nul", K.RANK_TIERS[0].min, 0);
t("alle trin har et ikon", K.RANK_TIERS.every(x=>!!x.icon), true);
t("ingen mangelord tilbage",
  K.RANK_TIERS.some(x=>/nybegynder|let øvet|rookie/i.test(x.name)), false);

console.log("\nIndplacering");
t("nul point er Debutant", K.tierForPoints(0).name, "Debutant");
t("negative point falder ikke igennem", K.tierForPoints(-50).name, "Debutant");
t("149 er stadig Debutant", K.tierForPoints(149).name, "Debutant");
t("150 er Klubspiller", K.tierForPoints(150).name, "Klubspiller");
// Pointreglerne 2026-11-25: medaljer og dueller giver ingen point - trinnene naas kun gennem
// fodteknik og stigen (graenserne er de samme). Hele stigen giver 570 (pointreglerne
// 2026-11-28): Talent, og 230 point fra Licens. Alt derover kraever fodteknik. (Se ogsaa point.test.mjs: rangtrinnet foelger
// det nye pointtal.)
t("hele stigen (570) er Talent", K.tierForPoints(570).name, "Talent");
t("og der mangler 230 point til Licens", K.nextTier(570).min - 570, 230);
t("2200 er Superliga", K.tierForPoints(2200).name, "Superliga");
t("8000 er Verdensstjerne", K.tierForPoints(8000).name, "Verdensstjerne");
t("over toppen bliver man på toppen", K.tierForPoints(999999).name, "Verdensstjerne");
t("manglende pointtal regnes som nul", K.tierForPoints(undefined).name, "Debutant");

console.log("\nNæste trin");
t("fra nul peges på Klubspiller", K.nextTier(0).name, "Klubspiller");
t("fra 149 peges på Klubspiller", K.nextTier(149).name, "Klubspiller");
t("fra 150 peges på Talent", K.nextTier(150).name, "Talent");
t("på toppen er der intet næste", K.nextTier(8000), null);

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
