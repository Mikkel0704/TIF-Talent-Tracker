// Maanedens spiller regnet paa serveren. Ren beregning: ingen Firebase her - kun appens
// egen kode (genereret/pointkode.js, skaaret ud af index.html af byg.mjs) og lidt lim, der
// goer praecis det, kaarMaanedensSpiller() i index.html goer for en admin:
//
//   - aargangene er alle normaliserede aargange med mindst én spiller (som appens
//     allKnownYears() snittet med aargangene med spillere, i samme orden: nyeste foerst)
//   - for hver aargang gaas de afgjorte maaneder igennem i raekkefoelge
//     (maanederTilKaaring); en maaned med en kaaring springes over; mangler forrige
//     maaneds kaaring (og det ikke er den foerste maaned), stopper aargangen
//   - en kaaring, der laves i samme koersel, taeller som forrige maaned for den naeste
//   - vinderne regnes af maanedensSpillerRangering med forrige maaneds vindere sprunget over
//
// Bruges af den planlagte funktion (index.js via server.js) og af testene.
import "./tid.js";
import * as kode from "./genereret/pointkode.js";

export const MAANEDENS_FOERSTE = kode.MAANEDENS_FOERSTE;
export const MAANEDENS_AFGOERES_DAG = kode.MAANEDENS_AFGOERES_DAG;

// Hvilke kaaringer skal oprettes nu?
//   spillere    alle players/{id} som {id, ...data}
//   fodteknik   alle footwork/{id} som {id, ...data} (dagene og jokerafgoerelserne)
//   kaaringer   alle eksisterende maanedensSpiller/{id} som {id, ...data}
//   nu          tidspunktet; dagen regnes i dansk tid
// Svar: [{id, aargang, maaned, post: {maaned, aargang, vindere}}] i den orden, appen ville
// skrive dem. "beregnet" saetter den, der skriver (serverens tidsstempel).
//
// Alt herinde er synkront: data saettes og regnes i ét hug uden await, saa et andet kald
// i samme instans (en ranglistetrigger) ikke kan skifte appens lister ud undervejs.
export function kaaringerAtOprette({ spillere = [], fodteknik = [], kaaringer = [] } = {}, nu = new Date()){
  if(process.env.TZ !== "Europe/Copenhagen") throw new Error("TZ er ikke Europe/Copenhagen - den 5. ville begynde paa det forkerte tidspunkt");
  const maaneder = kode.maanederTilKaaring(kode.dagsISO(nu));
  if(!maaneder.length) return [];

  // Som appen, naar spillerne hentes: migratePlayer giver en spiller uden aargang den
  // aargang, noten peger paa, og normaliserer den. Kopier, saa kalderens data ikke roeres.
  const alle = (spillere || []).filter(p => p && p.id).map(p => kode.migratePlayer({ ...p }));
  kode.saetAlleBoern({ spillere: alle, fodteknik: (fodteknik || []).filter(f => f && f.id) });

  const medSpillere = new Set(alle.map(p => kode.normalizeYearValue(p.year)));
  const aargange = [...medSpillere].filter(Boolean).sort((a, b) => Number(b) - Number(a));
  const findes = new Map((kaaringer || []).filter(k => k && k.id).map(k => [k.id, k]));
  const ud = [];
  for(const y of aargange){
    const iAargangen = alle.filter(p => kode.normalizeYearValue(p.year) === y);
    for(const m of maaneder){
      const id = m + "_" + y;
      if(findes.has(id)) continue;
      const forrige = findes.get(kode.forrigeMaaned(m) + "_" + y);
      if(m > kode.MAANEDENS_FOERSTE && !forrige) break;   // reglen om to i traek kan ikke holdes
      const res = kode.maanedensSpillerRangering(iAargangen, m, (forrige?.vindere || []).map(v => v.id));
      const post = { maaned: m, aargang: y,
        vindere: res.vindere.map(v => ({ id: v.id, navn: v.navn, dage: v.dage, minutter: v.halveMin / 2, oevelser: v.oevelser, point: v.point })) };
      findes.set(id, { id, ...post });                   // saa naeste maaned ser den med det samme
      ud.push({ id, aargang: y, maaned: m, post });
    }
  }
  return ud;
}
