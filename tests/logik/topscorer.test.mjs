// Månedens topscorer: beregningen. Koden er den, serveren regner med: functions/byg.mjs
// skærer den ud af index.html og skriver logik/pointkode.mjs (npm run logik gør det først).
// Der regnes i dansk tid - den genererede fil sætter selv Europe/Copenhagen.
import * as K from "./pointkode.mjs";

let ok = 0, fejl = 0;
function t(navn, fik, vent){
  const a = JSON.stringify(fik), b = JSON.stringify(vent);
  if(a === b){ ok++; console.log("  ok   " + navn); }
  else { fejl++; console.log("  FEJL " + navn + "\n         fik:      " + a + "\n         ventede:  " + b); }
}
const afsnit = s => console.log("\n" + s);
const DEC = "2026-12", NOV = "2026-11";
const dag = (n, m = DEC) => `${m}-${String(n).padStart(2, "0")}`;
const kl = (iso, tid = "10:00:00") => `${iso}T${tid}+01:00`;            // dansk vintertid
// Et barn: {id, year?, gender?, dage?: {dato: {kode: antal}}, jokers?, stige?: {mainStep, weakStep, tricks}, log?: [...], medaljer?: [...]}
// Medaljer: [{point, godkendt, status?}] - godkendt er reviewedAt (tekst eller et Timestamp-agtigt objekt).
function saet(boern){
  K.saetAlleBoern({
    spillere: boern.map(b => ({ id: b.id, name: "Navn " + b.id, year: b.year || "2017", gender: b.gender || "dreng" })),
    fodteknik: boern.filter(b => b.dage || b.jokers).map(b => ({ id: b.id, days: b.dage || {}, jokers: b.jokers || {} })),
    stiger: boern.filter(b => b.stige).map(b => ({ id: b.id, ...b.stige })),
    stigelogge: boern.filter(b => b.log).map(b => ({ id: b.id, entries: b.log })),
    indsendelser: boern.flatMap(b => (b.medaljer || []).map(m => ({ playerId: b.id, status: m.status || "approved", reviewedAt: m.godkendt, pointsAwarded: m.point })))
  });
}
// Rangér én årgang (2017) i en måned. udelukkede: Månedens spillers vindere.
function kaar(boern, { maaned = DEC, udelukkede = [] } = {}){
  saet(boern);
  const res = K.maanedensTopscorerRangering(boern.filter(b => (b.year || "2017") === "2017").map(b => ({ id: b.id, name: "Navn " + b.id })), maaned, udelukkede);
  return { vindere: res.vindere.map(v => v.id), res };
}
const stat = (boern, id, maaned = DEC) => { saet(boern); const s = K.maanedTopscorerStat(id, maaned); return s; };
const tal = s => [s.point, s.oevelser, s.svaer, s.mellem, s.let, s.starter];
const medalje = (point, godkendt, status) => ({ point, godkendt, status });

// -------------------------------------------------------------------------------------
afsnit("Point i måneden: medaljer efter godkendelsesdatoen");
const tidsstempel = iso => ({ toDate: () => new Date(iso) });
let s = stat([{ id: "A", medaljer: [
  medalje(25, kl("2026-12-01", "00:00:00")),          // første sekund i december
  medalje(40, kl("2026-11-30", "23:59:59")),          // sidste sekund i november
  medalje(35, tidsstempel(kl("2026-12-31", "23:59:59"))),   // som et Firestore-tidsstempel
  medalje(80, kl("2027-01-01", "00:00:00")),          // januar
  medalje(50, kl("2026-12-10"), "pending")            // ikke godkendt
] }, { id: "B", medaljer: [medalje(70, kl("2026-12-10"))] }], "A");
t("december: 25 + 35 - ikke november, januar eller en medalje, der venter", s.point, 60);
t("en medalje er ingen øvelse", s.oevelser, 0);
t("november får den, der blev godkendt 30/11 kl. 23:59:59", K.maanedTopscorerStat("A", NOV).point, 40);
t("dansk tid: 1/12 kl. 00:00 dansk tid er 30/11 kl. 23:00 UTC - og tæller i december",
  stat([{ id: "A", medaljer: [medalje(10, "2026-11-30T23:00:00Z"), medalje(1, "2026-11-30T22:59:59Z")] }], "A").point, 10);

