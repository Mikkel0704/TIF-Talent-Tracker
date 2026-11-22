// Ren beregning af én ranglistelinje og klubbens top 10. Ingen Firebase her - kun appens
// egen kode (genereret/pointkode.js, skaaret ud af index.html af byg.mjs) og lidt lim.
// Bruges af triggerne (index.js), af genberegningsvaerktoejet og af testene.
import "./tid.js";
import * as kode from "./genereret/pointkode.js";

export const POINTREGLER = kode.POINTREGLER;
export const CLUB_TOP_N = kode.CLUB_TOP_N;

// Linjen for ét barn, uden "opdateret". null = spilleren findes ikke (linjen skal slettes).
//   player          players/{id} som {id, ...data}  (eller null)
//   juggleLadderDoc juggleLadder/{id} som {id, ...data} (eller null)
//   juggleLogDoc    juggleLog/{id}
//   footworkDoc     footwork/{id}
//   submissions     indsendelser med playerId == id. Taeller ikke laengere med i pointene
//                   (pointreglerne 2026-11-25: Talentmaerket og dueller giver ingen point),
//                   men gives stadig til appens kode, saa linjen regnes med det hele.
//   nu              tidspunktet, uge og maaned regnes ud fra
//
// Alt herinde er synkront: data saettes og regnes i ét hug uden await, saa to kald i
// samme instans ikke kan blande to boerns data.
export function beregnLinje({ player, juggleLadderDoc = null, juggleLogDoc = null, footworkDoc = null, submissions = [] } = {}, nu = new Date()){
  if(process.env.TZ !== "Europe/Copenhagen") throw new Error("TZ er ikke Europe/Copenhagen - pointene ville havne i forkerte uger");
  if(!player || !player.id) return null;
  const id = player.id;
  // Som appen, naar spillerne hentes (og som kaaringen, kaaring.js): migratePlayer giver en
  // gammel spiller uden aargang den aargang, noten peger paa, og normaliserer den. Kopi, saa
  // kalderens data ikke roeres.
  const p = kode.migratePlayer({ ...player });
  const medId = d => (d ? { ...d, id } : null);
  // Appens kode regner "i dag" ud fra nu - ikke maskinens ur (fx dage efter i dag).
  kode.saetNu(nu);
  try{ return linje(p, id, medId, { juggleLadderDoc, juggleLogDoc, footworkDoc, submissions }, nu); }
  finally{ kode.saetNu(null); }
}
function linje(p, id, medId, { juggleLadderDoc, juggleLogDoc, footworkDoc, submissions }, nu){
  kode.saetBarn({
    spiller: p,
    stige: medId(juggleLadderDoc),
    stigelog: medId(juggleLogDoc),
    fodteknik: medId(footworkDoc),
    indsendelser: (submissions || []).filter(s => s && s.playerId === id)
  });
  const uge = kode.startOfWeek(nu), maaned = kode.startOfMonth(nu);
  // Praecis som renderLeaderboard's pointsFor() for en traener, der har alle data: kun
  // fodteknik og stige. players.points og submissions.pointsAwarded taeller ikke.
  const vindue = since => kode.rangPointIVindue(id, since);
  return {
    name: String(p.name ?? ""),
    year: kode.normalizeYearValue(p.year),
    gender: p.gender || null,
    kanUdfordres: p.hasActiveLogin === true,
    total: kode.totalPoints(p),
    uge: { fra: kode.dagsISO(uge), point: vindue(uge) },
    maaned: { fra: kode.dagsISO(maaned), point: vindue(maaned) },
    regler: POINTREGLER
  };
}

// Er to linjer ens, naar man ser bort fra "opdateret"? (null = ingen linje)
const FELTER = ["name", "year", "gender", "kanUdfordres", "total", "regler"];
export function linjerEns(a, b){
  if(!a || !b) return !a && !b;
  return FELTER.every(f => (a[f] ?? null) === (b[f] ?? null))
    && ["uge", "maaned"].every(f => (a[f]?.fra ?? null) === (b[f]?.fra ?? null) && (a[f]?.point ?? null) === (b[f]?.point ?? null));
}

// Klubbens top 10 af linjer [{id, name, year, total}]. Samme orden som appens
// [...].sort((a,b)=>b.total-a.total).slice(0, CLUB_TOP_N): sorteringen er stabil, og
// appens liste kommer i dokument-id-orden fra Firestore - saa lige point ordnes efter id.
export function klubTop(linjer){
  return [...(linjer || [])]
    .filter(l => l && l.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .sort((a, b) => (b.total || 0) - (a.total || 0))
    .slice(0, CLUB_TOP_N)
    .map(l => ({ id: l.id, name: String(l.name ?? ""), year: String(l.year ?? ""), total: l.total || 0 }));
}
export function topEns(a, b){
  const x = a?.top || [], y = b?.top || [];
  return (a?.regler ?? null) === (b?.regler ?? null) && x.length === y.length
    && x.every((r, i) => r.id === y[i].id && r.name === y[i].name && r.year === y[i].year && r.total === y[i].total);
}
