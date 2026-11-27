// "Slet alt" om et barn sker paa serveren (sletSpiller), ikke i browseren. HELE index.html
// startes uaendret mod efterligningen i stoette/firebase-stedfortraeder.js, som husker hvert
// kald til en kaldbar funktion i window.__kald og svarer, som testen beder om. Her proeves,
// at dialogen viser serverens tal og e-mails, at navnet skal skrives, hvad der sendes
// (foerst kunOpgoer, saa navn), slutbeskeden med og uden fejl - og at siden ikke selv slaar
// indsendelser, dueller, logins eller videolinks op eller sletter noget.
// Det, serveren goer, proeves mod emulatoren i tests/funktioner/sletning.test.mjs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const stedfortraeder = readFileSync(new URL("./stoette/firebase-stedfortraeder.js", import.meta.url), "utf8");
const PRIVACY = /const PRIVACY_VERSION = "([^"]+)"/.exec(html)[1];

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("\nSlet spiller · koden");
const fra = html.indexOf("async function deletePlayer(");
const kilde = html.slice(fra, html.indexOf("\nfunction ", fra));
t("deletePlayer kalder serveren og slaar intet op selv (ingen getDocs, query eller collection)",
  kilde.includes("sletSpillerPaaServeren") && !/getDocs|query\(|collection\(|deleteDoc|deleteObject|setDoc/.test(kilde));
t("getDocs hentes slet ikke laengere fra Firestore-SDK'et (den eneste bruger var den gamle sletning)", !/import \{[^}]*\bgetDocs\b[^}]*\} from "https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-firestore\.js"/.test(html));
t("den gamle besked om at slette login'et i Firebase Console er vaek", !/TILBAGE AT GØRE I HÅNDEN|Firebase Console under Authentication/.test(html));
t("kaldet hedder sletSpiller i europe-west1-klienten", /httpsCallable\(functions, "sletSpiller"\)/.test(html));
t("databehandlingsteksten: login'et slettes i samme handling, ikke i et separat trin",
  !/fjernes i et separat trin/.test(html) && /Login'et forsvinder i samme handling/.test(html)
  && /én samlet handling/.test(html) && /starter ikke af sig selv/.test(html) && /senest 30 dage/.test(html));

const ok_ = { active: true, mustChangePassword: false, privacyAcceptedAt: new Date().toISOString(), privacyVersion: PRIVACY };
const data = () => ({
  users: {
    "u-admin": { email: "admin@x.invalid", role: "admin", years: ["2017"], ...ok_ },
    "u-ida":   { email: "ida@x.invalid", role: "player", playerId: "p2", years: ["2017"], ...ok_ }
  },
  players: {
    p1: { name: "Oscar Test", year: "2017", gender: "dreng", points: 40, passed: {}, history: [] },
    p2: { name: "Ida Test",   year: "2017", gender: "pige",  points: 10, passed: {}, history: [], hasActiveLogin: true }
  },
  deletionRequests: { p2: { playerId: "p2", playerName: "Ida Test", year: "2017", requestedBy: "ida@x.invalid", status: "pending", reason: "flytter" } }
});
// Serverens opgoerelse. Tallene er med vilje nogle, siden ikke selv kan kende.
const OPGOER = { playerId: "p2", findes: true, navn: "Ida Test", aargang: "2017", indsendelser: 3, udfordringer: 1, videodokumenter: 2, videofiler: 4,
  kaaringer: 1, topscorerKaaringer: 2, logins: [{ uid: "u-ida", email: "ida@x.invalid" }, { uid: "u-demo", email: "demo@x.invalid" }],
  note: true, stige: true, stigelog: true, fodteknik: true, fodtekniklog: true, klubRangliste: true, rangliste: true, anmodning: true };
const ALT_SLETTET = { playerId: "p2", faerdig: true, fejl: [], slettet: { videofiler: 4, videodokumenter: 2, indsendelser: 3, udfordringer: 1, kaaringer: 1, topscorerKaaringer: 2,
  klubRangliste: 1, note: 1, stige: 1, stigelog: 1, fodteknik: 1, fodtekniklog: 1, logins: 2, brugerdokumenter: 2, spiller: 1, rangliste: 1, anmodning: 1 } };
