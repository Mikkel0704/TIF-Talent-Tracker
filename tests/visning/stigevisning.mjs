import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url),"utf8");
const ud = (a,b)=>{ const i=html.indexOf(a), j=html.indexOf(b,i); if(i<0||j<0) throw new Error("mangler "+a); return html.slice(i,j); };
const logik = ud("// JONGLERINGSSTIGEN","// DAGLIG FODTEKNIK");
const render = ud("function renderJuggle(){","\nfunction renderFootwork()");
const stil = ud("<style>","</style>")+"</style>";
// Videoknappen paa oevelserne: de rigtige funktioner fra appen, uden nogen videoer lagt op.
const videoknap = "let guideVideos = {};\n" + ud("function sikkerVideoUrl(url){", "// En udfordringsvideo vises kun") + ud("function guideVideoFor(key){", "function guideVideosAendret(){");
const side = `<!doctype html><html lang="da"><head><meta charset="utf-8">${stil}</head><body>
<div id="juggleArea"></div><div id="juggleRulesArea"></div><script>
const juggleLadder=[{id:"p1",mainStep:10,weakStep:4,tricks:["oploft","vrist"]}];
const juggleLog=[]; const players=[{id:"p1",name:"Test",year:"2016",gender:"dreng"}];
const currentPlayerLink=players[0]; const currentUser={uid:"u1"};
const steps=[{level:1,medal:"Bronze",label:"N1 B"},{level:1,medal:"Sølv",label:"N1 S"},{level:1,medal:"Guld",label:"N1 G"},
{level:2,medal:"Bronze",label:"N2 B"},{level:2,medal:"Sølv",label:"N2 S"},{level:2,medal:"Guld",label:"N2 G"},
{level:3,medal:"Bronze",label:"N3 B"},{level:3,medal:"Sølv",label:"N3 S"},{level:3,medal:"Guld",label:"N3 G"}];
const criteria={"Jonglering":{1:{Bronze:["10 jongleringer"],"Sølv":["20 jongleringer"],Guld:["35 jongleringer"]},
2:{Bronze:["40 jongleringer"],"Sølv":["55 jongleringer","+ mindst 5 med andet ben"],Guld:["75 jongleringer","+ mindst 10 med andet ben"]},
3:{Bronze:["80 jongleringer","+ mindst 15 med andet ben"],"Sølv":["100 jongleringer","+ mindst 20 med andet ben"],Guld:["150 jongleringer","+ mindst 30 med andet ben"]}}};
function isPlayer(){return true;} function isDemoUser(){return false;} function demoBlocked(){return false;}
function canAccessPlayer(){return true;} function normalizeYearValue(v){return String(v);}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function dagsISO(d){const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");}
// Dialoger og skrivninger gribes, saa siden kan klikkes igennem: spoerg svarer ja, og en
// skrivning flettes ind i dataene og tegner siden igen - som appens lytter ville goere.
window.__dialoger=[];
async function spoerg(m){ window.__dialoger.push(String(m)); return true; }
function besked(m){ window.__dialoger.push(String(m)); }
const db=null; function doc(_db,samling){ return samling; } function serverTimestamp(){return null;}
async function setDoc(ref,data){ if(ref==="juggleLadder"){ Object.assign(juggleLadder[0], data); renderJuggle(); } }
${logik}
${videoknap}
${render}
renderJuggle(); window.__klar=true;
</script></body></html>`;
const f = new URL("./stigevisning.html", import.meta.url);
writeFileSync(f, side);
const br = await chromium.launch(); const p = await br.newPage({viewport:{width:390,height:900}});
const fejl=[]; p.on("pageerror",e=>fejl.push(e.message)); p.on("console",m=>{if(m.type()==="error")fejl.push(m.text());});
await p.goto(f.href); await p.waitForFunction(()=>window.__klar,{timeout:8000}).catch(()=>{});
const tekst = await p.evaluate(()=>document.getElementById("juggleArea").innerText);
let ok=0,d=0; const t=(n,b)=>{ b?(ok++,console.log("  ok   "+n)):(d++,console.log("  FEJL  "+n)); };
console.log("\nStigen i browser");
t("ingen JS-fejl", fejl.length===0); if(fejl.length) console.log("   "+fejl.join("\n   "));
t("trin 1 (3 jongleringer) viser 5 point", /(^|\n)3 jongleringer i træk · 5 point/.test(tekst));
t("trin 8 (40) viser 10 point", /(^|\n)40 jongleringer i træk · 10 point/.test(tekst));
t("trin 10 (75) viser 15 point", /(^|\n)75 jongleringer i træk · 15 point/.test(tekst));
t("trin 13 (150) viser 20 point", /(^|\n)150 jongleringer i træk · 20 point/.test(tekst));
t("trin 16 (300) er med og viser 20 point", /(^|\n)300 jongleringer i træk · 20 point/.test(tekst));
t("hovedstigen har 16 trin", (tekst.match(/jongleringer i træk · \d+ point/g)||[]).length === 16);
t("dårligt ben 2 viser 5 point", /(^|\n)2 berøringer med dårligt ben i træk · 5 point/.test(tekst));
t("dårligt ben 7 viser 10 point", /(^|\n)7 berøringer med dårligt ben i træk · 10 point/.test(tekst));
t("dårligt ben 30 viser 15 point", /(^|\n)30 berøringer med dårligt ben i træk · 15 point/.test(tekst));
t("dårligt ben 100 er med og viser 20 point", /(^|\n)100 berøringer med dårligt ben i træk · 20 point/.test(tekst));
t("dårligt ben har 12 trin", (tekst.match(/berøringer med dårligt ben i træk · \d+ point/g)||[]).length === 12);
const faser = await p.evaluate(()=>[...document.querySelectorAll("#juggleArea .phasehead")].map(x=>x.firstChild.textContent.trim()));
t("hovedstigens faser: 1-4, 5-8, 9-12, 13-16 - og dårligt bens: 1-3, 4-6, 7-9, 10-12",
  JSON.stringify(faser) === JSON.stringify(["Trin 1-4 · Find kontakten", "Trin 5-8 · Rytme", "Trin 9-12 · Kontrol", "Trin 13-16 · Udholdenhed",
    "Trin 1-3 · Find kontakten", "Trin 4-6 · Rytme", "Trin 7-9 · Kontrol", "Trin 10-12 · Udholdenhed",
    "Let · 10 point pr. trick", "Mellem · 15 point pr. trick", "Svær · 20 point pr. trick"]));
