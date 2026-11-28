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
// En dag efter i dag findes ikke endnu (footworkDays). Serverens ur saettes derfor til 10.
// februar 2027 - efter alle maanederne her - som serveren selv goer det med kaaringens nu.
K.saetNu("2027-02-10T12:00:00+01:00");
const DEC = "2026-12", NOV = "2026-11";
const dag = (n, m = DEC) => `${m}-${String(n).padStart(2, "0")}`;
const kl = (iso, tid = "10:00:00") => `${iso}T${tid}+01:00`;            // dansk vintertid
// Et barn: {id, year?, gender?, dage?: {dato: {kode: antal}}, jokers?, stige?: {mainStep, weakStep, tricks}, log?: [...], medaljer?: [...]}
// Medaljer: [{point, godkendt, status?}] - godkendt er reviewedAt (tekst eller et Timestamp-agtigt objekt).
function saet(boern){
  K.saetAlleBoern({
    spillere: boern.map(b => ({ id: b.id, name: "Navn " + b.id, year: b.year || "2017", gender: b.gender || "dreng", ...loginFelt(b) })),
    fodteknik: boern.filter(b => b.dage || b.jokers).map(b => ({ id: b.id, days: b.dage || {}, jokers: b.jokers || {} })),
    stiger: boern.filter(b => b.stige).map(b => ({ id: b.id, ...b.stige })),
    stigelogge: boern.filter(b => b.log).map(b => ({ id: b.id, entries: b.log })),
    indsendelser: boern.flatMap(b => (b.medaljer || []).map(m => ({ playerId: b.id, status: m.status || "approved", reviewedAt: m.godkendt, pointsAwarded: m.point })))
  });
}
// Kun børn med et aktivt login kan kåres (v15.87). Testenes børn har derfor
// hasActiveLogin: true, medmindre "login" står: login: false/"true"/1 sættes som det er,
// og login: UDEN betyder, at feltet slet ikke findes på spilleren.
const UDEN = Symbol("uden login-felt");
const loginFelt = b => !("login" in b) ? { hasActiveLogin: true } : b.login === UDEN ? {} : { hasActiveLogin: b.login };
// Rangér én årgang (2017) i en måned. udelukkede: Månedens spillers vindere.
function kaar(boern, { maaned = DEC, udelukkede = [] } = {}){
  saet(boern);
  const res = K.maanedensTopscorerRangering(boern.filter(b => (b.year || "2017") === "2017").map(b => ({ id: b.id, name: "Navn " + b.id, ...loginFelt(b) })), maaned, udelukkede);
  return { vindere: res.vindere.map(v => v.id), res };
}
const stat = (boern, id, maaned = DEC) => { saet(boern); const s = K.maanedTopscorerStat(id, maaned); return s; };
const tal = s => [s.point, s.oevelser, s.svaer, s.mellem, s.let, s.starter];
const medalje = (point, godkendt, status) => ({ point, godkendt, status });

// -------------------------------------------------------------------------------------
// Pointreglerne 2026-11-25: Talentmærkets point og duelpoint (submissions.pointsAwarded)
// tæller ikke - de står stadig i databasen, men giver 0 i måneden. Før gav de første tre
// tests her 60, 40 og 10.
afsnit("Point i måneden: Talentmærket og dueller giver ingen point");
const tidsstempel = iso => ({ toDate: () => new Date(iso) });
let s = stat([{ id: "A", medaljer: [
  medalje(25, kl("2026-12-01", "00:00:00")),          // første sekund i december
  medalje(40, kl("2026-11-30", "23:59:59")),          // sidste sekund i november
  medalje(35, tidsstempel(kl("2026-12-31", "23:59:59"))),   // som et Firestore-tidsstempel
  medalje(80, kl("2027-01-01", "00:00:00")),          // januar
  medalje(50, kl("2026-12-10"), "pending")            // ikke godkendt
] }, { id: "B", medaljer: [medalje(70, kl("2026-12-10"))] }], "A");
t("december: godkendte medaljer (25 + 35) giver 0 point", s.point, 0);
t("en medalje er ingen øvelse", s.oevelser, 0);
t("november: heller ikke den, der blev godkendt 30/11 kl. 23:59:59", K.maanedTopscorerStat("A", NOV).point, 0);
t("et barn med kun medaljer og dueller er ingen kandidat",
  kaar([{ id: "A", medaljer: [medalje(80, kl(dag(9))), medalje(25, kl(dag(10)))] }]).res.rangliste, []);

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
t("et trin, der er registreret i både november og december (fortrudt og taget igen), tæller i november, hvor det blev nået første gang - ikke i begge",
  (() => { const b = { id: "A", stige: { mainStep: 1 }, log: [{ t: "main", v: 0, at: kl(dag(5)) }, { t: "undo", stige: "main", fra: 1, til: 0, at: kl("2026-11-06") }, { t: "main", v: 0, at: kl("2026-11-05") }] };
    return [tal(stat([b], "A")).slice(0, 2), tal(K.maanedTopscorerStat("A", NOV)).slice(0, 2)]; })(), [[0, 0], [5, 1]]);
