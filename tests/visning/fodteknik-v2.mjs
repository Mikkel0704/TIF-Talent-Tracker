// Trin 5: Fodteknik-siden efter de NYE regler, i hele appen. index.html køres uændret,
// bortset fra én ting: skiftedatoen sættes til 3 dage siden, så både en dag efter de nye
// regler (i dag) og en dag før (4 dage siden) kan ses i samme test.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const iso = n => { const d = new Date(); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const original = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const MARKOER = /const FOOTWORK_V2_FRA = "[0-9-]+";/;
if (!MARKOER.test(original)) throw new Error("skiftedatoen blev ikke fundet i index.html");
const html = original.replace(MARKOER, `const FOOTWORK_V2_FRA = "${iso(-3)}";`);
const sted = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PV = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];
const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: new Date().toISOString(), privacyVersion: PV };

let ok = 0, fejlet = 0;
const t = (n, b, info) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (info !== undefined ? "\n         " + JSON.stringify(info) : ""))); };
const browser = await chromium.launch();
async function start(dage){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const fejl = []; let nativ = 0;
  page.on("pageerror", e => fejl.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) fejl.push(m.text()); });
  page.on("dialog", async d => { nativ++; await d.dismiss(); });
  await page.route("**/*", r => { const u = r.request().url();
    if (u === "https://app.test/") return r.fulfill({ contentType: "text/html", body: html });
    if (u.startsWith("https://www.gstatic.com/firebasejs/")) return r.fulfill({ contentType: "application/javascript", body: sted });
    return r.abort(); });
  const db = { users: { u: { email: "s@x.invalid", role: "player", playerId: "p1", years: ["2017"], ...ok_ } },
    players: { p1: { name: "Oscar Test", year: "2017", gender: "dreng", points: 0, passed: {}, history: [] } },
    footwork: { p1: { year: "2017", gender: "dreng", days: dage } } };
  await page.addInitScript(([d, br, pv]) => { window.__db = d; window.__bruger = br; window.__skrivninger = []; try { sessionStorage.setItem("tif-demo-consent-seen", pv); } catch {} }, [db, { uid: "u", email: "s@x.invalid" }, PV]);
  await page.goto("https://app.test/");
  await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.click("#tab-footwork"); await page.waitForTimeout(250);
  return { page, fejl, nativ: () => nativ, luk: () => ctx.close() };
}
const tekst = (a, sel) => a.page.evaluate(s => document.querySelector(s)?.innerText || "", sel);

// ------------------------------------------------------------------ grupper og rækker
console.log("\nGrupperne og øvelserne");
let a = await start({ [iso(0)]: { k: 4, s: 1, p: 1, i: 1 }, [iso(-4)]: { v: 2, o: 1, k: 1 } });
const hoveder = await a.page.evaluate(() => [...document.querySelectorAll("#footworkArea .phasehead")].map(h => ({ tekst: h.innerText.replace(/\s+/g, " ").trim(), sektion: h.classList.contains("sektion") })));
t("fem grupper i rækkefølgen Starter, Let, Mellem, Svær, Grundtræning",
  JSON.stringify(hoveder.map(h => h.tekst.split(" ")[0].toLowerCase())) === JSON.stringify(["starter","let","mellem","svær","grundtræning"]), hoveder.map(h => h.tekst));
