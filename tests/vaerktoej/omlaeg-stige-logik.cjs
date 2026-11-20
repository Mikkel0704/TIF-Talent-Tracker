// Engangsomlaegning af Jongleringsstigen til de nye stiger (pointreglerne 2026-11-20).
// Logikken ligger for sig, saa den kan proeves mod emulatoren
// (tests/funktioner/omlaeg-stige.test.mjs), foer den roerer rigtige data.
// AENDRER INTET, medmindre udfoer er sand. Rapporten rummer kun id'er og tal - ingen navne.
//
// Hvorfor: der gemmes ikke antal jongleringer, men et trin-NUMMER - juggleLadder.mainStep/
// weakStep er "antal klarede trin", og i juggleLog er v et trin-indeks og fra/til et antal
// klarede trin. Da hovedstigen fik 16 trin (fire pr. fase) og daarligt ben 12 (tre pr. fase),
// kom tallene til at staa andre steder i listen: gammelt mainStep 13 (100 jongleringer)
// ville uden omlaegning laeses som det nye trin 13 = 150 jongleringer.
//
// Reglen: et barn faar de nye trin, hvis antal er HOEJST det antal, barnet havde naaet.
// Gammel 25 -> nye trin op til 20 (6 trin), gammel 100 -> 11 trin, gammel 150 -> 13 trin.
// Ingen faar et trin, de ikke har klaret; tal, der ikke findes mere, rundes NED.
//
// Sikkerhedskopien: originalerne gemmes paa barnets juggleLog-dokument som stigeFoer
// ({mainStep, weakStep, omlagt, fra}) og entriesFoer (hele den gamle entries-liste). IKKE
// paa juggleLadder: firestore.rules lader en spiller skrive juggleLadder, kun hvis HELE
// dokumentet efter skrivningen har felterne mainStep/weakStep/tricks/days/year/gender/
// updatedAt (keys().hasOnly) - et ekstra felt dér ville afvise barnets naeste registrering.
// juggleLog har ingen saadan graense, appen skriver den med {merge:true} (felterne bliver
// staaende), og "Slet alt" sletter den med barnet. Findes stigeFoer/entriesFoer allerede,
// er barnet omlagt, og det springes over.
//
// Det er ikke nok alene: et barn, hvis trin IKKE aendrede sig (fx mainStep 6), faar ingen
// stigeFoer - og tager det bagefter trin i den nye app, ville en ny koersel laese de nye trin
// som gamle. Derfor skriver --udfoer ogsaa stigeOmlaegning/koersel (kun dato og antal, ingen
// boernedata; samlingen har ingen regel, saa kun Admin SDK'et kan laese og skrive den). Findes
// den, roeres INTET dokument, og alt meldes som sprunget over.

// De GAMLE stiger, som de stod foer 2026-11-20. Frosset med vilje: de beskriver de data,
// der ligger i databasen, og maa ikke foelge med, hvis index.html aendres igen.
const OLD_MAIN = Object.freeze([3,5,7,10,15,20,25,30,35,40,55,75,100,125,150]);
const OLD_WEAK = Object.freeze([2,3,5,7,10,13,15,20,25,30]);
// De NYE stiger, som index.html har dem fra 2026-11-20. Ogsaa frosset: vaerktoejet omlaegger
// netop fra de gamle til DISSE. Staar der noget andet i index.html, stopper vaerktoejet (tjekIndex).
const NEW_MAIN = Object.freeze([3,5,7,10, 15,20,30,40, 50,75,100,125, 150,200,250,300]);
const NEW_WEAK = Object.freeze([2,3,5, 7,10,15, 20,30,40, 50,75,100]);
const FRA = "2026-11-20";
const KOERSEL = ['stigeOmlaegning', 'koersel'];

const STIGER = { main: { gammel: OLD_MAIN, ny: NEW_MAIN }, weak: { gammel: OLD_WEAK, ny: NEW_WEAK } };
const erTrin = x => Number.isInteger(x) && x >= 0;

