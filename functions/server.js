// Det, triggerne goer mod databasen: regn ét barns linje ud i en transaktion, og hold
// klubbens top 10 i takt. Skrives kun, naar noget ud over "opdateret" har aendret sig.
import "./tid.js";
import { FieldValue } from "firebase-admin/firestore";
import { beregnLinje, linjerEns, klubTop, topEns, POINTREGLER, CLUB_TOP_N } from "./rangliste.js";

const medId = s => (s && s.exists ? { id: s.id, ...s.data() } : null);

// Regner barnets linje ud paa ny. Inputtene laeses I transaktionen, og linjen skrives i
// den, saa to samtidige skrivninger for samme barn ikke kan efterlade en forkert linje.
// Svar: {handling: "oprettet"|"aendret"|"slettet"|"uaendret", topRoert: boolean}
export async function genberegnBarn(db, id, nu){
  if(!id || typeof id !== "string") return { handling: "uaendret", topRoert: false };
  return db.runTransaction(async tx => {
    const [spiller, stige, stigelog, fodteknik, indsendelser, linjeSnap] = await Promise.all([
      tx.get(db.collection("players").doc(id)),
      tx.get(db.collection("juggleLadder").doc(id)),
      tx.get(db.collection("juggleLog").doc(id)),
      tx.get(db.collection("footwork").doc(id)),
      tx.get(db.collection("submissions").where("playerId", "==", id)),
      tx.get(db.collection("rangliste").doc(id))
    ]);
    // Ingen await herfra og til linjen er regnet ud (se rangliste.js).
    const ny = beregnLinje({
      player: medId(spiller),
      juggleLadderDoc: medId(stige),
      juggleLogDoc: medId(stigelog),
      footworkDoc: medId(fodteknik),
      submissions: indsendelser.docs.map(medId)
    }, nu || new Date());
    const gammel = linjeSnap.exists ? linjeSnap.data() : null;
    if(linjerEns(ny, gammel)) return { handling: "uaendret", topRoert: false };
    const ref = db.collection("rangliste").doc(id);
    if(!ny) tx.delete(ref);
    else tx.set(ref, { ...ny, opdateret: FieldValue.serverTimestamp() });
    const topRoert = !ny || !gammel || ny.name !== gammel.name || ny.year !== gammel.year || ny.total !== gammel.total;
    return { handling: !ny ? "slettet" : !gammel ? "oprettet" : "aendret", topRoert };
  });
}

// klubRangliste/top ud fra linjerne. De N stoerste plus ALLE med samme total som nummer N,
// saa lige point ved graensen afgoeres efter id som i appen - uden et sammensat indeks.
export async function opdaterTop(db){
  return db.runTransaction(async tx => {
    const linjer = db.collection("rangliste");
    const foerste = await tx.get(linjer.orderBy("total", "desc").limit(CLUB_TOP_N));
    const kandidater = new Map(foerste.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    if(foerste.size === CLUB_TOP_N){
      const graense = foerste.docs[foerste.size - 1].get("total");
      (await tx.get(linjer.where("total", "==", graense))).docs.forEach(d => kandidater.set(d.id, { id: d.id, ...d.data() }));
    }
    const ref = db.collection("klubRangliste").doc("top");
    const gammel = await tx.get(ref);
    const ny = { top: klubTop([...kandidater.values()]), regler: POINTREGLER };
    if(gammel.exists && topEns(ny, gammel.data())) return false;
    tx.set(ref, { ...ny, opdateret: FieldValue.serverTimestamp() });
    return true;
  });
}

// Hele forloebet for de boern, en skrivning roerer.
export async function haandter(db, ider, logger){
  for(const id of new Set((ider || []).filter(x => typeof x === "string" && x))){
    const svar = await genberegnBarn(db, id);
    let top = false;
    if(svar.topRoert) top = await opdaterTop(db);
    logger?.info?.("rangliste", { spiller: id, handling: svar.handling, top });
  }
}
