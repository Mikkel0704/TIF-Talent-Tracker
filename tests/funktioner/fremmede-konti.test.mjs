// Vaerktoejet, der finder og sletter logins uden users-dokument
// (vaerktoej/fremmede-konti-logik.cjs), mod Auth- og Firestore-emulatoren. Koeres af
// `npm run funktioner` (se logins.test.mjs om emulatoren).
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createRequire } from "node:module";
const { domaene, find, sletFremmede, koer, MIN_ALDER_MS } = createRequire(import.meta.url)("../vaerktoej/fremmede-konti-logik.cjs");

const PROJEKT = process.env.GCLOUD_PROJECT, AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST, FS = process.env.FIRESTORE_EMULATOR_HOST;
if(!AUTH || !FS || !PROJEKT?.startsWith("demo-")) throw new Error("koeres kun i emulatoren med et demo-projekt (npm run funktioner)");
const app = initializeApp({ projectId: PROJEKT }, "fremmede");
const db = getFirestore(app), auth = getAuth(app);

let ok = 0, fejlet = 0;
const t = (n, b, ekstra) => { b ? (ok++, console.log("  ok   " + n)) : (fejlet++, console.log("  FEJL  " + n + (ekstra !== undefined ? "\n       " + JSON.stringify(ekstra) : ""))); };
const ens = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const findes = async uid => { try{ await auth.getUser(uid); return true; }catch{ return false; } };
const toem = async () => {
  await fetch(`http://${FS}/emulator/v1/projects/${PROJEKT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJEKT}/accounts`, { method: "DELETE" });
};

console.log("\nFremmede konti · e-mailens domaene");
t("kun domaenet, med smaa bogstaver", domaene("Navn.Efternavn@Firma.DK") === "@firma.dk" && domaene("a@b@gmail.com") === "@gmail.com");
t("uden e-mail", domaene(undefined) === "(ingen e-mail)" && domaene("") === "(ingen e-mail)" && domaene("ingen-snabel-a") === "(ingen e-mail)");

await toem();
// Gamle konti med kendte tidspunkter (importUsers saetter oprettelse og sidste login).
const gammel = "2026-10-01T08:00:00.000Z", sidst = "2026-10-02T09:30:00.000Z";
const imp = await auth.importUsers([
  { uid: "klub-admin",   email: "klub.admin@klubben.dk",       metadata: { creationTime: gammel, lastSignInTime: sidst } },
  { uid: "klub-spiller", email: "foraelder.hansen@gmail.com",  metadata: { creationTime: gammel, lastSignInTime: sidst } },
  { uid: "fremmed-1",    email: "Fremmed.Person@Hotmail.com",  metadata: { creationTime: gammel, lastSignInTime: sidst } },
  { uid: "fremmed-2",                                           metadata: { creationTime: gammel } },
  { uid: "efter-slettet-barn", email: "mor.jensen@outlook.dk", metadata: { creationTime: gammel, lastSignInTime: sidst } }
]);
t("(testdata: fem gamle konti importeret)", imp.successCount === 5, imp.errors);
const ny = await auth.createUser({ email: "lige.oprettet@klubben.dk", password: "hemmelig-1" });   // lige nu: kan vente paa sit dokument
await db.collection("users").doc("klub-admin").set({ email: "klub.admin@klubben.dk", role: "admin", active: true });
await db.collection("users").doc("klub-spiller").set({ email: "foraelder.hansen@gmail.com", role: "player", playerId: "p1", active: true });
await db.collection("users").doc("spoegelse").set({ email: "traener.navn@klubben.dk", role: "coach", active: true });   // intet login
const alleEmails = ["klub.admin@klubben.dk", "foraelder.hansen@gmail.com", "Fremmed.Person@Hotmail.com", "mor.jensen@outlook.dk", "lige.oprettet@klubben.dk", "traener.navn@klubben.dk"];