// Antal klarede trin (mainStep/weakStep, fra/til) -> nyt antal. 0 forbliver 0. Et tal over
// den gamle stiges laengde klippes til den, ligesom appen goer (juggleMainStep).
function nytAntal(antal, art){
  const { gammel, ny } = STIGER[art];
  if(!erTrin(antal) || antal === 0) return antal;
  const naaet = gammel[Math.min(antal, gammel.length) - 1];
  return ny.filter(n => n <= naaet).length;
}
// Trin-indeks (v i loggen) -> nyt indeks: det stoerste nye trin, der er hoejst det gamle tal.
function nytIndeks(v, art){
  const { gammel, ny } = STIGER[art];
  if(!erTrin(v) || v >= gammel.length) return v;
  return ny.filter(n => n <= gammel[v]).length - 1;
}
// Én logpost. Kun main/weak-registreringer (v) og fortryd/rettelser paa main/weak (fra/til)
// roeres; tricks og alt andet staar, som det stod.
function nyPost(e){
  if(!e || typeof e !== "object") return e;
  if((e.t === "main" || e.t === "weak") && erTrin(e.v)) return { ...e, v: nytIndeks(e.v, e.t) };
  if((e.t === "undo" || e.t === "correct") && (e.stige === "main" || e.stige === "weak")){
    const x = { ...e };
    if(erTrin(e.fra)) x.fra = nytAntal(e.fra, e.stige);
    if(erTrin(e.til)) x.til = nytAntal(e.til, e.stige);
    return x;
  }
  return e;
}

// Staar de nye stiger i index.html? Ellers er vaerktoejet skrevet til en anden udgave.
function tjekIndex(html){
  const liste = navn => {
    const m = new RegExp("\\nconst " + navn + " = \\[([^\\]]*)\\];").exec(html);
    return m ? JSON.stringify(m[1].split(",").map(x => Number(x.trim()))) : null;
  };
  const fejl = [];
  if(liste("JUGGLE_MAIN") !== JSON.stringify(NEW_MAIN)) fejl.push("JUGGLE_MAIN i index.html er ikke " + JSON.stringify(NEW_MAIN));
  if(liste("JUGGLE_WEAK") !== JSON.stringify(NEW_WEAK)) fejl.push("JUGGLE_WEAK i index.html er ikke " + JSON.stringify(NEW_WEAK));
  return fejl;
}

