// Genberegning af hele ranglisten (rangliste/{id} og klubRangliste/top) med den SAMME kode,
// som Cloud Functions bruger (../../functions/rangliste.js, der bygger paa pointkoden skaaret
// ud af index.html). Logikken ligger for sig, saa den kan proeves mod emulatoren
// (tests/funktioner/emulator.test.mjs), foer den roerer rigtige data.
// AENDRER INTET, medmindre udfoer er sand. Rapporten rummer kun id'er og tal - ingen navne.
const path = require('path');
const { pathToFileURL } = require('url');

const RANGLISTE = path.join(__dirname, '..', '..', 'functions', 'rangliste.js');
const hentLogik = () => import(pathToFileURL(RANGLISTE).href);

async function genberegn(db, { udfoer = false, FieldValue, nu = new Date() } = {}) {
  const { beregnLinje, linjerEns, klubTop, topEns, POINTREGLER } = await hentLogik();
  const alle = async navn => new Map((await db.collection(navn).get()).docs.map(d => [d.id, { id: d.id, ...d.data() }]));
  const [spillere, stiger, stigelogs, fodteknik, linjer] = await Promise.all(
    ['players', 'juggleLadder', 'juggleLog', 'footwork', 'rangliste'].map(alle));
  const indsendelser = new Map();
  for (const d of (await db.collection('submissions').get()).docs) {
    const s = { id: d.id, ...d.data() };
    if (typeof s.playerId !== 'string') continue;
    if (!indsendelser.has(s.playerId)) indsendelser.set(s.playerId, []);
    indsendelser.get(s.playerId).push(s);
  }
  const topSnap = await db.collection('klubRangliste').doc('top').get();

  const rapport = { spillere: spillere.size, linjerFoer: linjer.size, oprettes: [], aendres: [], slettes: [], uaendret: 0,
    gamleRegler: [...linjer.values()].filter(l => l.regler !== POINTREGLER).map(l => l.id), topAendres: false, regler: POINTREGLER, skrevet: 0 };
  const nye = new Map();
  for (const [id, p] of spillere) {
    const ny = beregnLinje({ player: p, juggleLadderDoc: stiger.get(id) || null, juggleLogDoc: stigelogs.get(id) || null,
      footworkDoc: fodteknik.get(id) || null, submissions: indsendelser.get(id) || [] }, nu);
    nye.set(id, ny);
    const gammel = linjer.get(id) || null;
    if (linjerEns(ny, gammel)) rapport.uaendret++;
    else (gammel ? rapport.aendres : rapport.oprettes).push(id);
  }
  for (const id of linjer.keys()) if (!spillere.has(id)) rapport.slettes.push(id);

  // klubTop tager kun boern med login (kanUdfordres, v15.86) - samme top som opdaterTop.
  const top = { top: klubTop([...nye].map(([id, l]) => ({ id, ...l }))), regler: POINTREGLER };
  rapport.topAendres = !(topSnap.exists && topEns(top, topSnap.data()));

  if (udfoer) {
    const skriv = [
      ...[...rapport.oprettes, ...rapport.aendres].map(id => b => b.set(db.collection('rangliste').doc(id), { ...nye.get(id), opdateret: FieldValue.serverTimestamp() })),
      ...rapport.slettes.map(id => b => b.delete(db.collection('rangliste').doc(id))),
      ...(rapport.topAendres ? [b => b.set(db.collection('klubRangliste').doc('top'), { ...top, opdateret: FieldValue.serverTimestamp() })] : [])
    ];
    for (let i = 0; i < skriv.length; i += 400) {
      const b = db.batch();
      skriv.slice(i, i + 400).forEach(f => f(b));
      await b.commit();
      rapport.skrevet += Math.min(400, skriv.length - i);
    }
  }
  return rapport;
}

// Til udskrift: kun antal og id'er.
function resume(r, udfoer) {
  const ville = udfoer ? '' : ' (ville blive)';
  return [
    `Spillere: ${r.spillere} · linjer foer: ${r.linjerFoer} · pointregler i koden: ${r.regler}`,
    `Linjer${ville} oprettet: ${r.oprettes.length} · aendret: ${r.aendres.length} · slettet: ${r.slettes.length} · uaendret: ${r.uaendret}`,
    `Linjer regnet med andre pointregler: ${r.gamleRegler.length}`,
    `Klubbens top 10${ville} ${r.topAendres ? 'skrevet' : 'uaendret'}`,
    ...(r.oprettes.length ? ['  oprettes: ' + r.oprettes.join(' ')] : []),
    ...(r.aendres.length ? ['  aendres:  ' + r.aendres.join(' ')] : []),
    ...(r.slettes.length ? ['  slettes:  ' + r.slettes.join(' ')] : [])
  ].join('\n');
}

module.exports = { genberegn, resume };
