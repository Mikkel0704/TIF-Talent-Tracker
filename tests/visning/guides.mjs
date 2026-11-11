import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url),"utf8");
const ud=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<0)throw new Error("mangler "+a);return html.slice(i,j);};
const stil = ud("<style>","</style>")+"</style>";
const nav  = ud('<nav id="mainNav"',"</nav>")+"</nav>";
const guide= ud('<section id="guide"','</section>')+"</section>";
const data = ud("const exercises =","// ---------------------------------------------------------------------------\n// JONGLERINGSSTIGEN");
const rend = ud("function renderExerciseInfo(){","function renderYearControl()");
const side = `<!doctype html><html lang="da"><head><meta charset="utf-8">${stil}</head><body>
${nav.replaceAll('class="hidden"','')}
<main>${guide}</main><script>
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function listItems(a){return "<ul>"+(a||[]).map(x=>"<li>"+escapeHtml(x)+"</li>").join("")+"</ul>";}
function showPage(){} 
${data}
${rend}
document.getElementById("guide").classList.remove("hidden");
document.getElementById("parentGuideCard").classList.remove("hidden");
renderExerciseInfo(); window.__klar=true;
</script></body></html>`;
const f=new URL("./guides.html",import.meta.url); writeFileSync(f,side);
const br=await chromium.launch(); const p=await br.newPage({viewport:{width:390,height:900}});
const fejl=[]; p.on("pageerror",e=>fejl.push(e.message)); p.on("console",m=>{if(m.type()==="error")fejl.push(m.text());});
await p.goto(f.href); await p.waitForFunction(()=>window.__klar,{timeout:8000}).catch(()=>{});
let ok=0,d=0; const t=(n,b)=>{b?(ok++,console.log("  ok   "+n)):(d++,console.log("  FEJL  "+n));};
const faner = await p.evaluate(()=>[...document.querySelectorAll("nav button")].filter(b=>!b.classList.contains("hidden")).map(b=>b.textContent.trim()));
console.log("\nFaner og Guides-siden");
t("ingen JS-fejl", fejl.length===0); if(fejl.length) console.log("   "+fejl.join("\n   "));
console.log("   faner: " + faner.join(" · "));
t("Talentmærket, Fodteknik, Jonglering, Duel i den rækkefølge",
  /Talentmærket.*Fodteknik.*Jonglering.*Duel/.test(faner.join("|")));
t("ingen Kriterier-fane mere", !faner.some(f=>/Kriterier/.test(f)));
t("Guides-fanen findes", faner.some(f=>f==="Guides"));
t("Min profil i stedet for Spillerprofil", faner.includes("Min profil") && !faner.some(f=>/Spillerprofil/.test(f)));
// Fold Præcision ud og tjek, at BÅDE krav og beskrivelse er der
await p.evaluate(()=>{ document.querySelectorAll("#exerciseInfo details")[1].open = true; });
const praecision = await p.evaluate(()=>document.querySelectorAll("#exerciseInfo details")[1].innerText);
t("kravene står i øvelsen", /Bronze[\s\S]*4 ud af 10/.test(praecision));
t("beskrivelsen står samme sted", /Formål/.test(praecision) && /Opsætning/.test(praecision));
// Skift niveau - kravene skal følge med, og harmonikaen skal blive stående åben
await p.selectOption("#criteriaLevel","3"); await p.evaluate(()=>renderGuideLevels());
const efter = await p.evaluate(()=>({
  aaben: document.querySelectorAll("#exerciseInfo details")[1].open,
  tekst: document.querySelectorAll("#exerciseInfo details")[1].innerText
}));
t("kravene skifter med niveauet", /Niveau 3/.test(efter.tekst) && /7 ud af 10/.test(efter.tekst));
t("den udfoldede øvelse klapper IKKE sammen ved niveauskift", efter.aaben === true);
t("alle fem øvelser er på siden", (await p.evaluate(()=>document.querySelectorAll("#exerciseInfo details").length))===5);
await p.screenshot({path:new URL("./guides.png",import.meta.url).pathname, fullPage:true, animations:"disabled"});
await br.close(); console.log(`\n${ok} ok, ${d} fejl`); process.exit(d?1:0);