async function omlaeg(db, { udfoer = false, FieldValue } = {}){
  const [stiger, logs] = await Promise.all(['juggleLadder', 'juggleLog'].map(async n =>
    new Map((await db.collection(n).get()).docs.map(d => [d.id, d]))));
  const koersel = await db.collection(KOERSEL[0]).doc(KOERSEL[1]).get();
  const r = { stiger: stiger.size, logs: logs.size, stigeAendres: [], logAendres: [], sprungetStige: [], sprungetLog: [],
    ugyldige: [], uaendret: 0, skrevet: 0, alleredeKoert: koersel.exists ? (koersel.get('fra') || '?') : null };
  if(r.alleredeKoert){
    r.sprungetStige = [...stiger.keys()];
    r.sprungetLog = [...logs.keys()];
    return r;
  }
  const skriv = [];
  for(const id of new Set([...stiger.keys(), ...logs.keys()])){
    const stige = stiger.get(id)?.data() || null, log = logs.get(id)?.data() || null;
    const logRef = db.collection('juggleLog').doc(id);
    const logSkriv = {};

    // 1. Fremdriften paa juggleLadder.
    if(stige){
      if(log && log.stigeFoer) r.sprungetStige.push(id);
      else {
        const nyt = {}, foer = {};
        for(const [felt, art] of [['mainStep', 'main'], ['weakStep', 'weak']]){
          if(!(felt in stige)) continue;
          if(!erTrin(stige[felt])){ r.ugyldige.push(id + ' ' + felt + '=' + JSON.stringify(stige[felt])); continue; }
          const ny = nytAntal(stige[felt], art);
          if(ny !== stige[felt]){ nyt[felt] = ny; foer[felt] = stige[felt]; }
        }
        if(Object.keys(nyt).length){
          r.stigeAendres.push({ id, mainStep: 'mainStep' in nyt ? [foer.mainStep, nyt.mainStep] : null,
            weakStep: 'weakStep' in nyt ? [foer.weakStep, nyt.weakStep] : null });
          skriv.push(b => b.update(db.collection('juggleLadder').doc(id), nyt));
          logSkriv.stigeFoer = { mainStep: 'mainStep' in stige ? stige.mainStep : null, weakStep: 'weakStep' in stige ? stige.weakStep : null,
            omlagt: FieldValue ? FieldValue.serverTimestamp() : new Date(), fra: FRA };
        }
      }
    }

    // 2. Loggen.
    if(log && Array.isArray(log.entries)){
      if(log.entriesFoer) r.sprungetLog.push(id);
      else {
        const nye = log.entries.map(nyPost);
        const aendret = nye.filter((e, i) => JSON.stringify(e) !== JSON.stringify(log.entries[i])).length;
        if(aendret){
          r.logAendres.push({ id, poster: log.entries.length, aendret });
          logSkriv.entries = nye;
          logSkriv.entriesFoer = log.entries;
        }
      }
    }

    if(Object.keys(logSkriv).length){
      // Findes loggen ikke endnu, faar den aargang og koen fra stigen - ellers kan
      // traenerne ikke laese den (logLaeser i firestore.rules).
      if(!log && stige) Object.assign(logSkriv, { year: stige.year ?? null, gender: stige.gender ?? null });
      skriv.push(b => b.set(logRef, logSkriv, { merge: true }));
    } else if(!r.sprungetStige.includes(id) && !r.sprungetLog.includes(id)) r.uaendret++;
  }

  if(udfoer){
    // Stige og log for samme barn i samme batch: enten er begge omlagt (med kopi), eller ingen.
    skriv.push(b => b.set(db.collection(KOERSEL[0]).doc(KOERSEL[1]), { fra: FRA, omlagt: FieldValue ? FieldValue.serverTimestamp() : new Date(),
      stiger: r.stigeAendres.length, logs: r.logAendres.length }));
    for(let i = 0; i < skriv.length; i += 400){
      const b = db.batch();
      skriv.slice(i, i + 400).forEach(f => f(b));
      await b.commit();
      r.skrevet += Math.min(400, skriv.length - i);
    }
  }
  return r;
}

// Til udskrift: kun id'er og tal.
function resume(r, udfoer){
  const ville = udfoer ? '' : ' (ville blive)';
  const par = p => p ? p[0] + ' -> ' + p[1] : '-';
  if(r.alleredeKoert) return [
    `Omlaegningen er allerede koert (${r.alleredeKoert}, se stigeOmlaegning/koersel). Intet roeres.`,
    `Sprunget over: ${r.sprungetStige.length} stiger, ${r.sprungetLog.length} logge`,
    ...r.sprungetStige.map(id => `  sprunget over: ${id}`)
  ].join('\n');
  return [
    `Stiger: ${r.stiger} · logge: ${r.logs} · uaendret: ${r.uaendret}`,
    `Stiger${ville} omlagt: ${r.stigeAendres.length} · logge${ville} omlagt: ${r.logAendres.length}`,
    `Allerede omlagt og sprunget over: ${r.sprungetStige.length} stiger, ${r.sprungetLog.length} logge`,
    ...r.stigeAendres.map(x => `  stige ${x.id}: mainStep ${par(x.mainStep)} · weakStep ${par(x.weakStep)}`),
    ...r.logAendres.map(x => `  log   ${x.id}: ${x.aendret} af ${x.poster} poster aendret`),
    ...r.sprungetStige.map(id => `  sprunget over (stigeFoer findes): ${id}`),
    ...r.sprungetLog.map(id => `  sprunget over (entriesFoer findes): ${id}`),
    ...r.ugyldige.map(x => `  UGYLDIGT, ikke roert: ${x}`)
  ].join('\n');
}

module.exports = { OLD_MAIN, OLD_WEAK, NEW_MAIN, NEW_WEAK, FRA, KOERSEL, nytAntal, nytIndeks, nyPost, tjekIndex, omlaeg, resume };
