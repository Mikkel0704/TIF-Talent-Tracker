// Pointreglerne 2026-11-25: Talentmærkets point og duelpoint tæller ingen steder. Ranglistens
// tal - i alt, denne uge, denne måned - og rangtrinnet er KUN Daglig fodteknik og
// Jongleringsstigen. De gamle tal står stadig i databasen (players.points,
// submissions.pointsAwarded) og må ikke tælle med.
// Koden er den, serveren regner med (logik/pointkode.mjs, skrevet af ../functions/byg.mjs),
// og rangtrinnene er dem, rang.test.mjs har skåret ud (logik/rangkode.mjs).
import * as K from "./pointkode.mjs";
import * as R from "./rangkode.mjs";

let ok = 0, fejl = 0;
function t(navn, fik, vent){
  const a = JSON.stringify(fik), b = JSON.stringify(vent);
  if(a === b){ ok++; console.log("  ok   " + navn); }
  else { fejl++; console.log("  FEJL " + navn + "\n         fik:      " + a + "\n         ventede:  " + b); }
}
const afsnit = s => console.log("\n" + s);
const kl = (iso, tid = "10:00:00") => `${iso}T${tid}+01:00`;            // dansk vintertid

// Torsdag 10. december 2026. Ugen begynder mandag 7/12, måneden 1/12.
const NU = new Date(kl("2026-12-10", "12:00:00"));
K.saetNu(NU);
const uge = K.startOfWeek(NU), maaned = K.startOfMonth(NU);

// Barnet X: 500 Talentmærke-point på spillerdokumentet og godkendte videoer og en vundet duel
// i denne uge, denne måned og sidste måned.
//   stigen:     hovedtrin 1 (5) 5/11, hovedtrin 2 (5) 3/12, Skiftefod (10) 9/12      = 20
//   fodteknik:  20/11 L+V-rul (svær, 5); 8/12 3 × toe-taps (3 × 2 + 5 i kombi = 11)   = 16
// Ingen tre dage i træk, så ingen streak-bonus.
const spiller = { id: "X", name: "X", year: "2017", gender: "dreng", points: 500 };
const indsendelser = [
  { playerId: "X", status: "approved", reviewedAt: kl("2026-12-09"), pointsAwarded: 80 },            // medalje i denne uge
  { playerId: "X", status: "approved", reviewedAt: kl("2026-12-02"), pointsAwarded: 25, challengeId: "c1" }, // duel i denne måned
  { playerId: "X", status: "approved", reviewedAt: { toDate: () => new Date(kl("2026-11-15")) }, pointsAwarded: 60 },
  { playerId: "X", status: "pending", pointsAwarded: 0 }
];
const data = {
  spiller,
  stige: { id: "X", mainStep: 2, tricks: ["skiftefod"], days: ["2026-11-05", "2026-12-03", "2026-12-09"] },
  stigelog: { id: "X", entries: [
    { t: "trick", v: "skiftefod", at: kl("2026-12-09") },
    { t: "main", v: 1, at: kl("2026-12-03") },
    { t: "main", v: 0, at: kl("2026-11-05") }
  ] },
  fodteknik: { id: "X", days: { "2026-11-20": { k: 1 }, "2026-12-08": { t: 3 } } },
  indsendelser
};

afsnit("Ranglistens tal er kun fodteknik og stige");
K.saetBarn(data);
t("stigen giver 20 og fodteknikken 16", [K.ladderPoints("X"), K.footworkPoints("X")], [20, 16]);
t("i alt: 36 - ikke 536 (de 500 Talentmærke-point på spilleren tæller ikke)", K.totalPoints(spiller), 36);
t("i alt er det samme med og uden players.points", K.totalPoints({ ...spiller, points: 0 }), K.totalPoints(spiller));
t("i alt tæller heller ikke indsendelsernes pointsAwarded (80 + 25 + 60)", K.totalPoints(spiller), K.ladderPoints("X") + K.footworkPoints("X"));
t("denne uge: Skiftefod (10) + toe-taps (11) = 21 - ikke medaljen på 80", K.rangPointIVindue("X", uge), 21);
t("denne måned: hovedtrin 2 (5) + Skiftefod (10) + toe-taps (11) = 26 - ikke medaljen (80) eller duellen (25)", K.rangPointIVindue("X", maaned), 26);
t("vinduet er netop stige + fodteknik", K.rangPointIVindue("X", maaned), K.ladderPointsInWindow("X", maaned) + K.footworkPointsInWindow("X", maaned));
K.saetBarn({ ...data, indsendelser: [] });
t("uden indsendelser er tallene de samme", [K.totalPoints(spiller), K.rangPointIVindue("X", uge), K.rangPointIVindue("X", maaned)], [36, 21, 26]);
K.saetBarn({ spiller, indsendelser });
t("et barn med kun medaljer, dueller og 500 på spilleren har 0 overalt",
  [K.totalPoints(spiller), K.rangPointIVindue("X", uge), K.rangPointIVindue("X", maaned)], [0, 0, 0]);
t("serverens kode har ikke længere pointsInWindow (indsendelsernes point)", typeof K.pointsInWindow, "undefined");

afsnit("Rangtrinnet følger det nye tal");
K.saetBarn(data);
t("X med 36 point er Debutant (med de 500 ville det have været Talent)", R.tierForPoints(K.totalPoints(spiller)).name, "Debutant");
t("næste trin for X er Klubspiller om 114 point", [R.nextTier(K.totalPoints(spiller)).name, R.nextTier(K.totalPoints(spiller)).min - K.totalPoints(spiller)], ["Klubspiller", 114]);
// Hele stigen (570, pointreglerne 2026-11-28) og hele medaljeforløbet (2325 på spilleren):
// Talent - ikke Superliga. Først de 14 nye tricks, så en gammel liste med alle 16 id'er fra
// 2026-11-23 - de udgåede tæller som deres alias, så det er den samme fulde stige.
const fuld = { id: "F", name: "F", year: "2017", points: 2325 };
K.saetBarn({ spiller: fuld, stige: { id: "F", mainStep: 16, weakStep: 12, tricks: ["oploft", "vrist", "skiftefod", "laarfod", "hoved", "gribfod", "inderside3", "yderside3", "haelbagom3", "jordenrundt", "hoved10", "inderside5", "yderside5", "haelbagom5"] } });
t("hele stigen er 570", K.totalPoints(fuld), 570);
K.saetBarn({ spiller: fuld, stige: { id: "F", mainStep: 16, weakStep: 12, tricks: ["oploft", "vrist", "skiftefod", "inderside5", "yderside5", "laarfod", "hoved", "gribfod", "inderside10", "yderside10", "haelbagom3", "jordenrundt", "hoved10", "inderside20", "yderside20", "haelbagom5"] } });
t("og en gammel fuld liste (16 id'er) er også 570", K.totalPoints(fuld), 570);
t("hele stigen + alle medaljer er Talent - medaljerne løfter ikke", R.tierForPoints(K.totalPoints(fuld)).name, "Talent");

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