t("ingen point tæller dobbelt længere", !/dobbelt/i.test(tekst));
t("dårligt ben forklarer trappen", tekst.includes("Trinnene giver 5, 10, 15 og 20 point - samme trappe som hovedstigen."));
// Fikstur: hovedstige 10 (5x4 + 10x4 + 15x2 = 90), dårligt ben 4 (3x5 + 10 = 25), opløft + vrist (20).
t("totalen står øverst: 90 + 25 + 20 = 135", /(^|\n)135 point fra stigen/.test(tekst));
t("og fremdriften er 10/16, 4/12 og 2/16 tricks", tekst.includes("Hovedstigen 10/16 · Dårligt ben 4/12 · Tricks 2/16"));
const regler = await p.evaluate(()=>document.getElementById("juggleRulesArea").innerText);
t("reglerne forklarer de nye point",
  regler.includes("Point: 5 point pr. trin i Find kontakten, 10 i Rytme, 15 i Kontrol og 20 i Udholdenhed. Dårligt ben følger samme trappe: 5, 10, 15 og 20."));
t("og ikke de gamle", !/lige så mange point|dobbelt/.test(regler));
console.log("   -> " + (tekst.match(/\d+ point fra stigen/)||[""])[0]);
// Fortryd skal staa paa det SENEST klarede trin - og kun dér.
const fortryd = await p.evaluate(()=>{
  const raekker = [...document.querySelectorAll("#juggleArea .ladderrow")];
  const med = raekker.filter(r=>r.innerHTML.includes("undoJuggle("));
  const trickMed = raekker.filter(r=>r.innerHTML.includes("undoJuggleTrick("));
  return {
    antalTrin: med.length,
    paaTrin: med.map(r=>r.querySelector(".laddernum")?.textContent.trim()),
    antalTricks: trickMed.length,
    tricks: trickMed.map(r=>r.querySelector("b")?.textContent.replace("✓ ","").trim()),
    klaredeUdenFortryd: raekker.filter(r=>r.className.includes("done") && !r.innerHTML.includes("undoJuggle")).length
  };
});
// Fikstur: mainStep 10 (trin 10 = 75), weakStep 4 (trin 4 = 7), tricks oploft + vrist.
t("fortryd staar paa ét trin pr. stige (det senest klarede)", fortryd.antalTrin === 2);
t("og det er 75 paa hovedstigen og 7 paa dårligt ben",
  fortryd.paaTrin.includes("75") && fortryd.paaTrin.includes("7"));
