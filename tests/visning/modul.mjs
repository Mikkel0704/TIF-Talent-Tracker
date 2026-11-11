// Talentmaerket slaaet fra pr. aargang - hvad en familie faktisk ser.
// Reglerne er testet i emulatoren; her er det brugerfladen: at fanen forsvinder, at
// Guides taber medaljestoffet men beholder kom-i-gang, og at Duel kun tilbyder frie
// dueller. Den rigtige kode hentes ud af index.html.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const ud = (a,b)=>{ const i=html.indexOf(a), j=html.indexOf(b,i); if(i<0||j<0) throw new Error("mangler "+a); return html.slice(i,j); };
const stil  = ud("<style>","</style>")+"</style>";
const nav   = ud('<nav id="mainNav"',"</nav>")+"</nav>";
const guide = ud('<section id="guide"','</section>')+"</section>";
const modul = ud("function talentmaerkeOn(year)", "async function toggleYearTalentmaerke");
const synlig= ud("function applyModuleVisibility()", "\nasync function toggleYearTalentmaerke");

function side(aargangFra){
  return `<!doctype html><html lang="da"><head><meta charset="utf-8">${stil}</head><body>
${nav.replaceAll('class="hidden"','')}
<main>${guide}<section id="training" class="page hidden"><h2>Talentmærket</h2></section>
<section id="footwork" class="page hidden"><h2>Daglig fodteknik</h2></section></main>
<script>
const clubModules = ${aargangFra ? `{talentmaerke:{"2014":false}}` : "{}"};
const currentUser = {uid:"u1"}; const currentUserDoc = {role:"player", playerId:"p1", years:["2014"]};
const currentPlayerLink = {id:"p1", name:"Test", year:"2014", gender:"dreng"};
function normalizeYearValue(v){ return String(v); }
function isPlayer(){ return true; }
function allowedYears(){ return ["2014"]; }
function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.getElementById(id)?.classList.remove("hidden");
}
${modul}
${synlig}
document.getElementById("parentGuideCard").classList.remove("hidden");
showPage("training");          // som ved login, foer indstillingen er hentet
applyModuleVisibility();       // lytteren svarer
window.__klar = true;
</script></body></html>`;
}

const browser = await chromium.launch();
let ok = 0, d = 0;
const t = (n,b)=>{ b?(ok++,console.log("  ok   "+n)):(d++,console.log("  FEJL  "+n)); };

async function maal(fra){
  const f = new URL(fra ? "./modul-fra.html" : "./modul-til.html", import.meta.url);
  writeFileSync(f, side(fra));
  const page = await browser.newPage({viewport:{width:390, height:900}});
  const fejl = [];
  page.on("pageerror", e=>fejl.push(e.message));
  page.on("console", m=>{ if(m.type()==="error") fejl.push(m.text()); });
  await page.goto(f.href);
  await page.waitForFunction(()=>window.__klar === true, {timeout:8000}).catch(()=>{});
  const r = await page.evaluate(()=>({
    faner: [...document.querySelectorAll("nav button")].filter(b=>!b.classList.contains("hidden")).map(b=>b.textContent.trim()),
    niveauKort: !document.getElementById("guideLevelCard").classList.contains("hidden"),
    oevelseKort: !document.getElementById("guideExerciseCard").classList.contains("hidden"),
    talentAfsnit: !document.getElementById("guideTalentIntro").classList.contains("hidden"),
    introTil: !document.getElementById("guideIntroOn").classList.contains("hidden"),
    introFra: !document.getElementById("guideIntroOff").classList.contains("hidden"),
    aabenSide: [...document.querySelectorAll(".page")].find(p=>!p.classList.contains("hidden"))?.id || null,
    bredde: document.documentElement.scrollWidth, vindue: window.innerWidth
  }));
  await page.screenshot({path: new URL(fra ? "./modul-fra.png" : "./modul-til.png", import.meta.url).pathname, fullPage:true, animations:"disabled"});
  await page.close();
  return {r, fejl};
}

console.log("\nTalentmærket SLÅET TIL (som i dag)");
let {r, fejl} = await maal(false);
t("ingen JS-fejl", fejl.length === 0); if(fejl.length) console.log("   "+fejl.join("\n   "));
t("fanen Talentmærket er der", r.faner.includes("Talentmærket"));
t("Guides viser niveauvejledning og øvelser", r.niveauKort && r.oevelseKort);
t("kom-i-gang nævner Talentmærket", r.talentAfsnit && r.introTil && !r.introFra);
t("spilleren lander på Talentmærket", r.aabenSide === "training");

console.log("\nTalentmærket SLÅET FRA for årgangen");
({r, fejl} = await maal(true));
t("ingen JS-fejl", fejl.length === 0); if(fejl.length) console.log("   "+fejl.join("\n   "));
t("fanen Talentmærket er væk", !r.faner.includes("Talentmærket"));
t("Fodteknik, Jonglering og Duel er der stadig",
  ["Fodteknik","Jonglering","Duel"].every(f=>r.faner.includes(f)));
t("Guides-fanen BLIVER - den forklarer også hjemmetræningen", r.faner.includes("Guides"));
t("men niveauvejledning og medaljeøvelser er skjult", !r.niveauKort && !r.oevelseKort);
t("kom-i-gang nævner ikke Talentmærket", !r.talentAfsnit);
t("og bruger teksten til en årgang uden forløbet", r.introFra && !r.introTil);
t("spilleren flyttes fra den skjulte side til Fodteknik", r.aabenSide === "footwork");
t("ingen vandret scroll på en telefon", r.bredde <= r.vindue + 1);
console.log("   faner: " + r.faner.join(" · "));

await browser.close();
console.log(`\n${ok} ok, ${d} fejl`);
process.exit(d ? 1 : 0);
