// Trin 2: øvelseskataloget. Navne, rækkefølge, kategorier og tekster holdes op mod
// kataloget, som det blev bestilt - ordret - så en tastefejl i en beskrivelse ikke slipper igennem.
import * as K from "./kode.mjs";

let ok = 0, fejl = 0;
function t(navn, fik, vent){
  const a = JSON.stringify(fik), b = JSON.stringify(vent);
  if(a === b){ ok++; console.log("  ok   " + navn); }
  else { fejl++; console.log("  FEJL " + navn + "\n         fik:      " + a + "\n         ventede:  " + b); }
}
const afsnit = s => console.log("\n" + s);
const V2 = K.FOOTWORK_V2_FRA, GAMMEL = K.isoPlus(V2, -1);

// Kataloget, som det blev bestilt. [navn, tekst, fokus eller null, udstyr eller null]
const BESTILT = {
  starter: [
    ["Toe-taps", "Skiftevis tæer let på toppen af bolden.", "Let på fødderne, højt tempo.", null],
    ["Sålerul", "Rul bolden på tværs med sålen, skift fod.", "Kontrol, bolden tæt.", null],
    ["Trommestikker", "Spil bolden mellem indersiderne.", "Små berøringer, bøjede knæ.", null],
    ["Step-over", "Før foden rundt om bolden uden at røre den. Skiftevis.", null, null]],
  let: [
    ["Toe-taps med kryds", "Tap bolden med højre fod. Træd til venstre for bolden, og tap med venstre fod bag om højre ben. Træd tilbage, og tap med venstre fod. Træd til højre for bolden, og tap med højre fod bag om venstre ben. Gentag.", null, null],
    ["Træk-skub", "Træk bolden tilbage med sålen, og skub den frem igen. Skift fod.", null, null],
    ["Yder-yder-stop", "Skub bolden to gange med ydersiden af foden, og stop den med indersiden. Skift fod.", null, null],
    ["Trommestikker + sålerul", "Lav 2 trommestikker, og rul bolden til siden med sålen. Lav 2 trommestikker igen, og rul bolden tilbage med sålen.", null, null]],
  mellem: [
    ["V-rul inderside", "Træk bolden skråt tilbage med sålen, og skub den skråt frem til den anden side med indersiden af samme fod. Gentag med det andet ben, så bolden bevæger sig fra side til side og tegner et V.", null, null],
    ["V-rul yderside", "Træk bolden skråt tilbage med sålen, og skub den skråt frem til den anden side med ydersiden af samme fod. Gentag med det andet ben, så bolden bevæger sig fra side til side og tegner et V.", null, null],
    ["L-rul", "Træk bolden tilbage med sålen, og spil den bag om standbenet med indersiden.", null, null],
    ["Square", "Før bolden rundt i et kvadrat med sålen (frem, til siden, tilbage, til siden). Skift fod.", null, null]],
  svaer: [
    ["E-rul", "Rul bolden med sålen, så den tegner et E mellem to kegler. Arbejd dig fra side til side mellem keglerne.", "Bolden tæt ved foden, også når du skifter retning.", "2 kegler"],
    ["L+V-rul", "Lav et L-rul og lige efter et V-rul (inderside) i ét flow, uden at sætte foden fra dig imellem. Skift fod.", null, null],
    ["Step-over + V-rul", "Lav et step-over, og skub bolden frem med den fod, der lavede step-over. Fortsæt direkte med et V-rul (inderside) med samme fod. Skift fod.", null, null],
    ["Croqueta", "Flyt bolden fra inderside til inderside med et lille sideskridt.", null, null]],
  grund: [
    ["Jongleringstræning", "Fri jonglering i 5 minutter. Saml bolden op og fortsæt, hver gang den rammer jorden.", "Dette er den daglige øvelse – ikke Jongleringsstigen. Her er der ingen trin at nå, og det gør ikke noget, at bolden falder. Det er forsøgene, der tæller.", null],
    ["Aflevering mod mur", "Spil almindelige indersideafleveringer mod muren, skiftevis med højre og venstre ben. Start med at tæmme bolden mellem hver aflevering. Øv dig derefter i at sætte tempoet op og i at spille direkte.", null, "mur"],
    ["Inderside med træk mod mur", "Spil en indersideaflevering mod muren. Når bolden kommer tilbage, trækker du den til siden med indersiden eller sålen og afleverer mod muren med det andet ben. Gentag til den anden side.", null, "mur"],
    ["8-tal mellem kegler", "Stil to kegler med 3 meters afstand. Dribl hurtigst muligt i et 8-tal mellem keglerne. Skift retning undervejs.", null, "2 kegler"]]
};