t("hver overskrift har point og tid", ["2 point · 3 × 30 sek.","3 point · 3 × 30 sek.","4 point · 3 × 30 sek.","5 point · 3 × 30 sek.","5 point · 5 minutter"].every((x, i) => hoveder[i]?.tekst.includes(x)), hoveder.map(h => h.tekst));
t("Grundtræning er en separat sektion - og den eneste", JSON.stringify(hoveder.map(h => h.sektion)) === JSON.stringify([false,false,false,false,true]));
t("og forklarer, at den ikke er et niveau", /ikke som et niveau/.test(hoveder[4]?.tekst || ""));
const raekker = await a.page.evaluate(() => [...document.querySelectorAll("#footworkArea .ladderrow")].map(r => ({ navn: r.querySelector("b").textContent, trin: r.querySelector(".ladderstep")?.textContent || "" })));
t("alle 20 øvelser står der", raekker.length === 20, raekker.length);
t("hver øvelse viser krav og point", raekker.every(r => /^(3 × 30 sek\. · [2-5] point|5 minutter · 5 point) · /.test(r.trin)), raekker.filter(r => !/^(3 × 30 sek\.|5 minutter)/.test(r.trin)).map(r => r.navn));
t("grundtræningens fire står med 5 minutter",
  ["Jongleringstræning","Aflevering mod mur","Inderside med træk mod mur","8-tal mellem kegler"].every(n => raekker.find(r => r.navn === n)?.trin.startsWith("5 minutter · 5 point")));
const udstyr = await a.page.evaluate(() => [...document.querySelectorAll("#footworkArea .ladderrow")].filter(r => r.querySelector(".udstyr")).map(r => r.querySelector("b").textContent + ": " + r.querySelector(".udstyr").textContent));
t("udstyr er markeret, så barnet kan se det", JSON.stringify(udstyr.sort()) === JSON.stringify(["8-tal mellem kegler: Kræver 2 kegler","Aflevering mod mur: Kræver mur","E-rul: Kræver 2 kegler","Inderside med træk mod mur: Kræver mur"]), udstyr);

// ------------------------------------------------------------------ dagens point
console.log("\nDagens point (case 1 fra bestillingen)");
const dag = await tekst(a, "#footworkArea .exercise-block");
t("overskriften viser 41 point", /· 41 point/.test(dag), dag.slice(0, 80));
t("opdelt: 29 for øvelserne + 12 i bonus", /29\s*for øvelserne/.test(dag) && /\+\s*12\s*i bonus/.test(dag), dag.slice(0, 200));
t("bonusserne står med flueben og navn",
  /✓ 3 × L\+V-rul · \+5/.test(dag) && /✓ Én fra hvert niveau: Sålerul \+ Træk-skub \+ V-rul inderside \+ L\+V-rul · \+7/.test(dag), dag.slice(0, 400));
t("antal øvelser står i børnesprog", /7 øvelser lavet/.test(dag));

// ------------------------------------------------------------------ genberegning og tip
console.log("\nBonus genberegnes ved + og −, og tippet siger, hvad der mangler");
await a.luk();
a = await start({ [iso(0)]: { t: 1, p: 1, q: 1 } });
let d2 = await tekst(a, "#footworkArea .exercise-block");
t("uden Svær: ingen bonus, og tippet nævner Svær", /\+\s*0\s*i bonus/.test(d2) && /Tip: Lav en øvelse fra Svær - så har du én fra hvert niveau \(\+7\)/.test(d2), d2.slice(0, 300));
await a.page.click('#footworkArea .counter button[aria-label^="Tilføj en gennemførelse af Croqueta"]'); await a.page.waitForTimeout(400);
d2 = await tekst(a, "#footworkArea .exercise-block");
t("et tryk på + ved Croqueta giver +7 med det samme", /\+\s*7\s*i bonus/.test(d2) && /✓ Én fra hvert niveau/.test(d2), d2.slice(0, 300));
t("og tippet forsvinder", !/Tip:/.test(d2));
await a.page.click('#footworkArea .counter button[aria-label^="Fjern en gennemførelse af Croqueta"]'); await a.page.waitForTimeout(400);
d2 = await tekst(a, "#footworkArea .exercise-block");
t("og et tryk på − tager bonussen igen", /\+\s*0\s*i bonus/.test(d2) && !/✓/.test(d2));
const w = await a.page.evaluate(() => window.__skrivninger.filter(x => x.navn === "footwork").map(x => x.data.days));
t("databasen får kun antal - ingen point og ingen kategori", w.length === 2 && w.every(d => Object.values(d).every(dg => typeof dg === "object" || dg?.__slet)), w);