afsnit("Point i måneden: Jongleringsstigen efter loggens dato");
const stigebarn = { id: "A", stige: { mainStep: 3, weakStep: 1, tricks: ["oploft"] }, log: [
  { t: "main", v: 1, at: kl(dag(16)) },                // samme trin igen efter en fortrydelse
  { t: "trick", v: "oploft", at: kl(dag(12)) },
  { t: "weak", v: 0, at: kl(dag(12)) },
  { t: "main", v: 3, at: kl(dag(8)) },                 // ikke en del af fremdriften (mainStep 3)
  { t: "main", v: 2, at: kl(dag(3)) },
  { t: "main", v: 1, at: kl(dag(1)) },
  { t: "main", v: 0, at: kl("2026-11-28") }
] };
s = stat([stigebarn], "A");
t("december: hovedtrin 2 og 3 (5 + 5), dårligt ben trin 1 (5) og Opløft (10) = 25", s.point, 25);
t("øvelser: 3 trin - hvert trin én gang, intet trick, intet trin uden for fremdriften", s.oevelser, 3);
t("november: hovedtrin 1 (5 point, 1 trin)", tal(K.maanedTopscorerStat("A", NOV)).slice(0, 2), [5, 1]);
t("et trin, der er registreret i både november og december, tæller i december - ikke i begge",
  (() => { const b = { id: "A", stige: { mainStep: 1 }, log: [{ t: "main", v: 0, at: kl(dag(5)) }, { t: "main", v: 0, at: kl("2026-11-05") }] };
    return [tal(stat([b], "A")).slice(0, 2), tal(K.maanedTopscorerStat("A", NOV)).slice(0, 2)]; })(), [[5, 1], [0, 0]]);
t("rettes stigen ned, tæller de fjernede trin ikke længere",
  tal(stat([{ ...stigebarn, stige: { mainStep: 1, weakStep: 0, tricks: [] } }], "A")).slice(0, 2), [0, 0]);

afsnit("Point i måneden: fodteknik med kombi og streak, som \"Denne måned\"");
s = stat([{ id: "A", dage: { [dag(1)]: { t: 3 } } }], "A");
t("3 × toe-taps: 3 × 2 + 5 (samme øvelse 3 gange) = 11 point, 3 øvelser, 3 starter", tal(s), [11, 3, 0, 0, 0, 3]);
s = stat([{ id: "A", dage: { [dag(1)]: { t: 1, p: 1, v: 1, k: 1 } } }], "A");
t("én fra hvert niveau: 2 + 3 + 4 + 5 + 7 = 21 point, én af hver", tal(s), [21, 4, 1, 1, 1, 1]);
s = stat([{ id: "A", dage: { [dag(1)]: { t: 1 }, [dag(2)]: { t: 1 }, [dag(3)]: { t: 1 } } }], "A");
t("tre dage i træk: 3 × 2 + streak-bonus 5 = 11 (Månedens spiller tæller ikke streak, topscoreren gør)", s.point, 11);
s = stat([{ id: "A", dage: { "2026-11-29": { t: 1 }, "2026-11-30": { t: 1 }, [dag(1)]: { t: 1 } } }], "A");
t("streak-bonussen hører til den dag, milepælen blev nået: 1/12 giver 2 + 5 i december", s.point, 7);
t("og november får kun dagenes egne point", K.maanedTopscorerStat("A", NOV).point, 4);
s = stat([{ id: "A", dage: { [dag(1)]: { t: 1 } }, stige: { mainStep: 2 }, log: [{ t: "main", v: 1, at: kl(dag(3)) }, { t: "main", v: 0, at: kl(dag(2)) }] }], "A");
t("stigens dage tæller som aktive dage i streaken, som i appen: 2 + 5 + 5 + 5 (streak) = 17, 3 øvelser", tal(s).slice(0, 2), [17, 3]);
s = stat([{ id: "A", dage: { [dag(31)]: { t: 1 }, "2027-01-01": { t: 2 }, "2026-11-30": { t: 4 } } }], "A");
t("dage før og efter måneden tæller ikke - 31/12 gør", tal(s).slice(0, 2), [2, 1]);

afsnit("Det er det tal, \"Denne måned\" viste for en afsluttet måned");
{
  const boern = [{ ...stigebarn, dage: { [dag(4)]: { t: 3, v: 1 }, [dag(5)]: { k: 2 }, [dag(6)]: { j: 1 } },
    medaljer: [medalje(25, kl(dag(20))), medalje(40, kl("2026-11-20"))] }];
  saet(boern);
  const slut = new Date(2026, 11, 31, 23, 59, 59);
  const denneMaaned = K.pointsInWindow("A", K.startOfMonth(slut)) + K.ladderPointsInWindow("A", K.startOfMonth(slut)) + K.footworkPointsInWindow("A", K.startOfMonth(slut));
  t("31/12 kl. 23:59: \"Denne måned\" = topscorerens december", K.maanedTopscorerStat("A", DEC).point, denneMaaned);
  t("og tallet er lagt sammen af medalje (25), stige (25) og fodteknik (35 med kombi og streak)", denneMaaned, 85);
}

