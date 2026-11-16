// Vaerktoejet, der lukker for selvoprettelse (vaerktoej/luk-selvoprettelse-logik.cjs), mod
// Auth-emulatoren. Koeres af `npm run funktioner` (se logins.test.mjs om emulatoren).
//
// Emulatoren gemmer indstillingen client.permissions.disabledUserSignup, men HAANDHAEVER den
// ikke: en oprettelse lykkes stadig. Det goer den til den rigtige proeve af vaerktoejets
// vigtigste sikkerhedsnet - at en oprettelse, der mod forventning lykkes, bliver opdaget,
// slettet igen og meldt som en fejl. Googles rigtige afvisning (ADMIN_ONLY_OPERATION)
// efterlignes med et svar i samme form.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { adresser, laesIndstilling, koer, fejlkodeAf } = createRequire(import.meta.url)("../vaerktoej/luk-selvoprettelse-logik.cjs");

const PROJEKT = process.env.GCLOUD_PROJECT, AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!AUTH || !PROJEKT?.startsWith("demo-")) throw new Error("koeres kun i emulatoren med et demo-projekt (npm run funktioner)");
const auth = getAuth(initializeApp({ projectId: PROJEKT }, "selvoprettelse"));

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };

const adr = adresser({ projekt: PROJEKT, emulator: AUTH });
const kaldLog = [];
// Med projektets noegle - i emulatoren er det "Bearer owner".
const kald = async (url, { method = "GET", body } = {}) => {
  kaldLog.push({ url, method });
  const r = await fetch(url, { method, body, headers: { authorization: "Bearer owner", "content-type": "application/json" } });
  return { status: r.status, tekst: await r.text() };
};
const saet = async (maske, data) => kald(adr.konfig + "?updateMask=" + maske, { method: "PATCH", body: JSON.stringify(data) });
const antal = async () => (await auth.listUsers(1000)).users.length;
const sletBruger = uid => auth.deleteUser(uid);
const API_NOEGLE = /apiKey:\s*"([^"]+)"/.exec(readFileSync(new URL("../../index.html", import.meta.url), "utf8"))[1];
const REFERER = "https://mikkel0704.github.io/TIF-Talent-Tracker/";
const patches = () => kaldLog.filter(k => k.method === "PATCH").length;
// Et svar, som Google giver det, naar selvoprettelsen er lukket.
const googleSvar = (status, besked) => async (url, valg) => { googleSvar.sidst = { url, ...valg };
  return { ok: status === 200, status, text: async () => JSON.stringify({ error: { code: status, message: besked, errors: [{ message: besked, domain: "global", reason: "invalid" }] } }) }; };

await fetch(`http://${AUTH}/emulator/v1/projects/${PROJEKT}/accounts`, { method: "DELETE" });
await saet("client.permissions.disabledUserSignup", { client: { permissions: { disabledUserSignup: false } } });

