// Hvem faar og mister maerket "admin" paa loginnet. Ren logik - ingen noegle, intet netvaerk.
import { createRequire } from "node:module";
const { planlaegAdminMaerker, nyeMaerker } = createRequire(import.meta.url)("../vaerktoej/admin-maerke-logik.cjs");

let ok = 0, fejl = 0;
const t = (n, b) => { b ? (ok++, console.log("  ok   " + n)) : (fejl++, console.log("  FEJL  " + n)); };
const ens = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const brugere = [
  { uid: "a-ny",      role: "admin",  active: true },
  { uid: "a-har",     role: "admin" },                    // intet active-felt = aktiv
  { uid: "a-lukket",  role: "admin",  active: false },
  { uid: "a-uden",    role: "admin",  active: true },     // intet login
  { uid: "t-foer",    role: "coach",  active: true },     // var administrator engang
  { uid: "t-alm",     role: "coach",  active: true },
  { uid: "s-alm",     role: "player", active: true }
];
const logins = [
  { uid: "a-ny",     claims: {} },
  { uid: "a-har",    claims: { admin: true } },
  { uid: "a-lukket", claims: { admin: true } },
  { uid: "t-foer",   claims: { admin: true, andet: 1 } },
  { uid: "t-alm",    claims: undefined },
  { uid: "s-alm",    claims: { admin: "true" } },         // forkert vaerdi, skal vaek
  { uid: "slettet",  claims: { admin: true } }            // login uden bruger i appen
];
const p = planlaegAdminMaerker(brugere, logins);
console.log("\nAdmin-mærket");
t("en ny, aktiv administrator får mærket", ens(p.saet, ["a-ny"]));
t("den, der har det, røres ikke", ens(p.uaendret, ["a-har"]));
t("en deaktiveret administrator, en tidligere administrator, et forkert mærke og et login uden bruger mister det",
  ens(p.fjern, ["a-lukket", "t-foer", "s-alm", "slettet"]));
t("en administrator uden login meldes, men får intet sat", ens(p.mangler, ["a-uden"]));
t("en almindelig træner uden mærke står ingen steder", ![...p.saet, ...p.fjern, ...p.uaendret, ...p.mangler].includes("t-alm"));

const q = planlaegAdminMaerker(brugere, logins.map(l => l.uid === "a-ny" ? { uid: l.uid, claims: { admin: true } } : l)
  .filter(l => !["a-lukket", "t-foer", "s-alm", "slettet"].includes(l.uid)));
t("en ny kørsel bagefter finder intet at gøre", q.saet.length === 0 && q.fjern.length === 0);

t("andre mærker på loginnet bevares, når mærket sættes", JSON.stringify(nyeMaerker({ andet: 1 }, true)) === JSON.stringify({ andet: 1, admin: true }));
t("og når det fjernes", JSON.stringify(nyeMaerker({ andet: 1, admin: true }, false)) === JSON.stringify({ andet: 1 }));
t("et login helt uden mærker kan få det", JSON.stringify(nyeMaerker(undefined, true)) === JSON.stringify({ admin: true }));
t("ingen brugere og ingen logins giver en tom plan", (() => { const x = planlaegAdminMaerker([], []); return !x.saet.length && !x.fjern.length && !x.mangler.length; })());

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