console.log("\nFremmede konti · find");
const f = await find(db, auth);
t("taeller logins og users-dokumenter", f.logins === 6 && f.brugere === 3, { logins: f.logins, brugere: f.brugere });
t("logins uden users-dokument: de to fremmede og login'et efter et slettet barn", ens(f.fremmede.map(l => l.uid), ["fremmed-1", "fremmed-2", "efter-slettet-barn"]), f.fremmede);
t("et login under 10 minutter gammelt staar for sig og roeres ikke", ens(f.forNye.map(l => l.uid), [ny.uid]) && MIN_ALDER_MS === 600000, f.forNye);
t("users-dokumenter uden login: spoegelset, med rolle", JSON.stringify(f.udenLogin) === '[{"uid":"spoegelse","rolle":"coach"}]', f.udenLogin);
const f1 = f.fremmede.find(l => l.uid === "fremmed-1"), f2 = f.fremmede.find(l => l.uid === "fremmed-2");
t("med oprettelse, sidste login og domaene - ikke adressen", f1 && new Date(f1.oprettet).toISOString() === gammel && new Date(f1.sidstLoggetInd).toISOString() === sidst
  && f1.domaene === "@hotmail.com" && !("email" in f1) && f2.domaene === "(ingen e-mail)", f1);

console.log("\nFremmede konti · toerkoersel");
let r = await koer(db, auth);
let tekst = r.linjer.join("\n");
t("toerkoerslen sletter intet", r.sletning === null && await findes("fremmed-1") && await findes("fremmed-2") && await findes("efter-slettet-barn"));
t("den viser login-id'er, tidspunkter og domaener", ["fremmed-1", "fremmed-2", "efter-slettet-barn", "spoegelse", "@hotmail.com", "@outlook.dk", "(ingen e-mail)", "2026-10-01 08:00", "2026-10-02 09:30", "aldrig"].every(x => tekst.includes(x)), tekst);
t("og siger, hvordan der slettes", /Koer med --slet for at slette de 3 logins/.test(tekst));
const fuldAdresse = /[^\s@()]+@[^\s@]+\.[a-z]{2,}/i;
t("udskriften rummer ingen hel e-mailadresse - heller ikke klubbens egne", !fuldAdresse.test(tekst) && !alleEmails.some(e => tekst.toLowerCase().includes(e.split("@")[0].toLowerCase())), tekst);

console.log("\nFremmede konti · --slet");
r = await koer(db, auth, { slet: true });
tekst = r.linjer.join("\n");
t("antallet skrives, foer der slettes", tekst.indexOf("Sletter 3 login(s)") > tekst.indexOf("Logins uden users-dokument: 3") && tekst.includes("slettet: 3"), tekst);
t("de tre er slettet", ens(r.sletning.slettet, ["fremmed-1", "fremmed-2", "efter-slettet-barn"]) && !(await findes("fremmed-1")) && !(await findes("fremmed-2")) && !(await findes("efter-slettet-barn")));
t("logins med users-dokument og det helt nye login er der stadig", await findes("klub-admin") && await findes("klub-spiller") && await findes(ny.uid));
t("users-dokumenter roeres ikke - heller ikke spoegelset", (await db.collection("users").get()).size === 3);
t("laest tilbage: ingen tilbage, og ok", r.ok === true && r.efter.fremmede.length === 0 && /Laest tilbage: logins i Auth: 3 · uden users-dokument: 0 · af dem slettet, men stadig der: 0/.test(tekst), tekst);
t("heller ikke denne udskrift rummer en hel e-mailadresse", !fuldAdresse.test(tekst), tekst);

console.log("\nFremmede konti · sikkerhedsnet");
await auth.importUsers([{ uid: "naesten-fremmed", email: "x@y.dk", metadata: { creationTime: gammel } }]);
await db.collection("users").doc("naesten-fremmed").set({ role: "coach", active: true });   // dokumentet kom lige efter optaellingen
const s = await sletFremmede(db, auth, ["naesten-fremmed"]);
t("faar et login sit users-dokument mellem optaelling og sletning, springes det over", ens(s.sprunget, ["naesten-fremmed"]) && !s.slettet.length && await findes("naesten-fremmed"), s);
await fetch(`http://${FS}/emulator/v1/projects/${PROJEKT}/databases/(default)/documents`, { method: "DELETE" });
r = await koer(db, auth, { slet: true });
t("findes der slet ingen users-dokumenter, slettes intet (det ligner en fejl)", r.ok === false && r.sletning === null && /STOP/.test(r.linjer.join("\n"))
  && await findes("klub-admin") && await findes("naesten-fremmed"), r.linjer);

await toem();
console.log(`\n${ok} ok, ${fejlet} fejl`);
process.exit(fejlet ? 1 : 0);
