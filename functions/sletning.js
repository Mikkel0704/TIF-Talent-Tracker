// Slet alt om ét barn - paa serveren, i ét hug. Foer gjorde administratorens browser det
// stykke for stykke (deletePlayer i index.html), og to ting kunne den ikke: slette selve
// login'et i Firebase Authentication (en klient maa kun slette sin egen konto) og finde de
// videofiler, ingen sti i databasen peger paa (ingen klient kan liste en videomappe).
// Admin SDK'et kan begge dele.
//
// To slags kald:
//   {playerId, kunOpgoer: true}  laeser kun: hvad ville blive slettet? (til appens dialog)
//   {playerId, navn}             sletter - kun hvis navn (trimmet) er barnets navn
//
// Raekkefoelgen er valgt, saa en koersel, der fejler et sted, kan koeres igen og goere
// arbejdet faerdigt - og saa intet kan genskabe barnets linje paa ranglisten:
//   1. Adgangen lukkes: barnets logins (users-dokumenterne) saettes til active: false.
//      De slettes foerst i trin 5 - de er det eneste, der peger paa login'ene, og uden dem
//      kunne en ny koersel hverken finde login'ene i Authentication eller deres videomapper.
//   2. Videofilerne: de stier, databasen kender, og alt under submissions/{login-id}/.
//   3. Dokumenterne: videolinks, indsendelser, dueller, Maanedens spiller (barnet fjernes
//      fra vinderlisten - posten bliver staaende), klub-ranglisten, noten, stigen,
//      fodteknikken og loggene.
//   4. Login'ene i Authentication.
//   5. Kun hvis intet ovenfor fejlede: users-dokumenterne, og saa spillerdokumentet,
//      ranglistelinjen og sletteanmodningen i ét hug, og til sidst klubbens top 10.
//      Fejlede noget, bliver barnet staaende i appen (med lukket adgang), saa
//      administratoren kan trykke "Slet alt" igen - og den koersel goer resten.
//
// Ranglisten: trin 2-3 udloeser triggerne paa indsendelser, stige, stigelog og fodteknik,
// og de regner linjen ud igen, saa laenge spilleren findes. Spilleren slettes derfor sidst,
// sammen med linjen. Enhver trigger, der koerer derefter, finder ingen spiller og skriver
// ingen linje (server.js: genberegnBarn giver null og sletter/lader vaere). Fordi linjen
// allerede er vaek, roerer en saadan trigger heller ikke klubbens top 10 - derfor regnes
// den ud her til sidst.
//
// Logger kun id'er og antal - aldrig navne, e-mails eller filnavne.
import "./tid.js";
import { HttpsError } from "firebase-functions/v2/https";
import { kraevAdmin } from "./logins.js";
import { opdaterTop } from "./server.js";
import * as kode from "./genereret/pointkode.js";

// Den boette, appen lægger videoerne i (storageBucket i index.html). Ikke projektets
// standardboette - den ligger i USA og bruges ikke.
export const VIDEO_BOETTE = "tif-talent-tracker";
const BATCH = 500;
const SAMTIDIGE_FILER = 10;

// Dokumenter med barnets id som dokument-id. Slettes i trin 3.
const ENKELTE = [
  ["clubRanking", "klubRangliste"],
  ["playerNotes", "note"],
  ["juggleLadder", "stige"],
  ["juggleLog", "stigelog"],
  ["footwork", "fodteknik"],
  ["footworkLog", "fodtekniklog"]
];

const fejlkode = e => e?.code || e?.errorInfo?.code || null;
const ugyldig = besked => new HttpsError("invalid-argument", besked);
const IKKE_ADMIN = "Kun en administrator kan slette en spiller.";

// Kun stier i spillernes videomappe. En sti fra databasen, der peger andre steder hen
// (fx guides/), roeres aldrig - Admin SDK'et ville ellers slette den uden at spoerge.
const gyldigSti = s => typeof s === "string" && s.startsWith("submissions/") && s.split("/").length >= 3
  && !s.split("/").some(del => del === "" || del === "." || del === "..");

