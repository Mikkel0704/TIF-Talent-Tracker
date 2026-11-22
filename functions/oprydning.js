// Morgenoprydningen: hver dag kl. 05:00 dansk tid, i samme koersel som kaaringen
// (maanedensKaaring i index.js). Den goer det, privatlivsteksten lover, uden at vente paa,
// at en traener aabner appen:
//
//   1. Joker-begrundelser: fritekst, familien selv skrev. Slettes 3 doegn efter, traeneren
//      har afgjort jokeren (godkendt eller afvist). En ubehandlet anmodning beholder sin
//      begrundelse. Dato og svar bliver - de bruges til streaken.
//   2. Videoer: traeningsvideoen, naar traeneren har afgjort den; duelvideoen, naar
//      modparten har set den, eller senest 2 doegn efter afgoerelsen; enhver video senest
//      7 dage efter upload. Filen slettes i lageret, og dokumentet ryddes PRAECIS som i appen
//      (se videoSkalSlettes og sweepExpiredVideos i index.html): en traeningsvideo mister hele
//      submissionVideos-dokumentet, ellers fjernes linket (videoURL: null, videoDeletedAt),
//      saa appen viser "slettet efter behandling" eller "udloebet", som den altid har gjort.
//
// Afgoerelserne traeffes af appens EGEN kode (jokerBegrundelserAtSlette, videoSkalSlettes),
// skaaret ud af index.html af byg.mjs - der er ingen kopi af reglerne her. Appens egen
// oprydning i en traeners browser er stadig reserven, og boettens slettefrist (8 dage)
// er sikkerhedsnettet under det hele.
//
// Kun filer under submissions/ roeres (gyldigSti fra sletning.js). En fejl paa ét dokument
// eller én fil stopper ikke resten, og en fejl her stopper aldrig kaaringen: rydOp kaster
// aldrig. Alt kan koeres igen uden skade - det, der er ryddet, er der ikke noget at goere ved.
// Logger kun id'er og antal - aldrig tekster, navne, e-mails eller filnavne.
import "./tid.js";
import * as kode from "./genereret/pointkode.js";
import { gyldigSti } from "./sletning.js";

const fejlkode = e => e?.code || e?.errorInfo?.code || null;

// Joker-begrundelserne. Svar: {logge, ryddet: antal begrundelser, dokumenter, fejl: [id]}
export async function rydJokerBegrundelser({ db, FieldValue, logger }, nu = new Date()){
  const svar = { logge: 0, ryddet: 0, dokumenter: 0, fejl: [] };
  const logge = await db.collection("footworkLog").get();
  svar.logge = logge.size;
  for(const d of logge.docs){
    const datoer = kode.jokerBegrundelserAtSlette(d.get("reasons"), nu);
    if(!datoer.length) continue;
    // Som appen: kun teksten fjernes - afgoerelsen (afgjort, afgjortAf, afgjortAt) bliver.
    const reasons = {};
    datoer.forEach(dato => { reasons[dato] = { tekst: FieldValue.delete() }; });
    try{
      await d.ref.set({ reasons, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      svar.ryddet += datoer.length;
      svar.dokumenter++;
    }catch(e){
      svar.fejl.push(d.id);
      logger?.error?.("oprydning: joker-begrundelser blev ikke slettet", { spiller: d.id, antal: datoer.length, kode: fejlkode(e) });
    }
  }
  return svar;
}

// Videoerne. Svar: {indsendelser, slettet: {behandlet, udloebet, set, duelfrist}, ugyldigSti, fejl: [id]}
export async function rydVideoer({ db, bucket, FieldValue, logger }, nu = new Date()){
  const svar = { indsendelser: 0, slettet: { behandlet: 0, udloebet: 0, set: 0, duelfrist: 0 }, ugyldigSti: 0, fejl: [] };
  const [subs, vids] = await Promise.all([db.collection("submissions").get(), db.collection("submissionVideos").get()]);
  svar.indsendelser = subs.size;
  const videoer = new Map(vids.docs.map(d => [d.id, d]));
  for(const sd of subs.docs){
    const s = { id: sd.id, ...sd.data() };
    // Praecis som videoFor() i appen: submissionVideos-dokumentet, hvis det findes - ellers de
    // gamle felter paa selve indsendelsen (videoer fra foer flytningen).
    const vd = videoer.get(sd.id);
    const v = vd
      ? { url: vd.get("videoURL") || null, path: vd.get("videoPath") || null, viewedAt: vd.get("viewedAt") || null, ny: true }
      : (s.videoURL || s.videoPath ? { url: s.videoURL || null, path: s.videoPath || null, viewedAt: s.viewedAt || null, ny: false } : null);
    const r = kode.videoSkalSlettes(s, v, nu);
    if(!r) continue;
    try{
      // En sti uden for submissions/ (kun muligt med en haandskrevet klient) roeres aldrig i
      // lageret - linket fjernes stadig, saa det ikke bliver ved med at pege paa noget.
      if(gyldigSti(v.path)) await bucket.file(v.path).delete({ ignoreNotFound: true });
      else svar.ugyldigSti++;
      if(r.dokument) await vd.ref.delete();
      else await (vd ? vd.ref : sd.ref).set({ videoURL: null, videoDeletedAt: FieldValue.serverTimestamp() }, { merge: true });
      svar.slettet[r.grund]++;
    }catch(e){
      svar.fejl.push(sd.id);
      logger?.error?.("oprydning: video blev ikke slettet", { indsendelse: sd.id, grund: r.grund, kode: fejlkode(e) });
    }
  }
  return svar;
}

// Begge dele. Kaster aldrig: en fejl meldes i loggen og i svaret ({fejlet: true} paa den del).
export async function rydOp(deps, nu = new Date()){
  const svar = {};
  for(const [navn, fn] of [["joker", rydJokerBegrundelser], ["video", rydVideoer]]){
    try{ svar[navn] = await fn(deps, nu); }
    catch(e){
      svar[navn] = { fejlet: true };
      // Kun koden: en fejltekst kan rumme en sti eller et filnavn.
      deps.logger?.error?.("oprydning: " + navn + " fejlede", { kode: fejlkode(e) });
    }
  }
  const j = svar.joker, v = svar.video;
  deps.logger?.info?.("oprydning", {
    jokerLogge: j.logge ?? null, jokerRyddet: j.ryddet ?? null, jokerFejl: j.fejl?.length ?? null, jokerFejlet: !!j.fejlet,
    indsendelser: v.indsendelser ?? null, videoerSlettet: v.slettet ?? null, ugyldigSti: v.ugyldigSti ?? null, videoFejl: v.fejl?.length ?? null, videoFejlet: !!v.fejlet
  });
  return svar;
}
