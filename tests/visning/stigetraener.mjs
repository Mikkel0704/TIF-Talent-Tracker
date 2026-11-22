// Trænerens blok for et barns Jongleringsstige på Registrering, med den rigtige kode fra index.html:
// tricksene i tre grupper med point, låste tricks i en serie, loggen med serier, der rullede med,
// og at en rettelse holder serien hel (dialogen og det, der gemmes).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url),"utf8");
const ud=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<0)throw new Error("mangler "+a);return html.slice(i,j);};
const stil  = ud("<style>","</style>")+"</style>";
// Hvad der er en registrering (og loggens laengde) staar i fodteknik-blokken ved
// juggleActiveDays; writeJuggle i stige-blokken bruger det ogsaa.
const fremdrift = ["JUGGLE_FREMDRIFT", "JUGGLE_LOG_MAX"].map(n=>{ const m = new RegExp("\\nconst " + n + " = [^\\n]*;").exec(html); if(!m) throw new Error("mangler " + n); return m[0]; }).join("\n");
const logik = ud("// JONGLERINGSSTIGEN","// DAGLIG FODTEKNIK") + fremdrift + "\n";
// Selve blokken klippes ud af renderTracking og koeres for sig.
const blok  = ud("  // Traenerens stikproeve paa stigen.","  // Fodteknikken: samme tanke som stigen");

const side = `<!doctype html><html lang="da"><head><meta charset="utf-8">${stil}</head><body>
<main><div class="card"><div id="trackingArea"></div></div></main><script>
const juggleLadder=[{id:"p1",mainStep:5,weakStep:2,tricks:["oploft","inderside5","inderside10","yderside5"]}];
const juggleLog=[{id:"p1",entries:[
  {t:"undo",stige:"trick",trick:"haelbagom3",ogsaa:["haelbagom5"],at:"2026-11-22T10:00:00Z"},
  {t:"correct",stige:"trick",trick:"inderside10",til:"givet",ogsaa:["inderside5"],af:"t@x.invalid",at:"2026-11-21T10:00:00Z"},
  {t:"trick",v:"yderside5",at:"2026-11-20T10:00:00Z"}]}];
const players=[{id:"p1",name:"Test Testesen",year:"2016",gender:"dreng"}];
const currentUser={uid:"u1",email:"t@x.invalid"}; const currentPlayerLink=null;
window.__dialoger=[]; window.__skrevet=[];
async function spoerg(m){ window.__dialoger.push(String(m)); return true; }
function besked(m){ window.__dialoger.push(String(m)); }
function isPlayer(){return false;} function isDemoUser(){return false;} function demoBlocked(){return false;} const seSomSpiller = null; function seSomSpillerSpaerret(){ return false; }
function canAccessPlayer(){return true;} function normalizeYearValue(v){return String(v);}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function dagsISO(d){const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");}
const db=null; function doc(_db,samling){ return samling; } function serverTimestamp(){return null;}
async function setDoc(ref,data){ window.__skrevet.push({ref,data}); if(ref==="juggleLadder"){ Object.assign(juggleLadder[0], data); tegn(); } }
${logik}
function tegn(){
  const p = players[0];
${blok}
  document.getElementById("trackingArea").innerHTML = juggleBlock;
}
tegn();
window.__klar=true;
</script></body></html>`;
const f=new URL("./stigetraener.html",import.meta.url); writeFileSync(f,side);
const br=await chromium.launch(); const page=await br.newPage({viewport:{width:390,height:900}});
const fejl=[]; page.on("pageerror",e=>fejl.push(e.message)); page.on("console",m=>{if(m.type()==="error")fejl.push(m.text());});
await page.goto(f.href); await page.waitForFunction(()=>window.__klar,{timeout:8000}).catch(()=>{});
const laes = () => page.evaluate(()=>{
  const omraade = document.getElementById("trackingArea");
  const grupper = {}; let g = null;
  for(const el of omraade.querySelectorAll(".phasehead, .checkrow")){
    if(el.classList.contains("phasehead")){ g = el.textContent.trim(); grupper[g] = []; continue; }
    if(g) grupper[g].push({navn: el.querySelector("b").textContent.trim(), linje: el.querySelector(".small").textContent.trim(), knap: el.querySelector("button").textContent.trim()});
  }
  return { tekst: omraade.innerText, grupper, bred: document.documentElement.scrollWidth <= window.innerWidth + 1 };
});
let r = await laes();
let ok=0,d=0; const t=(n,b)=>{b?(ok++,console.log("  ok   "+n)):(d++,console.log("  FEJL  "+n));};
console.log("\nTrænerens blok for stigen i browser");
t("ingen JS-fejl", fejl.length===0); if(fejl.length) console.log("   "+fejl.join("\n   "));
t("tre grupper med 5, 6 og 5 tricks",
  JSON.stringify(Object.entries(r.grupper).map(([g, xs])=>[g, xs.length])) === JSON.stringify([["Tricks · Let · 10 point pr. trick",5],["Tricks · Mellem · 15 point pr. trick",6],["Tricks · Svær · 20 point pr. trick",5]]));
