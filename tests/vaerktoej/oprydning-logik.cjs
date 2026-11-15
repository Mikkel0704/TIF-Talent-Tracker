// To oprydninger efter sikkerhedsgennemgangen (november 2026). Logikken ligger for sig, saa
// den kan proeves mod emulatoren (tests/regler/oprydning.test.mjs), foer den roerer rigtige
// data. Begge funktioner AENDRER INTET, medmindre udfoer er sand.

// 1. Indsendelser gemte loginnets e-mail i feltet submittedBy. Indsendelser laeses af hele
//    aargangen, og e-mailen er som regel en foraelders. Feltet fjernes; intet andet roeres.
async function fjernEmails(db, { udfoer = false, FieldValue }) {
  const rapport = { fjernet: [], uden: 0 };
  for (const d of (await db.collection('submissions').get()).docs) {
    if (!('submittedBy' in d.data())) { rapport.uden++; continue; }
    rapport.fjernet.push(d.id);
    if (udfoer) await d.ref.update({ submittedBy: FieldValue.delete() });
  }
  return rapport;
}

// 2. Originalerne af instruktionsvideoerne (usloeret, med lyd) blev gemt under originaler/,
//    da videoerne blev sloeret. En original slettes KUN, naar den sloerede fil, appen viser,
//    faktisk findes - ellers ville en fejl kunne efterlade en oevelse uden nogen video.
//    Filer under originaler/, som ingen plads henviser til, slettes ogsaa: de er kopier af
//    videoer, der allerede er skiftet ud eller slettet i appen.
async function sletOriginaler(db, bucket, { udfoer = false, FieldValue }) {
  const rapport = { slettet: [], beholdt: [], foraeldreloese: [], fejl: [] };
  const ref = db.collection('clubConfig').doc('guideVideos');
  const data = (await ref.get()).data() || {};
  const henvist = new Set();
  for (const [plads, v] of Object.entries(data)) {
    if (!v || typeof v !== 'object' || !v.original) continue;
    henvist.add(v.original);
    const [vistFindes] = v.sti ? await bucket.file(v.sti).exists() : [false];
    if (!vistFindes) { rapport.beholdt.push({ plads, grund: 'den sloerede fil findes ikke' }); continue; }
    rapport.slettet.push(v.original);
    if (!udfoer) continue;
    try {
      await bucket.file(v.original).delete({ ignoreNotFound: true });
      await ref.update({ [`${plads}.original`]: FieldValue.delete() });
    } catch (e) { rapport.fejl.push({ fil: v.original, fejl: e.message }); }
  }
  const [filer] = await bucket.getFiles({ prefix: 'originaler/' });
  for (const f of filer) {
    if (henvist.has(f.name)) continue;
    rapport.foraeldreloese.push(f.name);
    if (udfoer) { try { await f.delete({ ignoreNotFound: true }); } catch (e) { rapport.fejl.push({ fil: f.name, fejl: e.message }); } }
  }
  return rapport;
}

module.exports = { fjernEmails, sletOriginaler };
