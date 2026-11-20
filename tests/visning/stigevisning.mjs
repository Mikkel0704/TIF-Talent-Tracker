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
const db=null; function doc(){throw 0;} function setDoc(){throw 0;} function serverTimestamp(){return null;}
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
t("dårligt ben 20 viser 15 point", /(^|\n)20 berøringer med dårligt ben i træk · 15 point/.test(tekst));
t("dårligt ben 30 viser 20 point", /(^|\n)30 berøringer med dårligt ben i træk · 20 point/.test(tekst));
const faser = await p.evaluate(()=>[...document.querySelectorAll("#juggleArea .phasehead")].map(x=>x.firstChild.textContent.trim()));
t("faserne: 1-4, 5-8, 9-12, 13-16",
  JSON.stringify(faser) === JSON.stringify(["Trin 1-4 · Find kontakten", "Trin 5-8 · Rytme", "Trin 9-12 · Kontrol", "Trin 13-16 · Udholdenhed"]));
t("ingen point tæller dobbelt længere", !/dobbelt/i.test(tekst));
t("dårligt ben forklarer trappen", tekst.includes("Trinnene giver 5, 10, 15 og 20 point - samme trappe som hovedstigen."));
// Fikstur: hovedstige 10 (5x4 + 10x4 + 15x2 = 90), dårligt ben 4 (4x5 = 20), opløft + vrist (20).
t("totalen står øverst: 90 + 20 + 20 = 130", /(^|\n)130 point fra stigen/.test(tekst));
t("og fremdriften er 10/16", tekst.includes("Hovedstigen 10/16 · Dårligt ben 4/10 · Tricks 2/6"));
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
await p.screenshot({path:new URL("./stige.png",import.meta.url).pathname, fullPage:true, animations:"disabled"});
await br.close(); console.log(`\n${ok} ok, ${d} fejl`); process.exit(d?1:0);