t("rettes stigen ned, tæller de fjernede trin ikke længere",
  tal(stat([{ ...stigebarn, stige: { mainStep: 1, weakStep: 0, tricks: [] } }], "A")).slice(0, 2), [0, 0]);
// Pointreglerne 2026-11-28: gemte udgåede id'er (inderside10/20, yderside10/20) tæller som
// Inderside 5/Yderside 5 efter loggens dato; Inderside 3/Yderside 3, som barnet kun har, fordi
// serien gøres hel, har ingen log-linje og giver intet i måneden. Tricks er aldrig øvelser.
const aliasbarn = { id: "A", stige: { mainStep: 1, tricks: ["inderside20", "yderside10", "inderside5"] }, log: [
  { t: "trick", v: "inderside20", at: kl(dag(14)) },
  { t: "trick", v: "yderside10", at: kl(dag(10)) },
  { t: "trick", v: "inderside5", at: kl("2026-11-25") },    // Inderside 5 blev nået i november
  { t: "main", v: 0, at: kl(dag(2)) }
] };
s = stat([aliasbarn], "A");
t("december: Yderside 5 (yderside10, 20) + trin 1 (5) = 25 - inderside20 er Inderside 5, nået i november", s.point, 25);
t("og øvelserne er kun trinnet - tricks (også de udgåede id'er) tæller ikke", s.oevelser, 1);
t("november: Inderside 5 (20), 0 øvelser", tal(K.maanedTopscorerStat("A", NOV)).slice(0, 2), [20, 0]);
t("i alt: trin 5 + Inderside 3 og 5 (35) + Yderside 3 og 5 (35) = 75", K.totalPoints({ id: "A" }), 75);
t("de samme tricks uden log giver 0 point og 0 øvelser i måneden",
  tal(stat([{ id: "A", stige: { tricks: ["inderside20", "yderside10", "haelbagom5"] } }], "A")).slice(0, 2), [0, 0]);

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
  const denneMaaned = K.rangPointIVindue("A", K.startOfMonth(slut));
  t("31/12 kl. 23:59: \"Denne måned\" = topscorerens december", K.maanedTopscorerStat("A", DEC).point, denneMaaned);
  t("og tallet er lagt sammen af stige (25) og fodteknik (35 med kombi og streak) - medaljen (25) tæller ikke", denneMaaned, 60);
  t("\"Denne måned\" er kun stige og fodteknik",
    denneMaaned, K.ladderPointsInWindow("A", K.startOfMonth(slut)) + K.footworkPointsInWindow("A", K.startOfMonth(slut)));
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
// (Før pointreglerne 2026-11-25 brugte flere af disse medaljepoint til at gøre pointene lige.
// Nu giver en medalje ingen point, så pointene gøres lige med tricks og kombier.)
r = kaar([{ id: "A", stige: { mainStep: 2 }, log: [{ t: "main", v: 1, at: kl(dag(9)) }, { t: "main", v: 0, at: kl(dag(9)) }] },
          { id: "B", stige: { tricks: ["skiftefod"] }, log: [{ t: "trick", v: "skiftefod", at: kl(dag(9)) }] }]);
t("1: et trin på stigen er en øvelse - A (to trin = 10) mod B (tricket Skiftefod = 10, ingen øvelse): A vinder på øvelser", r.vindere, ["A"]);
t("1: tallene", r.res.rangliste.map(x => [x.id, x.point, x.oevelser]), [["A", 10, 2], ["B", 10, 0]]);
r = kaar([{ id: "A", dage: { [dag(1)]: { k: 1, t: 1 } } }, { id: "B", dage: { [dag(1)]: { v: 1, p: 1 } } }]);
t("2: lige point (7) og øvelser (2), flest svære vinder", r.vindere, ["A"]);
r = kaar([{ id: "A", dage: { [dag(1)]: { v: 1, t: 1 } } }, { id: "B", dage: { [dag(1)]: { p: 2 } } }]);
t("3: lige point (6), øvelser (2) og svære (0), flest mellem vinder: A (mellem + starter) mod B (2 lette)", r.vindere, ["A"]);
t("3: tallene", r.res.rangliste.map(x => [x.id, ...tal(x)]), [["A", 6, 2, 0, 1, 0, 1], ["B", 6, 2, 0, 0, 2, 0]]);
// A: 5 starter = 10 + "samme øvelse 3 gange" (5) = 15. B: 5 lette = 15 uden kombi.
r = kaar([{ id: "A", dage: { [dag(1)]: { t: 3, s: 1, d: 1 } } }, { id: "B", dage: { [dag(1)]: { p: 2, y: 1, x: 1, r: 1 } } }]);
t("4: lige på point (15), øvelser (5), svære og mellem, flest lette vinder", r.vindere, ["B"]);
t("4: tallene", r.res.rangliste.map(x => [x.id, ...tal(x)]), [["B", 15, 5, 0, 0, 5, 0], ["A", 15, 5, 0, 0, 0, 5]]);
// A: 5 trin på stigen (3 på hovedstigen, 2 på dårligt ben) = 25. B: 5 starter (10) + kombi (5)
// + tricket Skiftefod (10) = 25. Alt på samme dag, så ingen får streak-bonus.
r = kaar([{ id: "A", stige: { mainStep: 3, weakStep: 2 }, log: [0, 1, 2].map(v => ({ t: "main", v, at: kl(dag(9)) })).concat([0, 1].map(v => ({ t: "weak", v, at: kl(dag(9)) }))) },
          { id: "B", dage: { [dag(9)]: { t: 3, s: 1, d: 1 } }, stige: { tricks: ["skiftefod"] }, log: [{ t: "trick", v: "skiftefod", at: kl(dag(9)) }] }]);