t("fortryd staar paa begge klarede tricks", fortryd.antalTricks === 2);
t("og kun paa dem, der ER klaret",
  fortryd.tricks.includes("Opløft") && fortryd.tricks.includes("Stop på vristen"));
t("de oevrige klarede trin har ingen fortryd-knap", fortryd.klaredeUdenFortryd > 0);
console.log("   fortryd paa trin: " + fortryd.paaTrin.join(", ") + " | tricks: " + fortryd.tricks.join(", "));

console.log("\nTricks: grupper, point og låste serier");
// Hvilke tricks staar under hvilken overskrift, med point, laas og knap.
const trickInfo = () => p.evaluate(()=>{
  const ud = {}; let gruppe = null;
  const kasse = document.querySelector('#juggleArea [data-trick]').parentElement;
  for(const el of kasse.children){
    if(el.classList.contains("phasehead")){ gruppe = el.textContent.trim(); ud[gruppe] = []; continue; }
    if(!el.dataset.trick || !gruppe) continue;
    ud[gruppe].push({id: el.dataset.trick, navn: el.querySelector("b").textContent.replace(/^[✓🔒] /u, "").trim(),
      point: (/· (\d+) point/.exec(el.querySelector(".ladderstep").textContent) || [])[1],
      laast: el.querySelector(".laastgrund")?.textContent.trim() || null,
      knap: el.querySelector("button")?.textContent.trim() || null, klaret: el.classList.contains("done")});
  }
  for(const g of Object.keys(ud)) if(!ud[g].length) delete ud[g];
  return ud;
});
let info = await trickInfo();
t("tre grupper med de rigtige tricks", JSON.stringify(Object.fromEntries(Object.entries(info).map(([g, xs])=>[g, xs.map(x=>x.navn)]))) === JSON.stringify({
  "Let · 10 point pr. trick": ["Opløft","Stop på vristen","Skiftefod","Inderside 5","Yderside 5"],
  "Mellem · 15 point pr. trick": ["Lår-fod-lår-fod","3 hovedstød","Grib bolden på foden","Inderside 10","Yderside 10","Hælen bagom 3"],
  "Svær · 20 point pr. trick": ["Jorden rundt","10 hovedstød","Inderside 20","Yderside 20","Hælen bagom 5"]}));
t("hvert trick viser sin gruppes point", Object.entries(info).every(([g, xs])=>xs.every(x=>g.includes(" " + x.point + " point"))));
const alle = () => Object.values(info).flat(), hent = id => alle().find(x=>x.id === id);
t("de låste viser grunden", ["inderside10","yderside10","inderside20","yderside20","haelbagom5"].map(id=>hent(id).laast).join(" | ")
  === "Tag Inderside 5 først | Tag Yderside 5 først | Tag Inderside 10 først | Tag Yderside 10 først | Tag Hælen bagom 3 først");