const SPOERG = "Slet ALT om Ida Test (2017)?\n\nDette fjerner for altid:\n"
  + "· Profilen med point, niveauer, medaljer, note og historik\n"
  + "· Jongleringsstigen og Daglig fodteknik med alle registreringer og logge\n"
  + "· 3 indsendte videoer og deres data\n"
  + "· 1 udfordring med Ida Test\n"
  + "· 4 videofiler i skyen\n"
  + "· Pladsen på klub-ranglisten\n"
  + "· 1 kåring som Månedens spiller\n"
  + "· 2 kåringer som Månedens topscorer\n"
  + "· Adgangen for ida@x.invalid, demo@x.invalid\n"
  + "\nDet kan ikke fortrydes.";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const fejl = []; let nativ = 0;
page.on("pageerror", e => fejl.push(e.message));
// Fejl, testen selv lader serveren give, skriver appen i konsollen - de er ventede.
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|firebasejs\/12\.13\.0\/firebase-functions\.js|^Error: |^Object$|JSHandle@error/.test(m.text())) fejl.push(m.text()); });
page.on("dialog", async d => { nativ++; await d.dismiss(); });
await page.route("**/*", route => {
  const u = route.request().url();
  if (u === "https://app.test/") return route.fulfill({ contentType: "text/html", body: html });
  if (u.startsWith("https://www.gstatic.com/firebasejs/")) return route.fulfill({ contentType: "application/javascript", body: stedfortraeder });
  return route.abort();
});
const d = data();
await page.addInitScript(([db, bruger]) => { window.__db = db; window.__bruger = bruger; window.__skrivninger = []; window.__kald = []; window.__hent = []; },
  [d, { uid: "u-admin", email: d.users["u-admin"].email }]);