t("5: lige på alt til og med lette, flest starter vinder (et trin er hverken svær, mellem, let eller starter)", r.vindere, ["B"]);
t("5: tallene", r.res.rangliste.map(x => [x.id, ...tal(x)]), [["B", 25, 5, 0, 0, 0, 5], ["A", 25, 5, 0, 0, 0, 0]]);
r = kaar([{ id: "zz", dage: { [dag(1)]: { k: 2, t: 1 } } }, { id: "bb", dage: { [dag(2)]: { k: 2, t: 1 } } }, { id: "mm", dage: { [dag(1)]: { k: 2 } } }]);
t("6: helt lige - prisen deles, ordnet efter id", r.vindere, ["bb", "zz"]);
t("tre lige deler", kaar([{ id: "A", dage: { [dag(1)]: { t: 1 } } }, { id: "B", dage: { [dag(2)]: { t: 1 } } }, { id: "C", dage: { [dag(3)]: { t: 1 } } }]).vindere, ["A", "B", "C"]);

afsnit("Grundtræning og version 1's jongleringstræning tæller som svær");
r = kaar([{ id: "A", dage: { [dag(1)]: { j: 1 } } }, { id: "B", dage: { [dag(1)]: { k: 1 } } }, { id: "C", stige: { mainStep: 1 }, log: [{ t: "main", v: 0, at: kl(dag(1)) }] }]);
t("grundtræning (5 point) og en svær (5 point) er helt lige - og foran et trin på stigen med samme point og øvelser", r.vindere, ["A", "B"]);
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

afsnit("Kun børn med eget login kan vinde (v15.87)");
// players.hasActiveLogin skal være præcis true. A har flest point i alle tests her.
for(const [navn, login] of [["uden feltet", UDEN], ["false", false], ['"true" (tekst)', "true"], ["1", 1], ["null", null]]){
  r = kaar([{ id: "A", login, dage: { [dag(1)]: { k: 3 }, [dag(2)]: { k: 3 } } }, { id: "B", dage: { [dag(1)]: { t: 1 } } }]);
  t(`A med hasActiveLogin ${navn} og flest point taber til B med login og 2 point`, r.vindere, ["B"]);
  t(`A med hasActiveLogin ${navn} står ikke i ranglisten`, r.res.rangliste.map(x => x.id), ["B"]);
}
r = kaar([{ id: "A", login: false, stige: { mainStep: 3 }, log: [0, 1, 2].map(v => ({ t: "main", v, at: kl(dag(4)) })) },
          { id: "B", dage: { [dag(1)]: { t: 1 } } }, { id: "C", dage: { [dag(1)]: { k: 1 } } }, { id: "D", login: UDEN, dage: { [dag(1)]: { k: 2 } } }]);
