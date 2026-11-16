// Det, funktionerne goer mod databasen: regn ét barns linje ud i en transaktion og hold
// klubbens top 10 i takt (triggerne), og kaar Maanedens spiller (den planlagte funktion).
// Skrives kun, naar noget har aendret sig.
import "./tid.js";
import { FieldValue } from "firebase-admin/firestore";
import { beregnLinje, linjerEns, klubTop, topEns, POINTREGLER, CLUB_TOP_N } from "./rangliste.js";
import { kaaringerAtOprette } from "./kaaring.js";

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

// Maanedens spiller: opret de kaaringer, der mangler. Praecis som kaarMaanedensSpiller() i
// appen (se kaaring.js) - og appen goer det stadig, hvis den kommer foerst.
// Hver kaaring skrives med create(), saa en eksisterende post ALDRIG overskrives. Findes
// den allerede (en admins browser naaede det foerst), stopper aargangen, ligesom i appen,
// og naeste koersel fortsaetter med den gemte post som forrige maaned.
// Logger kun id'er og antal - aldrig navne.
// Svar: {oprettet: [id'er], findesAllerede: [id'er], fejlet: [id'er]}
export async function kaarMaanedensSpiller(db, nu = new Date(), logger){
  const svar = { oprettet: [], findesAllerede: [], fejlet: [] };
  const alle = async navn => (await db.collection(navn).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const [spillere, kaaringer] = await Promise.all([alle("players"), alle("maanedensSpiller")]);
  // Hvilke poster, der mangler, afhaenger kun af spillernes aargange og de gemte kaaringer -
  // ikke af fodteknikken. Saa de fleste dage hentes fodteknikken slet ikke.
  if(!kaaringerAtOprette({ spillere, kaaringer }, nu).length){
    logger?.info?.("maanedensSpiller", { spillere: spillere.length, kaaringer: kaaringer.length, oprettet: 0 });
    return svar;
  }
  const fodteknik = await alle("footwork");
  // Ingen await herfra og til listen er regnet ud (se kaaring.js).
  const nye = kaaringerAtOprette({ spillere, fodteknik, kaaringer }, nu);
  const stoppet = new Set();
  for(const k of nye){
    if(stoppet.has(k.aargang)) continue;
    try{
      await db.collection("maanedensSpiller").doc(k.id).create({ ...k.post, beregnet: FieldValue.serverTimestamp() });
      svar.oprettet.push(k.id);
      logger?.info?.("maanedensSpiller oprettet", { id: k.id, vindere: k.post.vindere.length });
    }catch(e){
      stoppet.add(k.aargang);
      if(e?.code === 6 || e?.code === "already-exists"){
        svar.findesAllerede.push(k.id);
        logger?.info?.("maanedensSpiller fandtes allerede", { id: k.id });
      }else{
        svar.fejlet.push(k.id);
        logger?.error?.("maanedensSpiller blev ikke gemt", { id: k.id, kode: e?.code ?? null, fejl: String(e?.message || e) });
      }
    }
  }
  logger?.info?.("maanedensSpiller", { spillere: spillere.length, fodteknik: fodteknik.length, kaaringer: kaaringer.length,
    oprettet: svar.oprettet.length, findesAllerede: svar.findesAllerede.length, fejlet: svar.fejlet.length });
  return svar;
}