console.log("\nLuk selvoprettelse · adresserne");
const prod = adresser({ projekt: "tif-talent-tracker" });
t("Auth-konfigurationen hentes fra Identity Toolkit admin v2", prod.konfig === "https://identitytoolkit.googleapis.com/admin/v2/projects/tif-talent-tracker/config");
t("beviset bruger den offentlige oprettelse (accounts:signUp) med noeglen fra index.html",
  prod.signUp(API_NOEGLE) === "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + API_NOEGLE && API_NOEGLE.startsWith("AIza"));
t("fejlkoden laeses ud af Googles svar", fejlkodeAf('{"error":{"message":"ADMIN_ONLY_OPERATION"}}') === "ADMIN_ONLY_OPERATION"
  && fejlkodeAf('{"error":{"message":"WEAK_PASSWORD : Password should be at least 6 characters"}}') === "WEAK_PASSWORD" && fejlkodeAf("ikke json") === null);

console.log("\nLuk selvoprettelse · et projekt uden Identity Platform");
let i = await laesIndstilling(kald, adr);
t("laest: aaben, og ingen Identity Platform (emulatoren oplyser ingen subtype)", i.aaben === true && i.identityPlatform === false, i);
let foer = await antal(), p = patches();
let r = await koer({ kald, hent: fetch, adr, apiNoegle: API_NOEGLE, referer: REFERER, sletBruger });
t("--tjek: siger AABEN, aendrer intet og opretter intet", r.ok === false && /AABEN/.test(r.linjer.join("\n")) && patches() === p && await antal() === foer && !r.bevis, r.linjer);
r = await koer({ udfoer: true, kald, hent: fetch, adr, apiNoegle: API_NOEGLE, referer: REFERER, sletBruger });
t("--udfoer stopper med en dansk besked om Identity Platform og gaetter ikke",
  r.stop === "ikke-identity-platform" && r.ok === false && /STOP/.test(r.linjer.join("\n")) && /Identity Platform/.test(r.linjer.join("\n")), r.linjer);
t("og har intet aendret og intet oprettet", patches() === p && (await laesIndstilling(kald, adr)).aaben === true && await antal() === foer && !r.bevis);

console.log("\nLuk selvoprettelse · et projekt med Identity Platform");
await saet("subtype", { subtype: "IDENTITY_PLATFORM" });
i = await laesIndstilling(kald, adr);
t("laest: aaben, Identity Platform", i.aaben === true && i.identityPlatform === true, i);
foer = await antal(); p = patches();
r = await koer({ udfoer: true, kald, hent: fetch, adr, apiNoegle: API_NOEGLE, referer: REFERER, sletBruger });
t("--udfoer gemmer indstillingen med netop ét PATCH paa client.permissions.disabledUserSignup",
  r.lukket === true && patches() === p + 1 && kaldLog.filter(k => k.method === "PATCH").at(-1).url.endsWith("?updateMask=client.permissions.disabledUserSignup"));
t("og laeser den tilbage: LUKKET", r.efter?.aaben === false && /Laest tilbage: LUKKET/.test(r.linjer.join("\n")), r.linjer);
t("emulatoren haandhaever den ikke, saa beviset LYKKES at oprette en konto - og det opdages",
  r.bevis?.udfald === "oprettet" && typeof r.bevis.uid === "string" && r.ok === false && /FEJL: en fremmed KAN stadig oprette/.test(r.linjer.join("\n")), r);
t("proevekontoen er slettet igen med det samme", r.bevis?.slettet === true && await antal() === foer);
t("udskriften naevner ikke proevekontoens e-mail", !/@/.test(r.linjer.join("\n")), r.linjer);

console.log("\nLuk selvoprettelse · Googles afvisning");
p = patches();
r = await koer({ udfoer: true, kald, hent: googleSvar(400, "ADMIN_ONLY_OPERATION"), adr, apiNoegle: API_NOEGLE, referer: REFERER, sletBruger });
t("er der allerede lukket, skrives intet igen", r.lukket === false && patches() === p);
t("ADMIN_ONLY_OPERATION er beviset: ok", r.ok === true && r.bevis?.udfald === "afvist" && /AFVIST/.test(r.linjer.join("\n")), r.linjer);
const sendt = googleSvar.sidst;
const krop = JSON.parse(sendt.body);
t("beviset sendes som en fremmed: POST med den offentlige noegle, appens adresse som Referer og UDEN projektets noegle",
  sendt.method === "POST" && sendt.url === adr.signUp(API_NOEGLE) && sendt.headers.referer === REFERER && sendt.headers.origin === "https://mikkel0704.github.io"
  && !("authorization" in sendt.headers), sendt.headers);
t("med en engangsadresse paa et domaene, der ikke findes, og en tilfaeldig kode",
  /^selvoprettelse-proeve-\d+-[a-z0-9]+@tif-talent-tracker\.invalid$/.test(krop.email) && krop.password.length >= 12, krop.email);
r = await koer({ udfoer: true, kald, hent: googleSvar(400, "OPERATION_NOT_ALLOWED : Password sign-in is disabled for this project."), adr, apiNoegle: API_NOEGLE, referer: REFERER, sletBruger });
t("en anden afvisning (fx OPERATION_NOT_ALLOWED) beviser ikke noget: uafklaret og ikke ok",
  r.ok === false && r.bevis?.udfald === "uafklaret" && r.bevis.kode === "OPERATION_NOT_ALLOWED" && /Uafklaret/.test(r.linjer.join("\n")), r);
r = await koer({ udfoer: true, kald, hent: googleSvar(403, "API_KEY_HTTP_REFERRER_BLOCKED"), adr, apiNoegle: API_NOEGLE, referer: REFERER, sletBruger });
t("ogsaa en noegle, der er spaerret for adressen", r.ok === false && r.bevis?.udfald === "uafklaret");
p = patches();
r = await koer({ bevis: true, kald, hent: googleSvar(400, "ADMIN_ONLY_OPERATION"), adr, apiNoegle: API_NOEGLE, referer: REFERER, sletBruger });
t("--bevis alene: proever, men skriver intet i konfigurationen", r.ok === true && patches() === p);
r = await koer({ kald, hent: googleSvar(400, "ADMIN_ONLY_OPERATION"), adr, apiNoegle: API_NOEGLE, referer: REFERER, sletBruger });
t("--tjek, naar der er lukket: ok uden at proeve", r.ok === true && !r.bevis && /LUKKET/.test(r.linjer[0]));

console.log("\nLuk selvoprettelse · naar sletningen af en proevekonto slaar fejl");
foer = await antal();
r = await koer({ bevis: true, kald, hent: fetch, adr, apiNoegle: API_NOEGLE, referer: REFERER, sletBruger: async () => { throw new Error("nej"); } });
t("meldes det tydeligt, og vaerktoejet er ikke ok", r.ok === false && r.bevis?.slettet === false && /kunne IKKE slettes/.test(r.linjer.join("\n")), r.linjer);
if(r.bevis?.uid) await auth.deleteUser(r.bevis.uid);
t("(oprydning: kontoen er vaek igen)", await antal() === foer);

console.log("\nLuk selvoprettelse · uden adgang");
let kastet = null;
try{ await koer({ kald: async () => ({ status: 403, tekst: '{"error":{"message":"PERMISSION_DENIED"}}' }), hent: fetch, adr, apiNoegle: API_NOEGLE, sletBruger }); }catch(e){ kastet = e; }
t("kan konfigurationen ikke laeses, stopper vaerktoejet med HTTP-status og kode", kastet?.status === 403 && /PERMISSION_DENIED/.test(kastet.message), kastet?.message);

await saet("client.permissions.disabledUserSignup", { client: { permissions: { disabledUserSignup: false } } });
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