export function formSlet(data){
  const d = data && typeof data === "object" ? data : {};
  const id = typeof d.playerId === "string" ? d.playerId.trim() : "";
  if(!id || id.length > 128 || id.includes("/")) throw ugyldig("Vælg en spiller.");
  if(d.kunOpgoer === true) return { id, kunOpgoer: true };
  if(typeof d.navn !== "string" || !d.navn.trim()) throw ugyldig("Skriv spillerens navn for at bekræfte.");
  if(d.navn.length > 200) throw ugyldig("Navnet er for langt.");
  return { id, kunOpgoer: false, navn: d.navn.trim() };
}

// Alt, der findes om barnet. Laeser kun.
async function gorOp(db, bucket, id){
  const samling = n => db.collection(n);
  const [spiller, subs, chA, chB, brugere, videoer, kaaringer, linje, anmodning, ...enkelte] = await Promise.all([
    samling("players").doc(id).get(),
    samling("submissions").where("playerId", "==", id).get(),
    samling("challenges").where("challengerId", "==", id).get(),
    samling("challenges").where("opponentId", "==", id).get(),
    samling("users").where("playerId", "==", id).get(),
    samling("submissionVideos").where("playerId", "==", id).get(),
    // Vinderlisterne kan ikke forespoerges paa et id inde i et objekt; der er én post pr.
    // maaned og aargang, saa de laeses alle.
    samling("maanedensSpiller").get(),
    samling("rangliste").doc(id).get(),
    samling("deletionRequests").doc(id).get(),
    ...ENKELTE.map(([n]) => samling(n).doc(id).get())
  ]);
  const udfordringer = new Map();
  [...chA.docs, ...chB.docs].forEach(d => udfordringer.set(d.id, d));
  const logins = brugere.docs.map(d => ({ uid: d.id, email: String(d.get("email") || ""), ref: d.ref }));

  // Videofilerne: stierne i databasen (submissionVideos og, for gamle videoer, selve
  // indsendelsen) plus alt i login'enes egne mapper. Kun filer, der findes, taelles.
  const filer = new Set();
  for(const l of logins){
    const [liste] = await bucket.getFiles({ prefix: "submissions/" + l.uid + "/" });
    liste.forEach(f => filer.add(f.name));
  }
  const stier = new Set([...videoer.docs, ...subs.docs].map(d => d.get("videoPath")).filter(gyldigSti));
  for(const sti of stier){
    if(filer.has(sti)) continue;
    const [findes] = await bucket.file(sti).exists();
    if(findes) filer.add(sti);
  }

  return {
    spiller: spiller.exists ? spiller : null,
    indsendelser: subs.docs,
    udfordringer: [...udfordringer.values()],
    videoer: videoer.docs,
    kaaringer: kaaringer.docs.filter(d => Array.isArray(d.get("vindere")) && d.get("vindere").some(v => v && v.id === id)),
    logins,
    filer: [...filer],
    linje: linje.exists ? linje : null,
    anmodning: anmodning.exists ? anmodning : null,
    enkelte: ENKELTE.map(([n, art], i) => ({ samling: n, art, snap: enkelte[i] }))
  };
}

// Svaret til appens dialog. E-mails er med (administratoren maa se dem, som dialogen altid
// har vist dem) - men de logges aldrig.
function opgoerSvar(id, o){
  const p = o.spiller ? o.spiller.data() : null;
  const svar = {
    playerId: id,
    findes: !!p,
    navn: p ? String(p.name ?? "") : null,
    aargang: p ? kode.normalizeYearValue(p.year) : null,
    indsendelser: o.indsendelser.length,
    udfordringer: o.udfordringer.length,
    videodokumenter: o.videoer.length,
    videofiler: o.filer.length,
    kaaringer: o.kaaringer.length,
    logins: o.logins.map(l => ({ uid: l.uid, email: l.email })),
    rangliste: !!o.linje,
    anmodning: !!o.anmodning
  };
  o.enkelte.forEach(e => { svar[e.art] = e.snap.exists; });
  return svar;
}