const raekke = navn => Object.values(r.grupper).flat().find(x=>x.navn===navn);
t("hvert trick viser sine point", raekke("Inderside 5").linje.startsWith("10 point") && raekke("Grib bolden på foden").linje.startsWith("15 point") && raekke("Jorden rundt").linje.startsWith("20 point"));
t("Opløft åbner stadig trin 4", raekke("Opløft").linje === "10 point · åbner trin 4");
t("et låst trick siger hvad det kræver", raekke("Hælen bagom 5").linje === "20 point · låst: kræver Hælen bagom 3" && raekke("Yderside 20").linje === "20 point · låst: kræver Yderside 10");
t("et åbent trick står ikke som låst", !/låst/.test(raekke("Inderside 20").linje) && !/låst/.test(raekke("Yderside 10").linje));
t("klarede tricks står som Klaret", raekke("Inderside 10").knap === "Klaret" && raekke("Inderside 20").knap === "Ikke endnu");
t("totalen: trin 5 (4x5 + 10) + dårligt ben 2 (10) + 10 + 10 + 15 + 10 = 85", /Jongleringsstigen · 85 point/.test(r.tekst));
t("loggen viser fortryd med serien", r.tekst.includes("spilleren fortrød Hælen bagom 3, også Hælen bagom 5"));
t("og en rettelse med serien", r.tekst.includes("(Inderside 10 givet, også Inderside 5)"));
t("og et almindeligt trick", r.tekst.includes("· Yderside 5"));
t("ingen vandret scroll på en telefon", r.bred);

console.log("\nRettelser holder serien hel");
const klik = async navn => { await page.click(`#trackingArea .checkrow:has(b:text-is("${navn}")) button`); await page.waitForTimeout(50); };
const dialog = () => page.evaluate(()=>window.__dialoger[window.__dialoger.length-1]);
const gemt = () => page.evaluate(()=>window.__skrevet.filter(x=>x.ref==="juggleLadder").pop()?.data.tricks);
await klik("Yderside 20");
t("giv Yderside 20: dialogen nævner Yderside 10 og +35",
  await dialog() === 'Giv "Yderside 20" for Test Testesen?\n\nYderside 10 kommer før i serien og bliver også givet.\n\n+35 point. Rettelsen bliver logget med din e-mail.');
t("og gemmer hele serien", JSON.stringify(await gemt()) === JSON.stringify(["oploft","inderside5","inderside10","yderside5","yderside10","yderside20"]));
await klik("Inderside 5");
t("fjern Inderside 5: dialogen nævner Inderside 10 og -25",
  await dialog() === 'Fjern "Inderside 5" for Test Testesen?\n\nInderside 10 bygger på Inderside 5 og bliver også fjernet.\n\n-25 point. Rettelsen bliver logget med din e-mail.');
t("og fjerner begge", JSON.stringify(await gemt()) === JSON.stringify(["oploft","yderside5","yderside10","yderside20"]));
r = await laes();
t("bagefter står Inderside 10 som låst igen", raekke("Inderside 10").linje === "15 point · låst: kræver Inderside 5" && raekke("Inderside 10").knap === "Ikke endnu");
t("stadig ingen JS-fejl", fejl.length===0);
t("stadig ingen vandret scroll", r.bred);
await page.screenshot({path:new URL("./stigetraener.png",import.meta.url).pathname, fullPage:true, animations:"disabled"});
await br.close(); console.log(`\n${ok} ok, ${d} fejl`); process.exit(d?1:0);
