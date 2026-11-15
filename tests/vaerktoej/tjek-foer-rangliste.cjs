// Laeser kun. Koeres med en frisk noegle, FOER de strammede regler rulles ud: de nye
// regler og den nye app forudsaetter nogle ting om de rigtige data, og er de ikke
// opfyldt, mister et barn sin rangliste eller en duel sin modpart.
// Der skrives ingen navne eller e-mails ud - kun antal og dokument-id'er.
//
//   node vaerktoej/tjek-foer-rangliste.cjs
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const noegle = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(noegle)) { console.error('Mangler tests/service-account.json'); process.exit(1); }
const db = getFirestore(initializeApp({ credential: cert(require(noegle)) }));
const aar = v => { const s = String(v ?? ''); return /^\d{4}$/.test(s) ? s : null; };

(async () => {
  const hent = async n => (await db.collection(n).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const [users, players, subs, chs, linjer, mirror] = await Promise.all(['users', 'players', 'submissions', 'challenges', 'rangliste', 'clubRanking'].map(hent));
  const sp = new Map(players.map(p => [p.id, p]));
  let fejl = 0;
  const vis = (tekst, liste, alvorlig = true) => { if (liste.length && alvorlig) fejl += liste.length; console.log(`${liste.length ? (alvorlig ? 'FEJL ' : 'NB   ') : 'ok   '} ${tekst}: ${liste.length}${liste.length ? '  -> ' + liste.slice(0, 12).join(' ') : ''}`); };

  const spillerlogins = users.filter(u => u.role === 'player' && u.active !== false);
  console.log(`spillerlogins (aktive): ${spillerlogins.length} · spillere: ${players.length} · indsendelser: ${subs.length} · dueller: ${chs.length} · ranglistelinjer: ${linjer.length}`);
  // 1. Reglerne giver et spillerlogin sin aargangs linjer ud fra users.years, og sit eget
  //    dokument ud fra users.playerId.
  vis('spillerlogin uden playerId', spillerlogins.filter(u => typeof u.playerId !== 'string' || !u.playerId).map(u => u.id));
  vis('spillerlogin, hvis spiller ikke findes', spillerlogins.filter(u => typeof u.playerId === 'string' && u.playerId && !sp.has(u.playerId)).map(u => u.id));
  vis('spillerlogin, hvis years ikke rummer spillerens aargang (ranglisten ville vaere tom)', spillerlogins.filter(u => sp.has(u.playerId) && !(Array.isArray(u.years) && u.years.map(String).includes(aar(sp.get(u.playerId).year) || '?'))).map(u => u.id));
  vis('spillerlogin med mere end én aargang', spillerlogins.filter(u => Array.isArray(u.years) && u.years.length > 1).map(u => u.id), false);
  vis('spillerlogin med koensbegraensning (yearGenders)', spillerlogins.filter(u => u.yearGenders && Object.keys(u.yearGenders).length).map(u => u.id), false);
  // 2. Serveren skriver aargangen som fire cifre; ellers finder forespoergslen ikke linjen.
  vis('spiller med aargang i andet format end fire cifre', players.filter(p => !aar(p.year)).map(p => p.id));
  vis('spillere, der kan udfordres (hasActiveLogin)', players.filter(p => p.hasActiveLogin === true).map(p => p.id), false);
  // 3. En spiller finder modpartens indsendelse i en duel paa challengerId/opponentId.
  const duelSubs = subs.filter(s => s.challengeId);
  vis('duel-indsendelse uden challengerId/opponentId (modparten ville ikke se den)', duelSubs.filter(s => !s.challengerId || !s.opponentId).map(s => s.id));
  vis('duel uden challengerId/opponentId', chs.filter(c => !c.challengerId || !c.opponentId).map(c => c.id));
  // 4. Klubbens top 10 regnes nu af players.points; foer af spejlet clubRanking.points.
  vis('boern, hvor det gamle spejl (clubRanking.points) afviger fra players.points', mirror.filter(m => sp.has(m.id) && (m.points || 0) !== (sp.get(m.id).points || 0)).map(m => `${m.id}:${m.points || 0}≠${sp.get(m.id).points || 0}`), false);
  // 5. Linjer, der allerede findes.
  vis('spillere uden ranglistelinje (forventet, foer genberegningen er koert)', players.filter(p => !linjer.some(l => l.id === p.id)).map(p => p.id), false);
  vis('ranglistelinje uden spiller', linjer.filter(l => !sp.has(l.id)).map(l => l.id));
  console.log(fejl ? `\n${fejl} ting skal rettes, foer reglerne rulles ud.` : '\nIntet staar i vejen for udrulningen.');
  process.exit(fejl ? 1 : 0);
})().catch(e => { console.error('FEJL:', e.message); process.exit(1); });