t("og har ingen knap", ["inderside10","yderside10","inderside20","yderside20","haelbagom5"].every(id=>hent(id).knap === null));
t("præcis fem er låst", alle().filter(x=>x.laast).length === 5);
t("10 hovedstød er åbent uden 3 hovedstød", hent("hoved10").knap === "Klaret" && !hent("hoved10").laast);
t("Inderside 5 og Hælen bagom 3 kan tages", hent("inderside5").knap === "Klaret" && hent("haelbagom3").knap === "Klaret");
t("teksterne står der", /5 gange med hælen bag om støttebenet i én jongleringsserie - de behøver ikke komme i træk\. · 20 point/.test(tekst)
  && /Stop bolden på vristen, hold den i 5 sekunder, og jonglér videre\. · 15 point/.test(tekst)
  && /Før foden hele vejen rundt om bolden i luften, og jonglér videre\. · 20 point/.test(tekst));
t("forklaringen nævner serierne", tekst.includes("Engangsudfordringer. Tag dem i den rækkefølge, du vil - men Inderside, Yderside og Hælen bagom er serier, der tages i rækkefølge."));
t("reglerne nævner tricksenes point", regler.includes("Tricks: Let giver 10 point, Mellem 15 og Svær 20."));
const bred = async () => p.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1);
t("ingen vandret scroll ved 390 px", await bred());

console.log("\nRegistrér serien i rækkefølge, og fortryd den");
const klik = async (id, tekstPaaKnap) => { await p.click(`#juggleArea [data-trick="${id}"] button:has-text("${tekstPaaKnap}")`); await p.waitForTimeout(50); };
const dialog = () => p.evaluate(()=>window.__dialoger[window.__dialoger.length-1]);
await klik("inderside5", "Klaret");
t("Inderside 5: dialogen lover 10 point", /Registrér "Inderside 5"\?\n\nDet giver 10 point/.test(await dialog()));
info = await trickInfo();
t("Inderside 5 er klaret, og Inderside 10 er åbnet", hent("inderside5").klaret && hent("inderside10").knap === "Klaret" && !hent("inderside10").laast);
t("Inderside 20 er stadig låst - nu bag Inderside 10", hent("inderside20").laast === "Tag Inderside 10 først");
await klik("inderside10", "Klaret");
t("Inderside 10: dialogen lover 15 point", /Registrér "Inderside 10"\?\n\nDet giver 15 point/.test(await dialog()));
await klik("inderside20", "Klaret");
info = await trickInfo();
t("hele inderside-serien er klaret", ["inderside5","inderside10","inderside20"].every(id=>hent(id).klaret));
t("totalen er steget med 10 + 15 + 20", /(^|\n)180 point fra stigen/.test(await p.evaluate(()=>document.getElementById("juggleArea").innerText)));
await klik("inderside5", "Fortryd");
t("fortryd Inderside 5: dialogen nævner 10 og 20 og 45 point",
  await dialog() === 'Fortryd "Inderside 5"?\n\nInderside 10 og Inderside 20 bygger på Inderside 5 og bliver også fortrudt. Du mister 45 point i alt.');
info = await trickInfo();
t("bagefter er hele serien væk igen, og 10 og 20 er låst", !hent("inderside5").klaret && hent("inderside10").laast === "Tag Inderside 5 først" && hent("inderside20").laast === "Tag Inderside 10 først");
t("og de andre tricks er urørte", hent("oploft").klaret && hent("vrist").klaret);
t("stadig ingen vandret scroll", await bred());
t("stadig ingen JS-fejl", fejl.length===0);
await p.evaluate(()=>{ juggleLadder[0].tricks = ["oploft","vrist","inderside5"]; renderJuggle(); });
await p.screenshot({path:new URL("./stige.png",import.meta.url).pathname, fullPage:true, animations:"disabled"});
await br.close(); console.log(`\n${ok} ok, ${d} fejl`); process.exit(d?1:0);