afsnit("Kataloget efter de nye regler");
const grupper = K.footworkGrupper(V2);
t("fem grupper i rækkefølgen Starter, Let, Mellem, Svær, Grundtræning", grupper.map(g=>g.navn), ["Starter","Let","Mellem","Svær","Grundtræning"]);
t("20 øvelser i alt", K.FOOTWORK.length, 20);
for(const g of grupper){
  const vent = BESTILT[g.noegle];
  t(`${g.navn}: øvelserne og deres rækkefølge`, g.oevelser.map(x=>x.navn), vent.map(v=>v[0]));
  g.oevelser.forEach((x, i)=>{
    const [navn, tekst, fokus, udstyr] = vent[i] || [];
    t(`${g.navn} · ${navn}: tekst, fokus og udstyr ordret`, [x.tekst, x.fokus || null, x.udstyr || null], [tekst, fokus, udstyr]);
  });
  t(`${g.navn}: ${K.FOOTWORK_KATEGORIER[g.noegle].point} point pr. gennemførelse`,
    g.oevelser.map(x=>K.footworkPointsPaa(x, V2)), g.oevelser.map(()=>K.FOOTWORK_KATEGORIER[g.noegle].point));
}
t("hver øvelse er med i visningen præcis én gang", K.FOOTWORK_VISNING.slice().sort().join(), K.FOOTWORK.map(x=>x.id).sort().join());
t("udstyr er markeret på de fire, der kræver det",
  K.FOOTWORK.filter(x=>x.udstyr).map(x=>x.navn + ": " + x.udstyr).sort(),
  ["8-tal mellem kegler: 2 kegler", "Aflevering mod mur: mur", "E-rul: 2 kegler", "Inderside med træk mod mur: mur"]);
t("E-rul nævner ingen afstand - den vises i videoen", /meter|cm|skridt/i.test(K.footworkEx("erul").tekst), false);

afsnit("Koderne");
t("alle koder er ét bogstav og entydige", [K.FOOTWORK.every(x=>/^[a-z]$/.test(x.kode)), new Set(K.FOOTWORK.map(x=>x.kode)).size], [true, 20]);
t("alle ids er entydige", new Set(K.FOOTWORK.map(x=>x.id)).size, 20);
t("de tolv gamle står først i listen og på samme plads som før - så gamle dage regnes ens",
  K.FOOTWORK.slice(0, 12).map(x=>x.kode).join(""), "tsdvpoyjlkcq");
t("de otte nye har deres egen kode", K.FOOTWORK.slice(12).map(x=>x.navn + "=" + x.kode),
  ["Toe-taps med kryds=x","Trommestikker + sålerul=r","V-rul inderside=i","E-rul=e","Step-over + V-rul=w","Aflevering mod mur=m","Inderside med træk mod mur=n","8-tal mellem kegler=g"]);

afsnit("De nye øvelser findes ikke på dage før skiftet");
const nye = K.FOOTWORK.slice(12);
t("ingen af de otte fandtes dagen før", nye.map(x=>K.footworkFindesPaa(x, GAMMEL)), nye.map(()=>false));
t("alle otte findes på skiftedagen", nye.map(x=>K.footworkFindesPaa(x, V2)), nye.map(()=>true));
t("de gives 0 point på en gammel dag", nye.map(x=>K.footworkPointsPaa(x, GAMMEL)), nye.map(()=>0));
t("og vises ikke i den gamle dags grupper", K.footworkGrupper(GAMMEL).flatMap(g=>g.oevelser).length, 12);
K.saetData([{id:"p", days:{[GAMMEL]: {e: 3, t: 1}}}], [], [], []);
t("står der alligevel et tal på en gammel dag, tæller det ikke", [K.footworkDayCounts("p", GAMMEL).reduce((a,b)=>a+b,0), K.footworkDayPoints("p", GAMMEL)], [1, 2]);
K.saetData([{id:"q", days:{[V2]: {e: 3, t: 1}}}], [], [], []);
t("på en ny dag tæller det: 3 × 5 + 2", K.footworkGrundpoint(K.footworkDayCounts("q", V2), V2), 17);

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
