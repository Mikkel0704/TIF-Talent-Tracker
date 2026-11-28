// Det, funktionerne goer mod databasen: regn ét barns linje ud i en transaktion og hold
// klubbens top 10 i takt (triggerne), og kaar Maanedens spiller og Maanedens topscorer
// (den planlagte funktion).
// Skrives kun, naar noget har aendret sig.
import "./tid.js";
import { FieldValue } from "firebase-admin/firestore";
import { beregnLinje, linjerEns, klubTop, topEns, POINTREGLER, CLUB_TOP_N } from "./rangliste.js";
import { alleKaaringerAtOprette } from "./kaaring.js";

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
    // kanUdfordres afgoer, om barnet maa staa i klubbens top 10 (klubTop) - et login, der
    // oprettes, slettes, aktiveres eller deaktiveres, flytter altsaa toppen.
    const topRoert = !ny || !gammel || ny.name !== gammel.name || ny.year !== gammel.year || ny.total !== gammel.total
      || ny.kanUdfordres !== gammel.kanUdfordres;
    return { handling: !ny ? "slettet" : !gammel ? "oprettet" : "aendret", topRoert };
  });
}

// klubRangliste/top ud fra linjerne - kun boern med kanUdfordres == true (se klubTop).
// UDEN et sammensat indeks: where("kanUdfordres","==",true) + orderBy("total") ville kraeve
// et (kanUdfordres, total desc), som skal oprettes og bygges, foer funktionen virker. I
// stedet laeses linjerne efter total (enkeltfelts-indekset, som altid findes) side for side,
// til der er N med kanUdfordres == true, og filtreres her. Derefter ALLE med samme total som
// nummer N (where total == graense, ogsaa enkeltfelt), saa lige point ved graensen afgoeres
// efter id som i appen. Der laeses altsaa N + de boern uden login, der ligger over graensen.
const TOP_SIDE = 25;
export async function opdaterTop(db){
  return db.runTransaction(async tx => {
    const linjer = db.collection("rangliste");
    const kandidater = new Map();
    const tag = d => { const l = { id: d.id, ...d.data() }; if(l.kanUdfordres === true) kandidater.set(d.id, l); };
    let graense = null, sidste = null;
    for(;;){
      let q = linjer.orderBy("total", "desc").limit(TOP_SIDE);
      if(sidste) q = q.startAfter(sidste);
      const side = await tx.get(q);
      for(const d of side.docs){
        tag(d);
        if(kandidater.size === CLUB_TOP_N){ graense = d.get("total"); break; }
      }
      if(graense !== null || side.size < TOP_SIDE) break;
      sidste = side.docs[side.size - 1];
    }
    if(graense !== null) (await tx.get(linjer.where("total", "==", graense))).docs.forEach(tag);
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

// Maanedens spiller og Maanedens topscorer: opret de kaaringer, der mangler. Praecis som
// kaarMaanedensSpiller() i appen (se kaaring.js) - og appen goer det stadig, hvis den kommer
// foerst. For hver aargang og maaned skrives Maanedens spiller og lige efter topscoreren.
// Hver kaaring skrives med create(), saa en eksisterende post ALDRIG overskrives. Findes
// den allerede (en admins browser naaede det foerst), stopper aargangen - for begge slags,
// ligesom i appen - og naeste koersel fortsaetter med den gemte post.
// Indsendelser, stige og stigelog (til topscoreren) og fodteknik hentes kun, naar noget mangler.
// Logger kun id'er og antal - aldrig navne.
// Svar: {oprettet, findesAllerede, fejlet: [id'er paa Maanedens spiller],
//        topscorer: {oprettet, findesAllerede, fejlet: [id'er paa Maanedens topscorer]}}
export async function kaarMaanedensSpiller(db, nu = new Date(), logger){
  const svar = { oprettet: [], findesAllerede: [], fejlet: [], topscorer: { oprettet: [], findesAllerede: [], fejlet: [] } };
  const alle = async navn => (await db.collection(navn).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const [spillere, kaaringer, topscorere] = await Promise.all([alle("players"), alle("maanedensSpiller"), alle("maanedensTopscorer")]);
  // Hvilke poster, der mangler, afhaenger kun af spillernes aargange og de gemte kaaringer -
  // ikke af registreringerne. Saa de fleste dage hentes de slet ikke.
  if(!alleKaaringerAtOprette({ spillere, kaaringer, topscorere }, nu).length){
    logger?.info?.("maanedensSpiller", { spillere: spillere.length, kaaringer: kaaringer.length, topscorere: topscorere.length, oprettet: 0 });
    return svar;
  }
  const [fodteknik, indsendelser, stiger, stigelogge] = await Promise.all([alle("footwork"), alle("submissions"), alle("juggleLadder"), alle("juggleLog")]);
  // Ingen await herfra og til listen er regnet ud (se kaaring.js).
  const nye = alleKaaringerAtOprette({ spillere, fodteknik, indsendelser, stiger, stigelogge, kaaringer, topscorere }, nu);
  const stoppet = new Set();
  for(const k of nye){
    if(stoppet.has(k.aargang)) continue;
    const ud = k.samling === "maanedensTopscorer" ? svar.topscorer : svar;
    try{
      await db.collection(k.samling).doc(k.id).create({ ...k.post, beregnet: FieldValue.serverTimestamp() });
      ud.oprettet.push(k.id);
      logger?.info?.(k.samling + " oprettet", { id: k.id, vindere: k.post.vindere.length });
    }catch(e){
      stoppet.add(k.aargang);
      if(e?.code === 6 || e?.code === "already-exists"){
        ud.findesAllerede.push(k.id);
        logger?.info?.(k.samling + " fandtes allerede", { id: k.id });
      }else{
        ud.fejlet.push(k.id);
        logger?.error?.(k.samling + " blev ikke gemt", { id: k.id, kode: e?.code ?? null, fejl: String(e?.message || e) });
      }
    }
  }
  logger?.info?.("maanedensSpiller", { spillere: spillere.length, fodteknik: fodteknik.length, indsendelser: indsendelser.length,
    stiger: stiger.length, stigelogge: stigelogge.length, kaaringer: kaaringer.length, topscorere: topscorere.length,
    oprettet: svar.oprettet.length, findesAllerede: svar.findesAllerede.length, fejlet: svar.fejlet.length,
    topscorerOprettet: svar.topscorer.oprettet.length, topscorerFindesAllerede: svar.topscorer.findesAllerede.length, topscorerFejlet: svar.topscorer.fejlet.length });
  return svar;
}
