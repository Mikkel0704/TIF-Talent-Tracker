import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url),"utf8");
const ud = (a,b)=>{ const i=html.indexOf(a), j=html.indexOf(b,i); if(i<0||j<0) throw new Error("mangler "+a); return html.slice(i,j); };
const logik = ud("// JONGLERINGSSTIGEN","// DAGLIG FODTEKNIK");
const render = ud("function renderJuggle(){","\nfunction renderFootwork()");
const stil = ud("<style>","</style>")+"</style>";
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
function isPlayer(){return true;} function isDemoUser(){return true;} function demoBlocked(){return false;}
function canAccessPlayer(){return true;} function normalizeYearValue(v){return String(v);}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function dagsISO(d){const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");}
const db=null; function doc(){throw 0;} function setDoc(){throw 0;} function serverTimestamp(){return null;}
${logik}
${render}
renderJuggle(); window.__klar=true;
</script></body></html>`;
const f = new URL("./stigevisning.html", import.meta.url);
writeFileSync(f, side);
const br = await chromium.launch(); const p = await br.newPage({viewport:{width:390,height:900}});
const fejl=[]; p.on("pageerror",e=>fejl.push(e.message)); p.on("console",m=>{if(m.type()==="error")fejl.push(m.text());});
await p.goto(f.href); await p.waitForFunction(()=>window.__klar,{timeout:8000}).catch(()=>{});
const tekst = await p.evaluate(()=>document.getElementById("juggleArea").innerText);

let ok=0,d=0; const t=(n,b)=>{b?(ok++,console.log("  ok   "+n)):(d++,console.log("  FEJL  "+n));};
const knapper = await p.evaluate(()=>document.querySelectorAll("#juggleArea button").length);
console.log("\nStigen med demo-login");
t("ingen JS-fejl", fejl.length===0); if(fejl.length) console.log("   "+fejl.join("\n   "));
t('"Klaret"-knapperne er der ogsaa for demo', knapper > 0);
console.log("   antal knapper: " + knapper);
t("stigen vises med point pr. trin", /150 jongleringer i træk · 150 point/.test(tekst));
await br.close(); console.log(`\n${ok} ok, ${d} fejl`); process.exit(d?1:0);