// Skrivninger i batches af hoejst 500. Fejler en batch, meldes hvert punkt i den.
async function iBatches(db, punkter, skriv, fejl, logger, kalder, spiller){
  let ok = 0;
  for(let i = 0; i < punkter.length; i += BATCH){
    const del = punkter.slice(i, i + BATCH);
    const batch = db.batch();
    del.forEach(p => skriv(batch, p));
    try{ await batch.commit(); ok += del.length; }
    catch(e){
      del.forEach(p => fejl.push({ art: p.art, id: p.id }));
      logger?.error?.("sletSpiller: skrivning fejlede", { kalder, spiller, arter: [...new Set(del.map(p => p.art))], antal: del.length, kode: fejlkode(e) });
    }
  }
  return ok;
}

// deps: {db, adminAuth, bucket, FieldValue, logger}; kalder: request.auth.
export async function sletSpiller({ db, adminAuth, bucket, FieldValue, logger }, kalder, data){
  await kraevAdmin(db, kalder, IKKE_ADMIN);
  const f = formSlet(data);
  const id = f.id;
  let o;
  try{ o = await gorOp(db, bucket, id); }
  catch(e){
    logger?.error?.("sletSpiller: kunne ikke goere op", { kalder: kalder.uid, spiller: id, kode: fejlkode(e) });
    throw new HttpsError("internal", "Serveren kunne ikke læse alt om spilleren. Intet er slettet. Prøv igen om lidt.");
  }

  if(o.logins.some(l => l.uid === kalder.uid)){
    throw new HttpsError("failed-precondition", "Spilleren er knyttet til det login, du selv er logget ind med. Det kan du ikke slette herfra.");
  }
  if(f.kunOpgoer){
    const svar = opgoerSvar(id, o);
    logger?.info?.("sletSpiller opgoer", { kalder: kalder.uid, spiller: id, findes: svar.findes, indsendelser: svar.indsendelser,
      udfordringer: svar.udfordringer, videodokumenter: svar.videodokumenter, videofiler: svar.videofiler, kaaringer: svar.kaaringer, logins: o.logins.length });
    return svar;
  }
  // Navnet tjekkes mod det, der staar paa spilleren nu. Er spilleren allerede slettet (en
  // tidligere koersel naaede helt til trin 5), er der intet navn at tjekke - og intet barn,
  // der kan rammes ved en fejl: alt, der er tilbage, hoerer til det slettede barn.
  if(o.spiller && f.navn !== String(o.spiller.get("name") ?? "").trim()){
    throw new HttpsError("failed-precondition", "Navnet passede ikke. Intet er slettet.");
  }

  const fejl = [];
  const slettet = { videofiler: 0, videodokumenter: 0, indsendelser: 0, udfordringer: 0, kaaringer: 0,
    klubRangliste: 0, note: 0, stige: 0, stigelog: 0, fodteknik: 0, fodtekniklog: 0,
    logins: 0, brugerdokumenter: 0, spiller: 0, rangliste: 0, anmodning: 0 };
  const nu = () => FieldValue.serverTimestamp();
  const log = { kalder: kalder.uid, spiller: id };

  // 1. Luk adgangen. Spillerens hasActiveLogin foelger med, som naar en admin deaktiverer.
  if(o.logins.length){
    const punkter = o.logins.map(l => ({ art: "adgang", id: l.uid, ref: l.ref }));
    if(o.spiller?.get("hasActiveLogin") === true) punkter.push({ art: "adgang", id, ref: o.spiller.ref, spiller: true });
    await iBatches(db, punkter, (b, p) => b.update(p.ref, p.spiller ? { hasActiveLogin: false, updatedAt: nu() } : { active: false, updatedAt: nu() }),
      fejl, logger, kalder.uid, id);
  }

  // 2. Videofilerne. Allerede vaek er ikke en fejl.
  const filfejl = [];
  for(let i = 0; i < o.filer.length; i += SAMTIDIGE_FILER){
    await Promise.all(o.filer.slice(i, i + SAMTIDIGE_FILER).map(async sti => {
      try{ await bucket.file(sti).delete({ ignoreNotFound: true }); slettet.videofiler++; }
      catch(e){ filfejl.push(sti); fejl.push({ art: "videofil", id: sti }); }
    }));
  }
  if(filfejl.length) logger?.error?.("sletSpiller: videofiler blev ikke slettet", { ...log, antal: filfejl.length });

  // 3. Dokumenterne.
  const docs = [
    ...o.videoer.map(d => ({ art: "videodokument", id: d.id, ref: d.ref, felt: "videodokumenter" })),
    ...o.indsendelser.map(d => ({ art: "indsendelse", id: d.id, ref: d.ref, felt: "indsendelser" })),
    ...o.udfordringer.map(d => ({ art: "udfordring", id: d.id, ref: d.ref, felt: "udfordringer" })),
    ...o.enkelte.filter(e => e.snap.exists).map(e => ({ art: e.art, id, ref: e.snap.ref, felt: e.art }))
  ];
  // Maanedens spiller: kun barnet fjernes fra vinderlisten, og "rettet" saettes. Posten
  // bliver staaende (evt. uden vinder), saa naeste maaned stadig ved, hvem der vandt sidst.
  const kaaringer = o.kaaringer.map(d => ({ art: "kaaring", id: d.id, ref: d.ref, felt: "kaaringer",
    vindere: d.get("vindere").filter(v => !(v && v.id === id)) }));
  for(const gruppe of [docs, kaaringer]){
    const foer = fejl.length;
    await iBatches(db, gruppe, (b, p) => (p.vindere ? b.update(p.ref, { vindere: p.vindere, rettet: nu() }) : b.delete(p.ref)), fejl, logger, kalder.uid, id);
    const fejlede = new Set(fejl.slice(foer).map(x => x.art + "/" + x.id));
    gruppe.filter(p => !fejlede.has(p.art + "/" + p.id)).forEach(p => { slettet[p.felt]++; });
  }

  // 4. Login'ene i Authentication. Allerede vaek er ikke en fejl. users-dokumenterne
  // bliver staaende (lukkede) til trin 5, saa en ny koersel stadig kan finde login'ene og
  // deres videomapper, hvis noget andet fejlede.
  for(const l of o.logins){
    try{ await adminAuth.deleteUser(l.uid); slettet.logins++; }
    catch(e){
      if(fejlkode(e) === "auth/user-not-found") continue;
      fejl.push({ art: "login", id: l.uid });
      logger?.error?.("sletSpiller: login'et blev ikke slettet", { ...log, uid: l.uid, kode: fejlkode(e) });
    }
  }

  // 5. Kun naar alt ovenfor lykkedes: users-dokumenterne, og saa spilleren, linjen og
  // anmodningen i ét hug. Fejlede noget, bliver barnet staaende i appen med lukket adgang,
  // og "Slet alt" kan trykkes igen.
  if(!fejl.length){
    slettet.brugerdokumenter = await iBatches(db, o.logins.map(l => ({ art: "brugerdokument", id: l.uid, ref: l.ref })),
      (b, p) => b.delete(p.ref), fejl, logger, kalder.uid, id);
  }
  if(!fejl.length){
    if(o.spiller || o.linje || o.anmodning){
      const b = db.batch();
      b.delete(db.collection("players").doc(id));
      b.delete(db.collection("rangliste").doc(id));
      b.delete(db.collection("deletionRequests").doc(id));
      try{
        await b.commit();
        slettet.spiller = o.spiller ? 1 : 0; slettet.rangliste = o.linje ? 1 : 0; slettet.anmodning = o.anmodning ? 1 : 0;
      }catch(e){
        fejl.push({ art: "spiller", id });
        logger?.error?.("sletSpiller: spilleren blev ikke slettet", { ...log, kode: fejlkode(e) });
      }
    }
    // Klubbens top 10 uden barnet. Skriver kun, hvis noget er aendret.
    if(!fejl.length){
      try{ await opdaterTop(db); }
      catch(e){
        fejl.push({ art: "klubbensTop", id: "top" });
        logger?.error?.("sletSpiller: klubbens top 10 blev ikke opdateret", { ...log, kode: fejlkode(e) });
      }
    }
  }

  const arter = {};
  fejl.forEach(x => { arter[x.art] = (arter[x.art] || 0) + 1; });
  logger?.info?.("sletSpiller", { ...log, slettet, fejl: fejl.length, fejlArter: arter });
  return { playerId: id, faerdig: !fejl.length, slettet, fejl };
}