// ------------------------------------------------------------------ teksterne
console.log("\nHjælpeteksterne");
await a.page.evaluate(() => document.querySelectorAll("#footwork details").forEach(x => x.open = true)); await a.page.waitForTimeout(150);
const regler = await tekst(a, "#footworkRulesArea"), oversigt = await tekst(a, "#footworkExerciseArea"), indend = await tekst(a, "#footworkIndoorArea"), intro = await tekst(a, "#footworkIntro");
t("reglerne har de nye point", /Starter 2 · Let 3 · Mellem 4 · Svær 5 · Grundtræning 5/.test(regler));
t("og de nye tider", /3 gange i 30 sekunder/.test(regler) && /i 5 minutter/.test(regler));
t("bonusteksten har de to nye kombier", /Samme øvelse 3 gange: \+5/.test(oversigt) && /Én øvelse fra hvert niveau - Starter, Let, Mellem og Svær: \+7/.test(oversigt));
t("og siger, at grundtræning ikke tæller med i 'én fra hvert niveau'", /Grundtræning tæller ikke med her/.test(oversigt));
t("og at V-rul inderside og yderside er forskellige", /V-rul inderside og V-rul yderside er to forskellige øvelser/.test(oversigt));
t("ingen af de gamle kombier står der mere", !/Allround|\+8|\+2\b|mindst én let/.test(oversigt + regler));
t("indendørs-teksten lover ikke længere 2 × 2 meter til ALLE øvelser", /kegler eller mur skal bruge mere plads/.test(indend) && !/rigeligt til alle/.test(indend));
t("introen nævner de fire niveauer og grundtræning", /Starter, Let, Mellem og Svær - og Grundtræning/.test(intro));
await a.page.click("#tab-guide"); await a.page.waitForTimeout(200);
const guide = await a.page.evaluate(() => document.getElementById("guideFodteknik")?.innerText || "");
t("Guides beskriver de nye regler", /20 øvelser i fire niveauer/.test(guide) && /\+5/.test(guide) && /\+7/.test(guide), guide.slice(0, 120));
await a.page.click("#tab-footwork"); await a.page.waitForTimeout(150);
const side = await tekst(a, "#footwork");
t("siden bruger ikke ordene 'gennemførelse' eller 'kombi' over for barnet", !/gennemførelse|kombi/i.test(side.replace(/Tilføj en gennemførelse|Fjern en gennemførelse/g, "")),
  (side.match(/.{0,40}(gennemførelse|kombi).{0,40}/gi) || []).slice(0, 3));

// ------------------------------------------------------------------ en gammel dag
console.log("\nEn dag fra før skiftet");
await a.luk();
a = await start({ [iso(-4)]: { v: 2, o: 1, k: 1 } });
await a.page.evaluate(d => { const chip = [...document.querySelectorAll("#footworkArea .daychip")].find(c => c.getAttribute("onclick")?.includes(d)); chip?.click(); }, iso(-4));
await a.page.waitForTimeout(250);
const gl = await a.page.evaluate(() => ({ hoveder: [...document.querySelectorAll("#footworkArea .phasehead")].map(h => h.innerText.trim()), antal: document.querySelectorAll("#footworkArea .ladderrow").length,
  dag: document.querySelector("#footworkArea .exercise-block")?.innerText || "" }));
t("viser de tre gamle grader", JSON.stringify(gl.hoveder.map(h => h.toLowerCase())) === JSON.stringify(["let","mellem","svær"]), gl.hoveder);
t("og kun de tolv øvelser, der fandtes", gl.antal === 12, gl.antal);
t("og de gamle point: 2×3 + 3 + 4 + 5 (gammel kombi) = 18", /· 18 point/.test(gl.dag), gl.dag.slice(0, 120));
t("med den gamle kombi", /Dagens kombier/.test(gl.dag) && /Mellem\/svær: /.test(gl.dag), gl.dag.slice(0, 300));
t("ingen JS-fejl og ingen browserbokse", a.fejl.length === 0 && a.nativ() === 0, a.fejl);
await a.luk();

await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