afsnit("Godkendte jokere");
s = stat([{ id: "A", dage: { [dag(1)]: { t: 2 }, [dag(2)]: { t: 3 } }, jokers: { [dag(2)]: "approved" } }], "A");
t("en dag med en godkendt joker giver 0 point og 0 øvelser", tal(s), [4, 2, 0, 0, 0, 2]);
s = stat([{ id: "A", dage: { [dag(1)]: { t: 2 }, [dag(2)]: { t: 1 } }, jokers: { [dag(2)]: "rejected" } }], "A");
t("en afvist joker tæller som en almindelig dag", tal(s).slice(0, 2), [6, 3]);

afsnit("Version 1 og version 2 i samme måned (november)");
s = stat([{ id: "A", dage: { "2026-11-10": { t: 1, j: 1, v: 1 }, "2026-11-20": { t: 1, j: 1 } } }], "A", NOV);
// 10/11 (version 1): toe-taps var let, V-rul mellem og jongleringstræning havde sin egen takst (8).
// 20/11 (version 2): toe-taps er starter, jongleringstræning er grundtræning.
t("version 1-dag: toe-taps er let og jongleringstræning svær; version 2-dag: toe-taps starter, grundtræning svær",
  tal(s).slice(1), [5, 2, 1, 1, 1]);
saet([{ id: "A", dage: { "2026-11-10": { t: 1, j: 1, v: 1 }, "2026-11-20": { t: 1, j: 1 } } }]);
t("pointene er dagenes egne (som appen regner dem pr. version)", s.point,
  K.footworkPointsInWindow("A", new Date(2026, 10, 1)) - K.footworkPointsInWindow("A", new Date(2026, 11, 1)));

afsnit("Rangering og lige stilling, trin for trin");
t("flest point vinder", kaar([{ id: "A", dage: { [dag(1)]: { k: 1 } } }, { id: "B", dage: { [dag(1)]: { v: 1 } } }]).vindere, ["A"]);
let r = kaar([{ id: "A", dage: { [dag(1)]: { t: 1, s: 1, d: 1 } } }, { id: "B", dage: { [dag(1)]: { p: 2 } } }]);
t("1: lige point (6), flest øvelser vinder: A med 3 starter mod B med 2 lette", r.vindere, ["A"]);
t("1: tallene", r.res.rangliste.map(x => [x.id, x.point, x.oevelser]), [["A", 6, 3], ["B", 6, 2]]);
r = kaar([{ id: "A", dage: { [dag(1)]: { t: 1 } }, stige: { mainStep: 1 }, log: [{ t: "main", v: 0, at: kl(dag(9)) }] },
          { id: "B", dage: { [dag(1)]: { t: 1 } }, medaljer: [medalje(5, kl(dag(9)))] }]);
t("1: et trin på stigen er en øvelse - A (starter + trin = 7) mod B (starter + medalje 5 = 7): A vinder på øvelser", r.vindere, ["A"]);
r = kaar([{ id: "A", dage: { [dag(1)]: { k: 1, t: 1 } } }, { id: "B", dage: { [dag(1)]: { v: 1, p: 1 } } }]);
t("2: lige point (7) og øvelser (2), flest svære vinder", r.vindere, ["A"]);
r = kaar([{ id: "A", dage: { [dag(1)]: { v: 1 } }, medaljer: [medalje(1, kl(dag(9)))] }, { id: "B", dage: { [dag(1)]: { p: 1 } }, medaljer: [medalje(2, kl(dag(9)))] }]);
t("3: lige point (5), øvelser (1) og svære (0), flest mellem vinder", r.vindere, ["A"]);
r = kaar([{ id: "A", dage: { [dag(1)]: { t: 1 } }, medaljer: [medalje(3, kl(dag(9)))] }, { id: "B", dage: { [dag(1)]: { p: 1 } }, medaljer: [medalje(2, kl(dag(9)))] }]);
t("4: lige på point, øvelser, svære og mellem, flest lette vinder", r.vindere, ["B"]);
r = kaar([{ id: "A", stige: { mainStep: 1 }, log: [{ t: "main", v: 0, at: kl(dag(9)) }] }, { id: "B", dage: { [dag(1)]: { t: 1 } }, medaljer: [medalje(3, kl(dag(9)))] }]);
t("5: lige på alt til og med lette, flest starter vinder (et trin er hverken svær, mellem, let eller starter)", r.vindere, ["B"]);
r = kaar([{ id: "zz", dage: { [dag(1)]: { k: 2, t: 1 } } }, { id: "bb", dage: { [dag(2)]: { k: 2, t: 1 } } }, { id: "mm", dage: { [dag(1)]: { k: 2 } } }]);
t("6: helt lige - prisen deles, ordnet efter id", r.vindere, ["bb", "zz"]);
t("tre lige deler", kaar([{ id: "A", dage: { [dag(1)]: { t: 1 } } }, { id: "B", dage: { [dag(2)]: { t: 1 } } }, { id: "C", dage: { [dag(3)]: { t: 1 } } }]).vindere, ["A", "B", "C"]);

