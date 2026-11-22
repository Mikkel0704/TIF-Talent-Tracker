// Maanedens spiller og Maanedens topscorer regnet paa serveren. Ren beregning: ingen
// Firebase her - kun appens egen kode (genereret/pointkode.js, skaaret ud af index.html af
// byg.mjs) og lidt lim, der goer praecis det, kaarMaanedensSpiller() i index.html goer for en
// admin:
//
//   - aargangene er alle normaliserede aargange med mindst én spiller (som appens
//     allKnownYears() snittet med aargangene med spillere, i samme orden: nyeste foerst)
//   - for hver aargang gaas de afgjorte maaneder igennem i raekkefoelge
//     (maanederTilKaaring). For hver maaned:
//       1. Maanedens spiller, hvis den mangler. Mangler forrige maaneds kaaring (og det ikke
//          er den foerste maaned), stopper aargangen. Vinderne regnes af
//          maanedensSpillerRangering med forrige maaneds vindere sprunget over.
//       2. Maanedens topscorer, hvis den mangler - lige efter, og altid paa en Maanedens
//          spiller for samme maaned og aargang (gemt eller lige regnet), hvis vindere ikke
//          kan vinde topscorer (maanedensTopscorerRangering).
//   - en kaaring, der laves i samme koersel, taeller med det samme
//
// Bruges af den planlagte funktion (index.js via server.js) og af testene.
import "./tid.js";
import * as kode from "./genereret/pointkode.js";

export const MAANEDENS_FOERSTE = kode.MAANEDENS_FOERSTE;
export const MAANEDENS_AFGOERES_DAG = kode.MAANEDENS_AFGOERES_DAG;

// Hvilke kaaringer skal oprettes nu - begge slags, i den orden, de skal skrives?
//   spillere     alle players/{id} som {id, ...data}
//   fodteknik    alle footwork/{id} (dagene og jokerafgoerelserne)
//   indsendelser alle submissions/{id} (medaljepoint efter reviewedAt)
//   stiger       alle juggleLadder/{id} (hvor langt barnet er naaet)
//   stigelogge   alle juggleLog/{id} (hvornaar hvert trin blev taget)
//   kaaringer    alle eksisterende maanedensSpiller/{id}
//   topscorere   alle eksisterende maanedensTopscorer/{id}
//   nu           tidspunktet; dagen regnes i dansk tid
// Svar: [{samling, id, aargang, maaned, post: {maaned, aargang, vindere}}]. "beregnet"
// saetter den, der skriver (serverens tidsstempel).
//
// Hvilke poster, der mangler, afhaenger kun af spillernes aargange og de gemte kaaringer -
// derfor kan kalderen spoerge uden de tunge data foerst og kun hente dem, naar noget mangler.
//
// Alt herinde er synkront: data saettes og regnes i ét hug uden await, saa et andet kald
// i samme instans (en ranglistetrigger) ikke kan skifte appens lister ud undervejs.
export function alleKaaringerAtOprette({ spillere = [], fodteknik = [], indsendelser = [], stiger = [], stigelogge = [],
  kaaringer = [], topscorere = [] } = {}, nu = new Date()){
  if(process.env.TZ !== "Europe/Copenhagen") throw new Error("TZ er ikke Europe/Copenhagen - den 5. ville begynde paa det forkerte tidspunkt");
  const maaneder = kode.maanederTilKaaring(kode.dagsISO(nu));
  if(!maaneder.length) return [];
  // Appens kode regner "i dag" ud fra nu - ikke maskinens ur (fx dage efter i dag).
  kode.saetNu(nu);
  try{ return beregnKaaringer({ spillere, fodteknik, indsendelser, stiger, stigelogge, kaaringer, topscorere }, maaneder); }
  finally{ kode.saetNu(null); }
}
function beregnKaaringer({ spillere, fodteknik, indsendelser, stiger, stigelogge, kaaringer, topscorere }, maaneder){

  // Som appen, naar spillerne hentes: migratePlayer giver en spiller uden aargang den
  // aargang, noten peger paa, og normaliserer den. Kopier, saa kalderens data ikke roeres.
  const alle = (spillere || []).filter(p => p && p.id).map(p => kode.migratePlayer({ ...p }));
  const medId = l => (l || []).filter(d => d && d.id);
  kode.saetAlleBoern({ spillere: alle, fodteknik: medId(fodteknik), indsendelser: medId(indsendelser),
    stiger: medId(stiger), stigelogge: medId(stigelogge) });

  const medSpillere = new Set(alle.map(p => kode.normalizeYearValue(p.year)));
  const aargange = [...medSpillere].filter(Boolean).sort((a, b) => Number(b) - Number(a));
  const findes = new Map(medId(kaaringer).map(k => [k.id, k]));
  const topFindes = new Set(medId(topscorere).map(k => k.id));
  const ud = [];
  for(const y of aargange){
    const iAargangen = alle.filter(p => kode.normalizeYearValue(p.year) === y);
    for(const m of maaneder){
      const id = m + "_" + y;
      if(!findes.has(id)){
        const forrige = findes.get(kode.forrigeMaaned(m) + "_" + y);
        if(m > kode.MAANEDENS_FOERSTE && !forrige) break;   // reglen om to i traek kan ikke holdes
        const res = kode.maanedensSpillerRangering(iAargangen, m, (forrige?.vindere || []).map(v => v.id));
        const post = { maaned: m, aargang: y,
          vindere: res.vindere.map(v => ({ id: v.id, navn: v.navn, dage: v.dage, minutter: v.halveMin / 2, oevelser: v.oevelser, point: v.point })) };
        findes.set(id, { id, ...post });                   // saa naeste maaned og topscoreren ser den med det samme
        ud.push({ samling: "maanedensSpiller", id, aargang: y, maaned: m, post });
      }
      if(!topFindes.has(id)){
        const spiller = findes.get(id);
        const res = kode.maanedensTopscorerRangering(iAargangen, m, (Array.isArray(spiller?.vindere) ? spiller.vindere : []).map(v => v.id));
        topFindes.add(id);
        ud.push({ samling: "maanedensTopscorer", id, aargang: y, maaned: m, post: { maaned: m, aargang: y, vindere: res.vindere.map(kode.topscorerVinder) } });
      }
    }
  }
  return ud;
}

// Kun Maanedens spiller, i den form, den altid har haft: [{id, aargang, maaned, post}].
export function kaaringerAtOprette(data = {}, nu = new Date()){
  return alleKaaringerAtOprette(data, nu).filter(k => k.samling === "maanedensSpiller").map(({ samling, ...k }) => k);
}

// Kun Maanedens topscorer: [{id, aargang, maaned, post}].
export function topscorereAtOprette(data = {}, nu = new Date()){
  return alleKaaringerAtOprette(data, nu).filter(k => k.samling === "maanedensTopscorer").map(({ samling, ...k }) => k);
}