await page.goto("https://app.test/");
await page.waitForFunction(() => !document.getElementById("mainNav").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(300);

const dialogTekst = () => page.evaluate(() => { const x = document.getElementById("appDialog");
  return x && !x.classList.contains("hidden") ? document.getElementById("dialogTekst").textContent : null; });
const svar = async ja => { await page.click(ja ? "#dialogJa" : "#dialogNej"); await page.waitForTimeout(250); };
const skriv = async navn => { await page.fill("#dialogInput", navn); await page.click("#dialogJa"); await page.waitForTimeout(400); };
const kald = () => page.evaluate(() => window.__kald.map(k => [k.navn, k.data]));
const nulstil = svarListe => page.evaluate(s => { window.__kald.length = 0; window.__skrivninger.length = 0; window.__hent.length = 0; window.__svar = { sletSpiller: s }; }, svarListe);
const klikSletAlt = async () => {
  await page.click("#tab-players"); await page.waitForTimeout(150);
  await page.evaluate(() => [...document.querySelectorAll("#playerList button.danger")].find(b => b.getAttribute("onclick") === "deletePlayer('p2')").click());
  await page.waitForTimeout(400);
};
const ingenEgneSkridt = async () => {
  const w = await page.evaluate(() => window.__skrivninger), h = await page.evaluate(() => window.__hent);
  return !w.length && !h.some(x => ["submissions", "challenges", "users", "submissionVideos"].includes(x.navn)) ? true : { w, h };
};

console.log("\nSlet spiller · dialogen bygges af serverens opgoerelse");
await nulstil([{ data: OPGOER }, { data: ALT_SLETTET }]);
await klikSletAlt();
t("foerste kald er opgoerelsen: {playerId, kunOpgoer: true}", ens(await kald(), [["sletSpiller", { playerId: "p2", kunOpgoer: true }]]), await kald());
t("dialogen viser serverens tal og begge e-mails - samme tekst som foer", (await dialogTekst()) === SPOERG, await dialogTekst());
await svar(false);
t("Annullér: intet mere sendes", (await kald()).length === 1 && (await dialogTekst()) === null);

console.log("\nSlet spiller · navnet skal skrives");
await nulstil([{ data: OPGOER }, { data: ALT_SLETTET }]);
await klikSletAlt(); await svar(true);
t("efter Fortsæt beder appen om navnet", /^Skriv spillerens navn for at bekræfte:\n\nIda Test$/.test(await dialogTekst() || ""), await dialogTekst());
await skriv("Ida");
t("et forkert navn: 'Navnet passede ikke. Intet er slettet.' - og serveren faar ingen sletning", (await dialogTekst()) === "Navnet passede ikke. Intet er slettet."
  && (await kald()).length === 1, await kald());
await svar(true);

console.log("\nSlet spiller · alt lykkes");
await nulstil([{ data: OPGOER }, { data: ALT_SLETTET }]);
await klikSletAlt(); await svar(true); await skriv("  Ida Test ");
t("andet kald er sletningen med det skrevne navn (trimmet)", ens(await kald(), [["sletSpiller", { playerId: "p2", kunOpgoer: true }], ["sletSpiller", { playerId: "p2", navn: "Ida Test" }]]), await kald());
t("slutbeskeden siger, at alt er slettet - ogsaa login'ene - og intet om at goere noget i haanden",
  (await dialogTekst()) === "Alt om Ida Test er slettet.\n\nLogin'ene er også slettet, så e-mailadresserne kan bruges igen:\nida@x.invalid\ndemo@x.invalid", await dialogTekst());
t("siden har hverken skrevet, slettet eller slaaet indsendelser, dueller, logins eller videolinks op", await ingenEgneSkridt());
await svar(true);

await nulstil([{ data: { ...OPGOER, logins: [{ uid: "u-ida", email: "ida@x.invalid" }], kaaringer: 0, topscorerKaaringer: 0 } }, { data: ALT_SLETTET }]);
await klikSletAlt();
const tekst1 = await dialogTekst() || "";
t("ét login og ingen kaaringer: entals-form, ingen kaaringslinje", tekst1.includes("· Adgangen for ida@x.invalid\n") && !tekst1.includes("Månedens spiller") && !tekst1.includes("Månedens topscorer"), tekst1);
await svar(true); await skriv("Ida Test");
t("og slutbeskeden i ental", (await dialogTekst()) === "Alt om Ida Test er slettet.\n\nLogin'et er også slettet, så e-mailen kan bruges igen:\nida@x.invalid", await dialogTekst());
await svar(true);

await nulstil([{ data: { ...OPGOER, logins: [], indsendelser: 1, udfordringer: 0, videofiler: 1, kaaringer: 0, topscorerKaaringer: 1 } }, { data: ALT_SLETTET }]);
await klikSletAlt();
const tekst2 = await dialogTekst() || "";
t("én topscorer-kåring og ingen som Månedens spiller: kun topscorer-linjen, i ental",
  tekst2.includes("· 1 kåring som Månedens topscorer\n") && !tekst2.includes("som Månedens spiller"), tekst2);
t("intet login: 'Ingen login knyttet til spilleren', og tallene i ental", tekst2.includes("· Ingen login knyttet til spilleren\n")
  && tekst2.includes("· 1 indsendte video og deres data\n") && tekst2.includes("· 0 udfordringer med Ida Test\n") && tekst2.includes("· 1 videofil i skyen\n"), tekst2);
await svar(true); await skriv("Ida Test");
t("og slutbeskeden naevner ingen logins", (await dialogTekst()) === "Alt om Ida Test er slettet.", await dialogTekst());
await svar(true);

console.log("\nSlet spiller · noget fejlede");
await nulstil([{ data: OPGOER }, { data: { playerId: "p2", faerdig: false, slettet: { videofiler: 3 },
  fejl: [{ art: "videofil", id: "submissions/u-ida/123_klip.mp4" }, { art: "login", id: "u-demo" }, { art: "indsendelse", id: "sub9" }, { art: "kaaring", id: "2026-10_2017" },
    { art: "topscorer", id: "2026-11_2017" }] } }]);
await klikSletAlt(); await svar(true); await skriv("Ida Test");
t("fejlene staar der med filnavn, e-mail og id - og at en ny 'Slet alt' goer resten",
  (await dialogTekst()) === "ADVARSEL: 5 ting kunne ikke slettes:\n· videofil 123_klip.mp4\n· login demo@x.invalid\n· indsendelse sub9\n· Månedens spiller 2026-10_2017\n· Månedens topscorer 2026-11_2017\n\n"
    + "Resten er slettet, og adgangen til appen er lukket. Ida Test står stadig på listen, indtil alt er væk. Tryk \"Slet alt\" igen - så gør serveren resten.", await dialogTekst());
await svar(true);
await nulstil([{ data: OPGOER }, { data: { playerId: "p2", faerdig: false, slettet: {}, fejl: [{ art: "adgang", id: "u-ida" }, { art: "spiller", id: "p2" }] } }]);
await klikSletAlt(); await svar(true); await skriv("Ida Test");
t("lukkede adgangen ikke, siger beskeden det ikke; spilleren selv uden id",
  (await dialogTekst()) === "ADVARSEL: 2 ting kunne ikke slettes:\n· lukning af adgangen ida@x.invalid\n· selve spilleren\n\n"
    + "Resten er slettet. Ida Test står stadig på listen, indtil alt er væk. Tryk \"Slet alt\" igen - så gør serveren resten.", await dialogTekst());
await svar(true);

console.log("\nSlet spiller · serveren svarer med en fejl");
await nulstil([{ fejl: { code: "internal", message: "Serveren kunne ikke læse alt om spilleren. Intet er slettet. Prøv igen om lidt." } }]);
await klikSletAlt();
t("opgoerelsen fejler: serverens besked, og intet mere sendes",
  (await dialogTekst()) === "Kunne ikke gøre op, hvad der skal slettes: Serveren kunne ikke læse alt om spilleren. Intet er slettet. Prøv igen om lidt." && (await kald()).length === 1, await dialogTekst());
await svar(true);
await nulstil([{ fejl: { code: "unavailable", message: "unavailable" } }]);
await klikSletAlt();
t("uden forbindelse: appens egen besked og 'Intet er slettet'",
  (await dialogTekst()) === "Kunne ikke gøre op, hvad der skal slettes: Ingen forbindelse til serveren. Tjek internetforbindelsen, og prøv igen.\n\nIntet er slettet. Prøv igen." && (await kald()).length === 1, await dialogTekst());
await svar(true);
await nulstil([{ data: OPGOER }, { fejl: { code: "internal", message: "Serveren kunne ikke læse alt om spilleren. Intet er slettet. Prøv igen om lidt." } }]);
await klikSletAlt(); await svar(true); await skriv("Ida Test");
t("fejler serverens opgoerelse foer sletningen, opfordres der ikke til at koere igen 'for at goere resten'",
  (await dialogTekst()) === "Kunne ikke slette: Serveren kunne ikke læse alt om spilleren. Intet er slettet. Prøv igen om lidt.", await dialogTekst());
await svar(true);
await nulstil([{ data: OPGOER }, { fejl: { code: "failed-precondition", message: "Navnet passede ikke. Intet er slettet." } }]);
await klikSletAlt(); await svar(true); await skriv("Ida Test");
t("serveren afviser navnet: dens besked vises, som den er", (await dialogTekst()) === "Kunne ikke slette: Navnet passede ikke. Intet er slettet.", await dialogTekst());
await svar(true);
await nulstil([{ data: OPGOER }, { fejl: { code: "deadline-exceeded", message: "deadline-exceeded" } }]);
await klikSletAlt(); await svar(true); await skriv("Ida Test");
t("forbindelsen svigter midt i: admin faar at vide, at en ny 'Slet alt' goer resten",
  (await dialogTekst()) === "Kunne ikke slette: Ingen forbindelse til serveren. Tjek internetforbindelsen, og prøv igen.\n\nNåede noget at blive slettet, så tryk \"Slet alt\" igen - så gør serveren resten.", await dialogTekst());
await svar(true);
t("statuslinjen er tilbage paa v15.84 · live database aktiv", await page.evaluate(() => document.getElementById("syncStatus").textContent) === "v15.84 · live database aktiv");

console.log("\nSlet spiller · Godkend og slet alt");
await nulstil([{ data: OPGOER }, { data: ALT_SLETTET }]);
await page.click("#tab-admin"); await page.waitForTimeout(150);
await page.evaluate(() => { document.getElementById("adminRequests").open = true; });
const knap = await page.$('#deletionRequestsArea button:has-text("Godkend og slet alt")');
t("anmodningen staar under Admin med knappen", !!knap);
await knap?.click(); await page.waitForTimeout(400);
t("knappen gaar gennem samme sletning: opgoerelsen foerst, samme dialog", ens(await kald(), [["sletSpiller", { playerId: "p2", kunOpgoer: true }]]) && (await dialogTekst()) === SPOERG, await kald());
await svar(true); await skriv("Ida Test");
t("og sletningen bagefter", ens((await kald())[1], ["sletSpiller", { playerId: "p2", navn: "Ida Test" }]) && /^Alt om Ida Test er slettet\./.test(await dialogTekst() || ""), await kald());
t("heller ikke her har siden selv skrevet eller slaaet op", await ingenEgneSkridt());
await svar(true);

t("browserens egne bokse blev aldrig brugt", nativ === 0);
t("ingen fejl i siden", fejl.length === 0, fejl.slice(0, 4));
await browser.close();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
