// Trænerens fodteknik-blok på Registrering, med den rigtige kode fra index.html.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url),"utf8");
const ud=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<0)throw new Error("mangler "+a);return html.slice(i,j);};
const stil  = ud("<style>","</style>")+"</style>";
const logik = ud("// DAGLIG FODTEKNIK","const POINT_BASE =");
// Selve blokken klippes ud af renderTracking og koeres for sig.
const blok  = ud("  // Fodteknikken: samme tanke som stigen","\n  // Kører årgangen ikke Talentmærket");

const iDag=new Date(); const dato=n=>{const d=new Date(iDag);d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};

const side = `<!doctype html><html lang="da"><head><meta charset="utf-8">${stil}</head><body>
<main><div class="card"><div id="trackingArea"></div></div></main><script>
const footwork=[{id:"p1",days:{
 "${dato(0)}":{t:2,v:1},"${dato(-1)}":{t:1,s:1},"${dato(-4)}":{t:3,l:1},"${dato(-20)}":{q:1,t:1}
},jokers:{},jokerRequests:{},year:"2016",gender:"dreng"}];
const footworkLogs=[{id:"p1",entries:[],reasons:{},year:"2016",gender:"dreng"}];
const juggleLadder=[],juggleLog=[];
const players=[{id:"p1",name:"Test Testesen",year:"2016",gender:"dreng"}];
const p=players[0]; const currentUser={uid:"u1",email:"t@x.invalid"}; const currentPlayerLink=null;
function isPlayer(){return false;} function isDemoUser(){return false;} function demoBlocked(){return false;}
function canAccessPlayer(){return true;} function normalizeYearValue(v){return String(v);}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function juggleFor(){return null;} function juggleLogFor(){return [];}
const db=null; function doc(){throw 0;} function setDoc(){throw 0;} function serverTimestamp(){return null;}
function deleteField(){return "__DEL__";}
${logik}
${blok}
document.getElementById("trackingArea").innerHTML = footworkKort;
window.__klar=true;
</script></body></html>`;
const f=new URL("./traener.html",import.meta.url); writeFileSync(f,side);
const br=await chromium.launch(); const page=await br.newPage({viewport:{width:390,height:900}});
const fejl=[]; page.on("pageerror",e=>fejl.push(e.message)); page.on("console",m=>{if(m.type()==="error")fejl.push(m.text());});
await page.goto(f.href); await page.waitForFunction(()=>window.__klar,{timeout:8000}).catch(()=>{});
const r = await page.evaluate(()=>({
  tekst: document.getElementById("trackingArea").innerText,
  raekker: document.querySelectorAll("#trackingArea table tr").length,
  bredde: document.documentElement.scrollWidth, vindue: window.innerWidth
}));
let ok=0,d=0; const t=(n,b)=>{b?(ok++,console.log("  ok   "+n)):(d++,console.log("  FEJL  "+n));};
console.log("\nTrænerens øvelsesoversigt i browser");
t("ingen JS-fejl", fejl.length===0); if(fejl.length) console.log("   "+fejl.join("\n   "));
t("en række pr. øvelse plus overskrift", r.raekker === 13);
t("toe-taps er lagt sammen til 7", /Toe-taps[\s\S]{0,40}7/.test(r.tekst));
t("en øvelse der aldrig er lavet står som 'aldrig'", /aldrig/.test(r.tekst));
t("fordelingen vises", /let \d+% · mellem \d+% · svær \d+%/.test(r.tekst));
t("de aldrig prøvede øvelser er listet", /aldrig prøvet:/.test(r.tekst));
t("en gammel øvelse har stadig sin dato (ud over de 10 dage)", /Square|Croqueta/.test(r.tekst));
t("ingen vandret scroll på en telefon", r.bredde <= r.vindue+1);
console.log("\n" + r.tekst.split("\n").filter(l=>/gennemførelser i alt|aldrig prøvet/.test(l)).join("\n"));
await page.screenshot({path:new URL("./traener.png",import.meta.url).pathname, fullPage:true, animations:"disabled"});
await br.close(); console.log(`\n${ok} ok, ${d} fejl`); process.exit(d?1:0);
