// Appens egne dialoger: besked, spoerg og indtast. Modulet hentes ud af index.html.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const ud=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<0)throw new Error("mangler "+a);return html.slice(i,j);};
const stil = ud("<style>","</style>")+"</style>";
const modul = ud("// DIALOGER", "// GENTEGNING UDEN AT TRAEDE PAA BRUGEREN");

const side = `<!doctype html><html lang="da"><head><meta charset="utf-8">${stil}</head><body>
<button id="bagved">Knap på siden bagved</button>
<script>
let dialogAaben = 0;
${modul}
window.__d = { besked, spoerg, indtast, aaben: ()=>dialogAaben };
window.__svar = {};
window.__klar = true;
</script></body></html>`;
const f = new URL("./dialog.html", import.meta.url); writeFileSync(f, side);
const br = await chromium.launch(); const p = await br.newPage({viewport:{width:390,height:800}});
const fejl=[]; p.on("pageerror",e=>fejl.push(e.message));
let nativ = 0; p.on("dialog", async d=>{ nativ++; await d.dismiss(); });
await p.goto(f.href); await p.waitForFunction(()=>window.__klar);
let ok=0,d=0; const t=(n,b)=>{b?(ok++,console.log("  ok   "+n)):(d++,console.log("  FEJL  "+n));};
// starter en dialog uden at vente paa svaret; svaret lander i window.__svar[navn]
const start = (navn, kald) => p.evaluate(([navn, kald])=>{ window.__svar[navn] = "(venter)";
  eval("window.__d." + kald).then(v=>{ window.__svar[navn] = v === undefined ? "(undefined)" : v; }); }, [navn, kald]);
const svar = navn => p.evaluate(n=>window.__svar[n], navn);
const synlig = () => p.evaluate(()=>!document.getElementById("appDialog").classList.contains("hidden"));
const tekst = () => p.evaluate(()=>document.getElementById("dialogTekst").textContent);

console.log("\nDialoger");
t("ingen JS-fejl", fejl.length===0); if(fejl.length) console.log("   "+fejl.join("\n   "));

// --- besked ---
await p.focus("#bagved");
await start("b1", 'besked("Noten er gemt.")');
t("beskeden vises", await synlig() && (await tekst()) === "Noten er gemt.");
t("den har kun én knap", await p.evaluate(()=>document.getElementById("dialogNej").classList.contains("hidden")));
t("siden holdes i ro imens", (await p.evaluate(()=>window.__d.aaben())) === 1);
t("koden venter, til der er trykket OK", (await svar("b1")) === "(venter)");
await p.click("#dialogJa");
t("OK lukker den", !(await synlig()) && (await svar("b1")) === "(undefined)");
t("markøren er tilbage på knappen, den kom fra", await p.evaluate(()=>document.activeElement.id === "bagved"));
t("og siden må tegnes igen", (await p.evaluate(()=>window.__d.aaben())) === 0);

// --- tekst er tekst, ikke HTML ---
await start("x", 'besked("<img src=x onerror=\\"window.__hacket=1\\"><b>fed</b>\\nlinje to")');
await p.waitForTimeout(150);
t("markup i teksten bliver vist som tekst og ikke kørt",
  !(await p.evaluate(()=>window.__hacket)) && (await p.evaluate(()=>document.querySelectorAll("#dialogTekst *").length)) === 0);
t("linjeskift bevares", (await p.evaluate(()=>getComputedStyle(document.getElementById("dialogTekst")).whiteSpace)) === "pre-wrap");
await p.keyboard.press("Escape");
t("Escape lukker en besked", !(await synlig()));

// --- spoerg ---
await start("s1", 'spoerg("Slet alt om Oscar?")');
t("et spørgsmål har to knapper", !(await p.evaluate(()=>document.getElementById("dialogNej").classList.contains("hidden"))));
await p.click("#dialogJa");
t("OK giver true", (await svar("s1")) === true);
await start("s2", 'spoerg("Slet alt om Oscar?")');
await p.click("#dialogNej");
t("Annullér giver false", (await svar("s2")) === false);
await start("s3", 'spoerg("Slet alt om Oscar?")');
await p.keyboard.press("Escape");
t("Escape giver false", (await svar("s3")) === false);
await start("s4", 'spoerg("Slet alt om Oscar?")');
await p.mouse.click(5, 5);
t("et tryk ved siden af besvarer IKKE et spørgsmål", (await synlig()) && (await svar("s4")) === "(venter)");
await p.click("#dialogNej");
await start("s5", 'spoerg("Slet?", {ja:"Slet alt", farlig:true})');
t("en farlig handling får sin egen tekst og rød knap",
  await p.evaluate(()=>{ const b=document.getElementById("dialogJa"); return b.textContent==="Slet alt" && b.classList.contains("danger"); }));