afsnit("Grundtræning og version 1's jongleringstræning tæller som svær");
r = kaar([{ id: "A", dage: { [dag(1)]: { j: 1 } } }, { id: "B", dage: { [dag(1)]: { k: 1 } } }, { id: "C", dage: { [dag(1)]: { v: 1 } }, medaljer: [medalje(1, kl(dag(9)))] }]);
t("grundtræning (5 point) og en svær (5 point) er helt lige - og foran en mellem med samme point", r.vindere, ["A", "B"]);
t("grundtræning står som svær", tal(r.res.rangliste.find(x => x.id === "A")), [5, 1, 1, 0, 0, 0]);
t("alle fire grundtræninger tæller som svær", tal(stat([{ id: "A", dage: { [dag(1)]: { j: 1, m: 1, n: 1, g: 1 } } }], "A")).slice(1), [4, 4, 0, 0, 0]);
t("jongleringstræning på en version 1-dag tæller som svær (ikke mellem, som dens grad var)",
  tal(stat([{ id: "A", dage: { "2026-11-10": { j: 1 } } }], "A", NOV)), [8, 1, 1, 0, 0, 0]);
t("en anden version 1-mellem (V-rul) er stadig mellem", tal(stat([{ id: "A", dage: { "2026-11-10": { v: 1 } } }], "A", NOV)).slice(1), [1, 0, 1, 0, 0]);

afsnit("Månedens spiller kan ikke også være topscorer");
const tre = [{ id: "A", dage: { [dag(1)]: { k: 3 } } }, { id: "B", dage: { [dag(1)]: { k: 2 } } }, { id: "C", dage: { [dag(1)]: { k: 1 } } }];
r = kaar(tre, { udelukkede: ["A"] });
t("A har flest point, men er Månedens spiller -> B er topscorer", r.vindere, ["B"]);
t("A står stadig i ranglisten og som udelukket", [r.res.rangliste.map(x => x.id), r.res.udelukket], [["A", "B", "C"], ["A"]]);
t("delt Månedens spiller (A og B): begge udelukkes -> C", kaar(tre, { udelukkede: ["A", "B"] }).vindere, ["C"]);
t("er Månedens spiller ikke nr. 1, vinder nr. 1", kaar(tre, { udelukkede: ["C"] }).vindere, ["A"]);
t("deler nr. 2 og 3, når nr. 1 udelukkes, deler de",
  kaar([{ id: "A", dage: { [dag(1)]: { k: 3 } } }, { id: "B", dage: { [dag(1)]: { k: 1 } } }, { id: "C", dage: { [dag(2)]: { k: 1 } } }], { udelukkede: ["A"] }).vindere, ["B", "C"]);
t("ingen andre har point -> ingen topscorer", kaar([{ id: "A", dage: { [dag(1)]: { k: 3 } } }, { id: "B" }], { udelukkede: ["A"] }).vindere, []);
t("ingen har point -> ingen topscorer", kaar([{ id: "A" }, { id: "B", dage: { [dag(1)]: { t: 1 } }, jokers: { [dag(1)]: "approved" } }]).vindere, []);
t("0 point er ingen kandidat - heller ikke uden konkurrenter", kaar([{ id: "A", dage: { "2026-11-02": { t: 1 } } }]).res.rangliste, []);

afsnit("Samme topscorer flere måneder i træk");
{
  const boern = [{ id: "A", dage: { "2026-11-02": { k: 3 }, [dag(2)]: { k: 3 } } }, { id: "B", dage: { "2026-11-03": { t: 1 }, [dag(3)]: { t: 1 } } }];
  t("A vinder november og december - der er ingen regel om to i træk",
    [kaar(boern, { maaned: NOV }).vindere, kaar(boern, { maaned: DEC }).vindere], [["A"], ["A"]]);
}

afsnit("Drenge og piger sammen");
r = kaar([{ id: "A", gender: "dreng", dage: { [dag(1)]: { t: 1 } } }, { id: "B", gender: "pige", dage: { [dag(1)]: { k: 1 } } }]);
t("pigen B vinder over drengen A i samme årgang", r.vindere, ["B"]);
t("den gemte vinder har netop id, navn, point, øvelser, svær, mellem, let og starter - i den orden",
  K.topscorerVinder(r.vindere.length ? r.res.vindere[0] : {}), { id: "B", navn: "Navn B", point: 5, oevelser: 1, svaer: 1, mellem: 0, let: 0, starter: 0 });

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
