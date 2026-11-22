// Serverberegnet rangliste. Hver skrivning paa et barns raa data regner barnets linje i
// rangliste/{id} ud paa ny og holder klubRangliste/top i takt. Point regnes med appens
// EGEN kode (genereret/pointkode.js, skaaret ud af index.html af byg.mjs).
//
// Der er med vilje INGEN trigger paa rangliste eller klubRangliste: funktionen kan
// aldrig udloese sig selv. Og ingen planlagt koersel af ranglisten: en linje, hvis
// uge.fra/maaned.fra ikke er den aktuelle uge/maaned, laeses som 0 point i perioden.
//
// Den ene planlagte funktion er maanedensKaaring: Maanedens spiller og Maanedens topscorer
// afgoeres af serveren den 5. kl. 05 dansk tid i stedet for at vente paa, at en admin
// aabner appen. Samme koersel rydder hver morgen op i joker-begrundelser og videoer
// (oprydning.js).
//
// Tre kaldbare funktioner. opretLogin og sletLogin: logins oprettes og slettes af serveren,
// saa Firebase Authentications aabne selvoprettelse kan lukkes (se logins.js). sletSpiller:
// "Slet alt" om et barn - dokumenter, videofiler og login'ene i ét hug (se sletning.js).
import "./tid.js";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { haandter, kaarMaanedensSpiller } from "./server.js";
import * as logins from "./logins.js";
import * as sletning from "./sletning.js";
import { rydOp } from "./oprydning.js";

// Funktionerne koerer i europe-west1. Selve Eventarc-triggeren skal ligge, hvor databasen
// ligger (eur3); den saetter firebase deploy selv ud fra databasens placering.
setGlobalOptions({ region: "europe-west1", memory: "256MiB", timeoutSeconds: 60, maxInstances: 3 });

let db = null;
const app = () => getApps()[0] || initializeApp();
const hentDb = () => db || (db = getFirestore(app()));

const id = (snap, felt) => (snap && snap.exists ? snap.get(felt) : null);
const paaBarn = samling => onDocumentWritten(`${samling}/{id}`, event => haandter(hentDb(), [event.params.id], logger));

export const ranglisteSpiller = paaBarn("players");
export const ranglisteStige = paaBarn("juggleLadder");
export const ranglisteStigelog = paaBarn("juggleLog");
export const ranglisteFodteknik = paaBarn("footwork");
// En indsendelse kan flytte fra ét barn til et andet; begge regnes ud.
export const ranglisteIndsendelse = onDocumentWritten("submissions/{id}", event =>
  haandter(hentDb(), [id(event.data?.before, "playerId"), id(event.data?.after, "playerId")], logger));

// Maanedens spiller og Maanedens topscorer. Hver dag kl. 05:00 dansk tid - med vilje hver dag: koerslen goer intet,
// der allerede er gjort (create() overskriver aldrig), saa slaar koerslen den 5. fejl, tager
// naeste morgen den. Paa alle andre dage finder den intet at kaare og skriver intet.
// Bagefter morgenoprydningen (oprydning.js): joker-begrundelser 3 doegn efter afgoerelsen og
// videoer efter appens regler. Oprydningen kaster aldrig - en fejl dér logges og vaelter
// ikke kaaringen - og den koerer, ogsaa hvis kaaringen fejlede.
// Ingen genforsoeg ud over standarden.
export const maanedensKaaring = onSchedule({ schedule: "0 5 * * *", timeZone: "Europe/Copenhagen" }, async () => {
  const nu = new Date();
  let svar = null, kaaringFejl = null;
  try{ svar = await kaarMaanedensSpiller(hentDb(), nu, logger); }
  catch(e){ kaaringFejl = e; }
  await rydOp({ db: hentDb(), bucket: getStorage(app()).bucket(sletning.VIDEO_BOETTE), FieldValue, logger }, nu);
  if(kaaringFejl) throw kaaringFejl;
  const fejlet = [...svar.fejlet.map(id => "maanedensSpiller/" + id), ...svar.topscorer.fejlet.map(id => "maanedensTopscorer/" + id)];
  if(fejlet.length) throw new Error("maanedensKaaring: " + fejlet.length + " kaaring(er) blev ikke gemt: " + fejlet.join(", "));
});

// Logins. Kaldes fra appen med httpsCallable (region europe-west1). Hvem der maa, afgoeres
// inde i funktionen (en aktiv administrator, laest i users) - firebase deploy goer altid en
// kaldbar funktion offentligt kaldbar, saa det er funktionen selv, der skal sige nej.
// App Check haandhaeves som paa Firestore og Storage: et kald uden et gyldigt App Check-bevis
// fra appens egen side afvises, foer koden koerer.
const LOGIN_VALG = { enforceAppCheck: true };
const deps = () => ({ db: hentDb(), adminAuth: getAuth(app()), FieldValue, logger });
export const opretLogin = onCall(LOGIN_VALG, request => logins.opretLogin(deps(), request.auth, request.data));
export const sletLogin = onCall(LOGIN_VALG, request => logins.sletLogin(deps(), request.auth, request.data));
// Slet alt om ét barn. Samme valg og samme administratortjek som login-funktionerne.
// Videoerne ligger i appens egen boette (VIDEO_BOETTE), ikke i projektets standardboette.
export const sletSpiller = onCall(LOGIN_VALG, request =>
  sletning.sletSpiller({ ...deps(), bucket: getStorage(app()).bucket(sletning.VIDEO_BOETTE) }, request.auth, request.data));