t("blandet: den bedste MED login (C, 5 point) vinder - ikke A (stigen) eller D (10) uden login", r.vindere, ["C"]);
t("blandet: ranglisten er kun børnene med login, bedste først", r.res.rangliste.map(x => [x.id, x.point]), [["C", 5], ["B", 2]]);
r = kaar([{ id: "A", login: false, dage: { [dag(1)]: { k: 1 } } }, { id: "B", dage: { [dag(2)]: { k: 1 } } }]);
t("helt lige med et barn uden login: barnet med login vinder alene (ingen deling)", r.vindere, ["B"]);
r = kaar([{ id: "A", login: false, dage: { [dag(1)]: { k: 3 } } }, { id: "B", login: UDEN, dage: { [dag(1)]: { t: 1 } } }]);
t("ingen i årgangen har login -> ingen topscorer, tom rangliste, intet udelukket", [r.vindere, r.res.rangliste, r.res.udelukket], [[], [], []]);
{
  // Begge priser på samme data, som serveren og appen kårer dem: først Månedens spiller,
  // så topscoreren med Månedens spillers vindere udelukket.
  // A (login): flest dage og flest point -> Månedens spiller. B (uden login): næstflest point.
  // C (login): færre point end B -> topscorer. D (uden login): flere dage end C.
  const boern = [
    { id: "A", dage: { [dag(1)]: { k: 3 }, [dag(2)]: { k: 3 }, [dag(3)]: { k: 3 }, [dag(4)]: { k: 3 } } },
    { id: "B", login: false, dage: { [dag(1)]: { k: 3 }, [dag(2)]: { k: 3 } } },
    { id: "C", dage: { [dag(1)]: { k: 1 }, [dag(2)]: { t: 1 } } },
    { id: "D", login: UDEN, dage: { [dag(1)]: { t: 1 }, [dag(2)]: { t: 1 }, [dag(3)]: { t: 1 } } }];
  saet(boern);
  const iAargangen = boern.map(b => ({ id: b.id, name: "Navn " + b.id, year: "2017", ...loginFelt(b) }));
  const spiller = K.maanedensSpillerRangering(iAargangen, DEC, []);
  t("begge priser: Månedens spiller er A - D uden login og med flere dage end C er ikke med",
    [spiller.vindere.map(v => v.id), spiller.rangliste.map(x => x.id)], [["A"], ["A", "C"]]);
  const top = K.maanedensTopscorerRangering(iAargangen, DEC, spiller.vindere.map(v => v.id));
  t("begge priser: A er udelukket, B uden login springes over -> C er topscorer",
    [top.vindere.map(v => v.id), top.udelukket, top.rangliste.map(x => x.id)], [["C"], ["A"], ["A", "C"]]);
  const næste = K.maanedensSpillerRangering(iAargangen, DEC, ["A"]);
  t("begge priser: vandt A Månedens spiller sidste måned, får C den - ikke D uden login", næste.vindere.map(v => v.id), ["C"]);
  t("begge priser: og med C som Månedens spiller er A topscorer igen",
    K.maanedensTopscorerRangering(iAargangen, DEC, næste.vindere.map(v => v.id)).vindere.map(v => v.id), ["A"]);
  const kunA = boern.map(b => ({ id: b.id, name: "Navn " + b.id, year: "2017", ...(b.id === "A" ? { hasActiveLogin: true } : {}) }));
  t("begge priser: har kun A login, er A Månedens spiller, og der er ingen topscorer",
    [K.maanedensSpillerRangering(kunA, DEC, []).vindere.map(v => v.id), K.maanedensTopscorerRangering(kunA, DEC, ["A"]).vindere.map(v => v.id)], [["A"], []]);
}

afsnit("Talentmærket og dueller ændrer ikke topscoreren (pointreglerne 2026-11-25)");
{
  // B har færre point fra fodteknik end A, men en medalje (80) og en vundet duel (25) i
  // måneden - og 500 point på spillerdokumentet. Før havde B vundet med 107 mod 5.
  const boern = [{ id: "A", dage: { [dag(1)]: { k: 1 } } },
                 { id: "B", dage: { [dag(1)]: { t: 1 } }, medaljer: [medalje(80, kl(dag(5))), medalje(25, kl(dag(6)))] }];
  saet(boern);
  K.saetAlleBoern({
    spillere: boern.map(b => ({ id: b.id, name: "Navn " + b.id, year: "2017", gender: "dreng", points: b.id === "B" ? 500 : 0 })),
    fodteknik: boern.map(b => ({ id: b.id, days: b.dage })),
    indsendelser: boern.flatMap(b => (b.medaljer || []).map(m => ({ playerId: b.id, status: "approved", reviewedAt: m.godkendt, pointsAwarded: m.point })))
  });
  const res = K.maanedensTopscorerRangering(boern.map(b => ({ id: b.id, name: "Navn " + b.id, hasActiveLogin: true })), DEC, []);
  t("A (svær, 5 point) vinder over B (starter, 2 point + medalje 80 + duel 25 + 500 på spilleren)", res.vindere.map(v => v.id), ["A"]);
  t("B's point er kun fodteknikkens 2", res.rangliste.map(x => [x.id, x.point]), [["A", 5], ["B", 2]]);
  t("med A som Månedens spiller vinder B med sine 2 point - ikke 107",
    K.maanedensTopscorerRangering(boern.map(b => ({ id: b.id, name: "Navn " + b.id, hasActiveLogin: true })), DEC, ["A"]).vindere.map(v => [v.id, v.point]), [["B", 2]]);
}

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
