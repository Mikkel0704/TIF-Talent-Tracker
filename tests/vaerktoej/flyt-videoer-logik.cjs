// Flytter videolinks fra indsendelserne over i submissionVideos, og rydder filer, der
// ikke hoerer til nogen indsendelse. Logikken ligger her for sig, saa den kan proeves
// mod emulatoren (tests/regler/flytning.test.mjs), foer den roerer rigtige data.
//
// Begge funktioner AENDRER INTET, medmindre udfoer er sand. De returnerer, hvad de
// ville goere, saa en toerkoersel kan laeses igennem foerst.

async function flytVideoer(db, { udfoer = false, FieldValue }) {
  const rapport = { flyttet: [], ryddet: [], sprunget: [], fandtesAllerede: [] };
  const subs = await db.collection('submissions').get();
  for (const d of subs.docs) {
    const s = d.data();
    const harFelter = 'videoURL' in s || 'videoPath' in s;
    if (!harFelter) continue;
    const linkRef = db.collection('submissionVideos').doc(d.id);
    const levende = typeof s.videoURL === 'string' && s.videoURL && typeof s.videoPath === 'string' && s.videoPath;
    if (levende) {
      if ((await linkRef.get()).exists) {
        rapport.fandtesAllerede.push(d.id);
      } else {
        const link = {
          playerId: s.playerId, year: s.year, gender: s.gender ?? null,
          videoURL: s.videoURL, videoPath: s.videoPath,
          challengeId: s.challengeId ?? null, challengerId: s.challengerId ?? null, opponentId: s.opponentId ?? null,
          // Foer flytningen kunne duel-modparten se videoen, saa snart den ikke laengere
          // var "pending". Det er netop dét, "decided" betyder nu.
          decided: s.status !== 'pending',
          submittedAt: s.submittedAt ?? null,
          createdAt: s.createdAt ?? null
        };
        if (s.viewedAt) link.viewedAt = s.viewedAt;
        if (!link.playerId || !link.year) { rapport.sprunget.push({ id: d.id, grund: 'mangler playerId eller year' }); continue; }
        if (udfoer) await linkRef.set(link);
        rapport.flyttet.push(d.id);
      }
    } else {
      rapport.ryddet.push(d.id);   // linket var allerede slettet; kun de tomme felter fjernes
    }
    // Linket fjernes FOERST fra indsendelsen, naar det ligger sikkert det nye sted.
    if (udfoer) await d.ref.update({ videoURL: FieldValue.delete(), videoPath: FieldValue.delete() });
  }
  return rapport;
}

// En fil er foraeldreloes, naar ingen submissionVideos peger paa den. Det sker, naar en
// upload lykkedes, men registreringen bagefter blev afvist. Filer under et doegn gamle
// roeres ikke: de kan vaere midt i en upload, hvor registreringen ikke er skrevet endnu.
async function rydForaeldreloese(db, bucket, { udfoer = false, nu = Date.now(), minAlderMs = 24 * 60 * 60 * 1000 }) {
  const kendte = new Set();
  (await db.collection('submissionVideos').get()).docs.forEach(d => { const p = d.data().videoPath; if (p) kendte.add(p); });
  // Under en toerkoersel er linkene ikke flyttet endnu, saa de gamle felter taeller med.
  (await db.collection('submissions').get()).docs.forEach(d => { const p = d.data().videoPath; if (p) kendte.add(p); });
  const [filer] = await bucket.getFiles({ prefix: 'submissions/' });
  const rapport = { iAlt: filer.length, beholdt: [], forNye: [], slettet: [], fejl: [] };
  for (const f of filer) {
    if (kendte.has(f.name)) { rapport.beholdt.push(f.name); continue; }
    const oprettet = new Date(f.metadata?.timeCreated || 0).getTime();
    if (nu - oprettet < minAlderMs) { rapport.forNye.push(f.name); continue; }
    try { if (udfoer) await f.delete(); rapport.slettet.push(f.name); }
    catch (e) { rapport.fejl.push({ fil: f.name, fejl: e.message }); }
  }
  return rapport;
}

module.exports = { flytVideoer, rydForaeldreloese };
