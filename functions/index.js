// Serverberegnet rangliste. Hver skrivning paa et barns raa data regner barnets linje i
// rangliste/{id} ud paa ny og holder klubRangliste/top i takt. Point regnes med appens
// EGEN kode (genereret/pointkode.js, skaaret ud af index.html af byg.mjs).
//
// Der er med vilje INGEN trigger paa rangliste eller klubRangliste: funktionen kan
// aldrig udloese sig selv. Og ingen planlagt koersel: en linje, hvis uge.fra/maaned.fra
// ikke er den aktuelle uge/maaned, laeses som 0 point i perioden.
import "./tid.js";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { haandter } from "./server.js";

// Funktionerne koerer i europe-west1. Selve Eventarc-triggeren skal ligge, hvor databasen
// ligger (eur3); den saetter firebase deploy selv ud fra databasens placering.
setGlobalOptions({ region: "europe-west1", memory: "256MiB", timeoutSeconds: 60, maxInstances: 3 });

let db = null;
const hentDb = () => db || (db = getFirestore(getApps()[0] || initializeApp()));

const id = (snap, felt) => (snap && snap.exists ? snap.get(felt) : null);
const paaBarn = samling => onDocumentWritten(`${samling}/{id}`, event => haandter(hentDb(), [event.params.id], logger));

export const ranglisteSpiller = paaBarn("players");
export const ranglisteStige = paaBarn("juggleLadder");
export const ranglisteStigelog = paaBarn("juggleLog");
export const ranglisteFodteknik = paaBarn("footwork");
// En indsendelse kan flytte fra ét barn til et andet; begge regnes ud.
export const ranglisteIndsendelse = onDocumentWritten("submissions/{id}", event =>
  haandter(hentDb(), [id(event.data?.before, "playerId"), id(event.data?.after, "playerId")], logger));