await p.click("#dialogNej");
await start("s6", 'spoerg("Almindeligt?")');
t("og den røde knap hænger ikke ved til næste dialog",
  await p.evaluate(()=>{ const b=document.getElementById("dialogJa"); return b.textContent==="OK" && !b.classList.contains("danger"); }));
await p.click("#dialogNej");

// --- indtast ---
await start("i1", 'indtast("Skriv antal:", "7")');
t("startværdien står i feltet og er markeret", (await p.inputValue("#dialogInput")) === "7"
  && await p.evaluate(()=>document.activeElement.id === "dialogInput"));
await p.keyboard.type("9");
await p.keyboard.press("Enter");
t("Enter sender det skrevne", (await svar("i1")) === "9");
await start("i2", 'indtast("Skriv antal:", {tal:true})');
t("et talfelt beder telefonen om taltastatur", (await p.evaluate(()=>document.getElementById("dialogInput").inputMode)) === "numeric");
await p.click("#dialogNej");
t("Annullér giver null, ikke en tom tekst", (await svar("i2")) === null);
await start("i3", 'indtast("Hvorfor?", {flerlinjet:true, maks:10, hjaelp:"Skriv kort."})');
t("flerlinjet giver et tekstområde", (await p.evaluate(()=>document.getElementById("dialogInput").tagName)) === "TEXTAREA");
await p.keyboard.type("syg i dag og i morgen");
t("længden holdes af feltet selv", (await p.inputValue("#dialogInput")).length === 10);
t("hjælpetekst og tæller står under feltet", /Skriv kort\. · 10\/10 tegn/.test(await p.evaluate(()=>document.getElementById("dialogFelt").textContent)));
await p.keyboard.press("Enter");
t("Enter i et tekstområde sender IKKE", (await synlig()) && (await svar("i3")) === "(venter)");
await p.click("#dialogJa");
t("OK sender teksten", typeof (await svar("i3")) === "string" && (await svar("i3")).startsWith("syg i dag"));
await start("i4", 'indtast("Tomt?")');
await p.click("#dialogJa");
t("OK med tomt felt giver tom tekst (ikke null)", (await svar("i4")) === "");

// --- koe ---
await start("k1", 'besked("første")'); await start("k2", 'spoerg("anden")'); await start("k3", 'besked("tredje")');
t("tre på én gang: den første vises", (await tekst()) === "første");
await p.click("#dialogJa");
t("derefter den anden - i den rækkefølge koden skrev dem", (await tekst()) === "anden" && (await svar("k2")) === "(venter)");
t("siden holdes i ro hele vejen", (await p.evaluate(()=>window.__d.aaben())) === 1);
await p.click("#dialogJa");
t("og så den tredje", (await tekst()) === "tredje" && (await svar("k2")) === true);
await p.click("#dialogJa");
t("til sidst er der lukket", !(await synlig()) && (await p.evaluate(()=>window.__d.aaben())) === 0);

t("browserens egne bokse blev aldrig brugt", nativ === 0);
const bredde = await p.evaluate(()=>[document.documentElement.scrollWidth, window.innerWidth]);
t("ingen vandret scroll på en telefon", bredde[0] <= bredde[1] + 1);
await start("billede", 'indtast("Søg joker for lør. 7. nov.\\n\\nJokeren betyder, at streaken ikke bliver brudt. Dagen giver ingen point og tæller ikke som en aktiv dag.\\n\\nSkriv kort hvorfor:", {flerlinjet:true, maks:200, pladsholder:"Fx: syg", hjaelp:\'Hold det kort, og skriv ikke helbredsdetaljer - "syg" er nok.\', ja:"Send til træneren"})');
await p.screenshot({path: new URL("./dialog.png", import.meta.url).pathname});
await br.close();
console.log(`\n${ok} ok, ${d} fejl`); process.exit(d?1:0);
