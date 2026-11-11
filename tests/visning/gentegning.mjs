// Gentegning uden at traede paa brugeren. Den rigtige renderAll og de rigtige vaern
// hentes ud af index.html; kun selve side-tegningen er erstattet af en lille stedfortraeder,
// der - ligesom den rigtige - skifter hele omraadet ud med innerHTML.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const ud=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<0)throw new Error("mangler "+a);return html.slice(i,j);};
const vaern = ud("// GENTEGNING UDEN AT TRAEDE PAA BRUGEREN", "// Static content (never changes");

const side = `<!doctype html><html lang="da"><head><meta charset="utf-8"></head><body>
<section id="s1" class="page"><div id="omraade"></div><button id="gem">Gem</button></section>
<section id="s2" class="page hidden"><div id="andet"></div></section>
<script>
let version = 0;
function tegnOmraade(){
  version++;
  document.getElementById("omraade").innerHTML =
    '<input id="note" value="fra databasen v' + version + '">' +
    '<input id="uroert" value="data v' + version + '">' +
    '<select id="modstander"><option value="a">Anna</option><option value="b">Bo</option><option value="c">Carl</option></select>' +
    '<div id="aar"><label><input type="checkbox" class="aar" value="2016"></label><label><input type="checkbox" class="aar" value="2017"></label></div>' +
    '<input type="file" id="video">';
}
// Stedfortraedere for de 15 rigtige tegnefunktioner: én tegner, resten er tomme.
function renderYearOptions(){ tegnOmraade(); }
function renderPlayers(){} function renderSelects(){} function renderTracking(){} function renderOverview(){}
function renderAdmin(){} function renderPlayerProfile(){} function renderReview(){} function renderTraining(){}
function renderChallenges(){} function renderLeaderboard(){} function renderChallengeBadge(){}
function renderDeletionRequests(){} function renderJuggle(){} function renderFootwork(){}
${vaern}
renderAll(true);
window.__api = { renderAll, version: ()=>version, venter: ()=>renderVenter, optaget: ()=>uiOptaget(),
                 dialog: n=>{ dialogAaben = n; } };
window.__klar = true;
</script></body></html>`;
const f = new URL("./gentegning.html", import.meta.url); writeFileSync(f, side);
const fil = new URL("./gentegning-video.mp4", import.meta.url); writeFileSync(fil, "ikke en rigtig video");

const br = await chromium.launch(); const p = await br.newPage();
const fejl=[]; p.on("pageerror",e=>fejl.push(e.message));
await p.goto(f.href); await p.waitForFunction(()=>window.__klar);
let ok=0,d=0; const t=(n,b)=>{b?(ok++,console.log("  ok   "+n)):(d++,console.log("  FEJL  "+n));};
const v = () => p.evaluate(()=>window.__api.version());
const snapshot = () => p.evaluate(()=>window.__api.renderAll());   // som naar databasen melder en aendring

console.log("\nGentegning uden at træde på brugeren");
t("ingen JS-fejl", fejl.length===0); if(fejl.length) console.log("   "+fejl.join("\n   "));

// --- 1. Gendan: aendrede felter overlever, uroerte faar nye data ---
await p.fill("#note", "venstrebenet");
await p.selectOption("#modstander", "c");
await p.check('#aar input[value="2017"]');
const slip = () => p.evaluate(()=>{ document.activeElement?.blur(); document.dispatchEvent(new Event("focusout")); });
await slip();
await p.waitForTimeout(8200);                           // rullemenuens faa sekunder er gaaet
const foer = await v();
await snapshot();
t("der blev tegnet om", (await v()) === foer + 1);
t("den halvskrevne note står der stadig", (await p.inputValue("#note")) === "venstrebenet");
t("den valgte modstander er stadig valgt", (await p.inputValue("#modstander")) === "c");
t("fluebenet uden id står der stadig", await p.isChecked('#aar input[value="2017"]'));
t("det andet flueben er IKKE blevet sat", !(await p.isChecked('#aar input[value="2016"]')));
t("et felt, brugeren ikke har rørt, får de nye data", (await p.inputValue("#uroert")) === "data v" + (await v()));

// --- 2. Udsaet: markoeren staar i et felt ---
await p.focus("#note");
const v2 = await v();
await snapshot();
t("med markøren i et felt tegnes der IKKE om", (await v()) === v2);
t("og optegningen er sat i kø", await p.evaluate(()=>window.__api.venter()));
await p.click("#gem");                                  // som at trykke Gem: markoeren forlader feltet
await p.waitForTimeout(1500);
t("den indhentes af sig selv, når feltet er sluppet", (await v()) === v2 + 1);
t("og noten overlevede også dét", (await p.inputValue("#note")) === "venstrebenet");

// --- 3. Udsaet: en valgt fil kan ikke gendannes, saa der ventes ---
await p.setInputFiles("#video", fil.pathname);
await slip();
await p.waitForTimeout(700);
const v3 = await v();
await snapshot(); await snapshot(); await snapshot();    // tre holdkammerater trykker "+"
t("med en valgt fil tegnes der IKKE om", (await v()) === v3);
t("filen er der stadig, når barnet trykker Upload", (await p.evaluate(()=>document.getElementById("video").files.length)) === 1);
await p.evaluate(()=>{ document.getElementById("video").value = ""; });   // som efter en faerdig upload
await p.waitForTimeout(1500);
t("når filen er sendt, indhentes optegningen", (await v()) === v3 + 1);

// --- 4. En aaben dialog holder ogsaa siden i ro ---
await p.evaluate(()=>window.__api.dialog(1));
await slip();
const v4 = await v();
await snapshot();
t("med en åben dialog tegnes der IKKE om", (await v()) === v4);
await p.evaluate(()=>window.__api.dialog(0));
await p.waitForTimeout(1500);
t("og den indhentes, når dialogen lukkes", (await v()) === v4 + 1);

// --- 5. Et sideskift tegner altid ---
await p.focus("#note");
const v5 = await v();
await p.evaluate(()=>window.__api.renderAll(true));
t("et sideskift tegner om, selv om et felt har markøren", (await v()) === v5 + 1);

await br.close();
console.log(`\n${ok} ok, ${d} fejl`); process.exit(d?1:0);
