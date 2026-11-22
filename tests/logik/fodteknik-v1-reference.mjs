// FROSSET REFERENCE - MAA IKKE AENDRES.
// Fodteknik-beregningen, PRAECIS som den koerte live foer de nye regler (commit 87c153b,
// index.html v15.67), skaaret ud med samme metode som udtraek.mjs. Migreringstesten regner
// tusindvis af dage med baade denne og den nye kode og kraever samme point for hver dag
// FOER skiftedatoen. Det er beviset paa, at ingen mister eller faar point bagud.
export let footwork = [];
export let footworkLogs = [];
export let juggleLadder = [];
export let juggleLog = [];
export function saetData(f, fl, jl, jlog){ footwork = f || []; footworkLogs = fl || []; juggleLadder = jl || []; juggleLog = jlog || []; }
const db = null, players = [], currentUser = null, currentPlayerLink = null, currentUserDoc = null;
function setDoc(){ throw new Error("ikke i test"); }
function doc(){ throw new Error("ikke i test"); }
function serverTimestamp(){ return null; }
function deleteField(){ return "__DELETE__"; }
function normalizeYearValue(v){ return String(v); }
function isPlayer(){ return false; }
function isDemoUser(){ return false; }
function demoBlocked(){ return false; }
function canAccessPlayer(){ return true; }
function besked(){}
function spoerg(){ return false; }
function indtast(){ return null; }
function escapeHtml(s){ return String(s); }
function renderFootwork(){}
function juggleFor(pid){ return juggleLadder.find(x=>x.id===pid) || null; }
function juggleLogFor(pid){ const d = juggleLog.find(x=>x.id===pid); return Array.isArray(d?.entries) ? d.entries : []; }
// DAGLIG FODTEKNIK
// Modul nummer to uden medaljer: korte oevelser derhjemme, registreret paa tillid.
// Samme grundregel som Jongleringsstigen - der gemmes ALDRIG point. Der ligger kun
// registreringerne, og point regnes ud af dem, hver gang de vises. Det er praecis
// dét, der goer rettelser, sletninger og bagudregistrering gratis: der er intet
// lager at holde synkront, saa en rettelse ét sted kan ikke efterlade et forkert
// tal et andet.
//
// Dokumenterne er delt i to, af samme grund som stigen:
//   footwork/{pid}     - tal og status. Laeses af hele klubben, fordi klub-top-10
//                        gaar paa tvaers af aargange og skal vise SAMME total som
//                        aargangslisten. Her staar intet navn og intet bruger-id.
//   footworkLog/{pid}  - hvem rettede hvad hvornaar, og joker-aarsagen. Aargangs-
//                        begraenset som alt andet, fordi der staar tekst og uid'er.
const FOOTWORK_MAX_PER_DAY = 10;    // gennemfoerelser pr. oevelse pr. dag (teknisk vaern)
const FOOTWORK_BACKDATE_DAYS = 14;  // hvor langt familien selv maa registrere bagud
// Loft paa antal DAGE i dokumentet. Det er et vaern mod en loebsk klient, ikke en
// slettepolitik: gamle dage ryddes IKKE automatisk, for de baerer point og streaks, som
// ville forsvinde med dem. 1500 er over fire aars traening hver eneste dag - men rammer
// nogen det alligevel, skal de have en besked, de kan forstaa, frem for en afvist
// skrivning. Samme tal staar i firestore.rules.
const FOOTWORK_MAX_DAYS = 1500;
const FOOTWORK_GRADE_POINTS = {let:2, mellem:3, svaer:4};
const FOOTWORK_GRADE_NAMES = {let:"Let", mellem:"Mellem", svaer:"Svær"};
// Blokken er 3 x 30 sek. for de elleve gulvoevelser, hvor foden er paa bolden hele tiden.
// Jonglering er en anden slags arbejde - bolden ryger, man samler op, stiller sig til
// rette - saa 30 sekunder bliver mest opstilling. Den har derfor sin egen blok og sin
// egen takst (se "varighed" og "point" paa oevelsen), og begge dele staar paa selve
// raekken i stedet for som én faelles regel.
const FOOTWORK_DEFAULT_BLOCK = "3 × 30 sek.";
// kode: det ene bogstav, dagen gemmes under i databasen. Kortere noegler betyder et
// mindre dokument - og dokumentet her hentes af alle logins, hver gang appen aabnes.
const FOOTWORK = [
  {id:"toetaps",    kode:"t", navn:"Toe-taps",           grad:"let",    tekst:"Skiftevis tæer let på toppen af bolden.", fokus:"Let på fødderne, højt tempo."},
  {id:"saalerul",   kode:"s", navn:"Sålerul",            grad:"let",    tekst:"Rul bolden på tværs med sålen, skift fod.", fokus:"Kontrol, bolden tæt."},
  {id:"trommestik", kode:"d", navn:"Trommestikker",      grad:"let",    tekst:"Spil bolden mellem indersiderne.", fokus:"Små berøringer, bøjede knæ."},
  {id:"vrul",       kode:"v", navn:"V-rul",              grad:"mellem", tekst:"Træk bolden tilbage med sålen, og spil den frem med indersiden af samme fod. Skift fod."},
  {id:"traekskub",  kode:"p", navn:"Træk-skub",          grad:"mellem", tekst:"Træk bolden tilbage med sålen, og skub den frem igen. Skift fod."},
  {id:"stepover",   kode:"o", navn:"Step-over",          grad:"mellem", tekst:"Før foden rundt om bolden uden at røre den. Skiftevis."},
  {id:"yderstop",   kode:"y", navn:"Yder-yder-stop",     grad:"mellem", tekst:"Skub bolden to gange med ydersiden af foden, og stop den med indersiden. Skift fod."},
  {id:"jongler",    kode:"j", navn:"Jongleringstræning", grad:"mellem", point:8, varighed:"5 minutter", tekst:"Fri jonglering i 5 minutter. Saml bolden op og fortsæt, hver gang den rammer jorden.", fokus:"Dette er den daglige øvelse - ikke Jongleringsstigen. Her er der ingen trin at nå, og det gør ikke noget, at bolden falder. Det er forsøgene, der tæller."},
  {id:"lrul",       kode:"l", navn:"L-rul",              grad:"svaer",  tekst:"Træk bolden tilbage med sålen, og spil den bag om standbenet med indersiden."},
  {id:"vlrul",      kode:"k", navn:"V+L rul",            grad:"svaer",  tekst:"Lav et V-rul og lige efter et L-rul i ét flow, uden at sætte foden fra dig imellem. Skift fod."},
  {id:"croqueta",   kode:"c", navn:"Croqueta",           grad:"svaer",  tekst:"Flyt bolden fra inderside til inderside med et lille sideskridt."},
  {id:"square",     kode:"q", navn:"Square",             grad:"svaer",  tekst:"Før bolden rundt i et kvadrat med sålen (frem, til siden, tilbage, til siden). Skift fod."}
];
const FOOTWORK_RULES = [
  "1 gennemførelse = øvelsen lavet i den tid, der står på den. De elleve gulvøvelser tager 3 × 30 sekunder. Der registreres kun, at den er gennemført - ikke hvor godt.",
  "Jongleringstræning er den ene undtagelse: den er 5 minutter i træk, fordi bolden falder undervejs, og 30 sekunder mest ville blive til at samle op og stille sig til rette.",
  "Du må lave den samme øvelse flere gange om dagen, og så mange øvelser du vil.",
  "Point pr. gennemførelse: Let 2 · Mellem 3 · Svær 4 - og 8 for jongleringstræning, fordi den tager længere tid. Tallet står altid på øvelsen.",
  "Tre gennemførelser fra samme dag kan danne en kombi, der giver bonus. Hver gennemførelse kan kun være med i én kombi - men der er ingen grænse for, hvor mange kombier en dag kan give.",
  "Appen finder selv den opdeling, der giver dig flest point. Du skal ikke regne på det.",
  "En dag tæller som aktiv, hvis du har mindst én gennemførelse - eller har registreret et trin på Jongleringsstigen.",
  "Du kan registrere op til 14 dage tilbage. Ældre dage kan kun rettes af en træner.",
  "Træneren kan tage stikprøver til træning og rette, hvis tallene ikke holder."
];
const FOOTWORK_INDOOR = [
  "Brug en lettere bold eller en futsalbold (str. 3-4).",
  "Træn på bare fødder eller i indendørssko på et skridsikkert gulv - ikke i sokker.",
  "Fjern ting inden for 1 meter.",
  "Der er plads nok: ca. 2 × 2 meter er rigeligt til alle øvelserne."
];
// Kumulativ bonus: hver milepael udloeser sit eget tal. 7 dage giver altsaa 5+5+10.
// Et brud nulstiller, og bonusserne kan optjenes forfra - det er vanen, der belønnes.
const FOOTWORK_STREAK = [[3,5],[5,5],[7,10],[10,10],[15,15],[20,15],[25,20],[30,25],[40,30],[50,40],[75,50],[100,75],[125,100]];
const FOOTWORK_COMBO_TEXT = [
  "3 gange den samme øvelse: +2",
  "3 forskellige, mindst én let: +3",
  "Allround - 1 let + 1 mellem + 1 svær: +5",
  "3 forskellige, alle mellem eller svære: +5",
  "3 forskellige svære: +8",
  "2 ens + 1 anden giver ingen kombi."
];

function footworkEx(idEllerKode){
  return FOOTWORK.find(x=>x.id===idEllerKode) || FOOTWORK.find(x=>x.kode===idEllerKode) || null;
}
// En oevelse maa saette sin egen takst. Uden det ville jonglering give 3 point for 5
// minutter, mens en let gulvoevelse giver 2 for halvandet - og boern regner den slags ud.
function footworkPointsFor(ex){ return Number.isInteger(ex?.point) ? ex.point : (FOOTWORK_GRADE_POINTS[ex?.grad] || 0); }
// NB: hedder ikke det samme som traenerens footworkKort i renderTracking. De to
// kolliderede, og en lokal const ville skygge for den her funktion inde i den
// funktion - det gaar godt, lige indtil nogen vil vise varigheden i traenervisningen.
function footworkBlock(ex){ return ex?.varighed || FOOTWORK_DEFAULT_BLOCK; }

// Dansk kalenderdag. Datoer er noegler i databasen, saa de skal skrives ud fra den
// LOKALE dag - ikke toISOString(), som ville flytte en aftentraening til dagen efter.
function dagsISO(d){
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
}
function iDagISO(){ return dagsISO(new Date()); }
function isoPlus(iso, n){
  const [y,m,d] = String(iso).split("-").map(Number);
  const x = new Date(y, m-1, d);
  x.setDate(x.getDate() + n);
  return dagsISO(x);
}
function isoDage(a, b){ // hele dage fra a til b; UTC bruges her netop for at undgaa sommertid
  const pa = String(a).split("-").map(Number), pb = String(b).split("-").map(Number);
  return Math.round((Date.UTC(pb[0],pb[1]-1,pb[2]) - Date.UTC(pa[0],pa[1]-1,pa[2])) / 86400000);
}
function datoTekst(iso){
  const [y,m,d] = String(iso).split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("da-DK", {weekday:"short", day:"numeric", month:"short"});
}

// --- Kombi-boost ----------------------------------------------------------
// Kun to slags tripler giver noget: tre gange SAMME oevelse, eller tre FORSKELLIGE.
// "2 ens + 1 anden" giver nul, praecis som i reglerne.
function footworkBoost(i, j, k){
  const a = FOOTWORK[i], b = FOOTWORK[j], c = FOOTWORK[k];
  if(!a || !b || !c) return 0;
  if(i === j && j === k) return 2;
  if(i === j || j === k || i === k) return 0;
  const grader = [a.grad, b.grad, c.grad];
  const lette  = grader.filter(g=>g === "let").length;
  const mellem = grader.filter(g=>g === "mellem").length;
  const svaere = grader.filter(g=>g === "svaer").length;
  if(lette === 1 && mellem === 1 && svaere === 1) return 5;  // allround
  if(lette > 0) return 3;
  if(svaere === 3) return 8;
  return 5;                                                  // 3 forskellige, alle mellem/svaer
}
function footworkBoostNavn(i, j, k){
  const b = footworkBoost(i, j, k);
  if(b === 2) return "3 × " + FOOTWORK[i].navn;
  if(b === 8) return "3 forskellige svære";
  if(b === 5){
    const grader = [FOOTWORK[i].grad, FOOTWORK[j].grad, FOOTWORK[k].grad];
    return grader.includes("let") ? "Allround" : "Mellem/svær";
  }
  return "3 forskellige";
}

// Den opdeling, der giver den HOEJESTE samlede bonus - ikke den foerste, der ser god ud.
// Graadig udvaelgelse er beviseligt forkert her: med Toe-taps×2, V-rul×2, L-rul,
// Croqueta og Square tager graadig de tre svaere (+8), og de fire resterende kan ikke
// danne en kombi. To allround-kombier giver 10. Derfor udtoemmende soegning med huskeliste.
const footworkComboMemo = new Map();
const FOOTWORK_SOEGE_BUDGET = 30000;   // tilstande, se footworkDayCombos
function footworkSolve(counts, budget){
  const key = counts.join(",");
  const husket = footworkComboMemo.get(key);
  if(husket) return husket;
  const i = counts.findIndex(c=>c > 0);
  if(i < 0) return {boost:0, kombier:[]};
  if(budget.n-- <= 0) return null;   // naedbremse, se footworkDayCombos

  // Mulighed 1: lad en gennemfoerelse af i staa uden for enhver kombi.
  const uden = counts.slice(); uden[i]--;
  const udenRest = footworkSolve(uden, budget);
  if(!udenRest) return null;
  let bedst = {boost: udenRest.boost, kombier: udenRest.kombier};

  // Mulighed 2: byg en kombi, der indeholder i. j,k >= i, saa hver triple ses én gang.
  for(let j = i; j < counts.length; j++){
    for(let k = j; k < counts.length; k++){
      const b = footworkBoost(i, j, k);
      if(b === 0) continue;
      const c2 = counts.slice();
      c2[i]--; c2[j]--; c2[k]--;
      if(c2[i] < 0 || c2[j] < 0 || c2[k] < 0) continue;
      const rest = footworkSolve(c2, budget);
      if(!rest) return null;
      if(b + rest.boost > bedst.boost) bedst = {boost: b + rest.boost, kombier: [[i,j,k], ...rest.kombier]};
    }
  }
  if(footworkComboMemo.size > 40000) footworkComboMemo.clear();
  footworkComboMemo.set(key, bedst);
  return bedst;
}

// Naedloesningen. Den skal to ting: altid give et gyldigt svar, og vaere hurtig.
// Den tager den bedst betalte kombi, der kan dannes lige nu, igen og igen. Det er
// beviseligt ikke altid optimalt - se eksemplet ved footworkSolve - men forskellen er
// smaa point paa en dag med 30+ gennemfoerelser, og alternativet var at give nul.
function footworkGreedy(counts){
  const rest = counts.slice();
  const kombier = [];
  let boost = 0;
  for(;;){
    let bedst = null;
    for(let i = 0; i < rest.length; i++){
      if(!rest[i]) continue;
      for(let j = i; j < rest.length; j++){
        for(let k = j; k < rest.length; k++){
          const b = footworkBoost(i, j, k);
          if(!b || (bedst && b <= bedst.b)) continue;
          const c2 = rest.slice();
          c2[i]--; c2[j]--; c2[k]--;
          if(c2[i] < 0 || c2[j] < 0 || c2[k] < 0) continue;
          bedst = {b, i, j, k};
        }
      }
    }
    if(!bedst) break;
    rest[bedst.i]--; rest[bedst.j]--; rest[bedst.k]--;
    boost += bedst.b;
    kombier.push([bedst.i, bedst.j, bedst.k]);
  }
  return {boost, kombier};
}

function footworkDayCombos(counts){
  const i_alt = counts.reduce((a,b)=>a+b, 0);
  if(i_alt < 3) return {boost:0, kombier:[]};
  const noegle = "dag:" + counts.join(",");
  const husket = footworkComboMemo.get(noegle);
  if(husket) return husket;

  // Den udtoemmende soegning er eksponentiel i antallet af oevelser, saa den faar et
  // budget. Det er ikke teoretisk: 12 oevelser lavet 3 gange hver er 36 gennemfoerelser
  // - en lang, men mulig dag - og uden bremsen brugte den flere sekunder OG endte med
  // at give nul. Den stod oven i koebet og regnede forfra ved hver eneste optegning,
  // fordi et afbrudt soeg ikke naaede at blive husket. Derfor: lavt budget, en
  // naedloesning der altid svarer, og et resultat der ALTID laegges i huskelisten.
  const svar = footworkSolve(counts, {n: FOOTWORK_SOEGE_BUDGET}) || footworkGreedy(counts);
  if(footworkComboMemo.size > 40000) footworkComboMemo.clear();
  footworkComboMemo.set(noegle, svar);
  return svar;
}

// --- Data -----------------------------------------------------------------
function footworkFor(pid){ return footwork.find(x=>x.id===pid) || null; }
function footworkLogFor(pid){ const d = footworkLogs.find(x=>x.id===pid); return Array.isArray(d?.entries) ? d.entries : []; }
function footworkReasons(pid){ const d = footworkLogs.find(x=>x.id===pid); return (d?.reasons && typeof d.reasons === "object") ? d.reasons : {}; }
function footworkDays(pid){
  const d = footworkFor(pid)?.days;
  return (d && typeof d === "object") ? Object.keys(d).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort() : [];
}
// Tallene kommer fra et spillerlogin, saa de klippes her. Uden det kunne en haandskrevet
// vaerdi give point i det uendelige - nu er loftet det samme som i brugerfladen.
function footworkCount(pid, dato, kode){
  const n = footworkFor(pid)?.days?.[dato]?.[kode];
  return Number.isInteger(n) && n > 0 ? Math.min(n, FOOTWORK_MAX_PER_DAY) : 0;
}
function footworkDayCounts(pid, dato){ return FOOTWORK.map(ex=>footworkCount(pid, dato, ex.kode)); }

// Hele historikken samlet pr. oevelse: hvor mange gange i alt, og hvornaar sidst.
// Traeneren kunne foer kun se de seneste ti dage, og saa er spoergsmaalet "har hun
// nogensinde lavet Croqueta?" et spoergsmaal, man skal blade sig til - og efter ti dage
// kan man slet ikke faa svaret. Det er netop dét, en traener vil vide: hvad springes over.
function footworkTotals(pid){
  const pr = FOOTWORK.map(()=>({antal:0, sidst:null}));
  footworkDays(pid).forEach(dato=>{
    FOOTWORK.forEach((ex, i)=>{
      const n = footworkCount(pid, dato, ex.kode);
      if(!n) return;
      pr[i].antal += n;
      if(!pr[i].sidst || dato > pr[i].sidst) pr[i].sidst = dato;
    });
  });
  return pr;
}
// Fordelingen paa svaerhedsgrad - det ene tal, der hurtigst viser, om barnet kun tager
// de nemme. Regnet paa GENNEMFOERELSER, ikke paa antal oevelser.
function footworkGradeSplit(pid){
  const totals = footworkTotals(pid);
  const pr = {let:0, mellem:0, svaer:0};
  FOOTWORK.forEach((ex, i)=>{ pr[ex.grad] += totals[i].antal; });
  const i_alt = pr.let + pr.mellem + pr.svaer;
  return {i_alt, pct: i_alt ? {
    let: Math.round(100*pr.let/i_alt), mellem: Math.round(100*pr.mellem/i_alt), svaer: Math.round(100*pr.svaer/i_alt)
  } : null};
}

// Joker: familien ANMODER (jokerRequests), traeneren AFGOER (jokers). De to felter er
// adskilt, fordi reglerne ikke kan se ned i et kort - men de kan se, hvilke FELTER en
// skrivning roerer. Derfor kan et spillerlogin skrive en anmodning og aldrig en afgoerelse.
function footworkJokerStatus(pid, dato){
  const f = footworkFor(pid);
  const afgjort = f?.jokers?.[dato];
  if(afgjort === "approved" || afgjort === "rejected") return afgjort;
  return f?.jokerRequests?.[dato] ? "pending" : null;
}
function footworkJokerDays(pid){
  const f = footworkFor(pid);
  const alle = new Set([...Object.keys(f?.jokers || {}), ...Object.keys(f?.jokerRequests || {})]);
  return [...alle].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
}

// En godkendt joker nulstiller dagen helt: den er hverken aktiv eller et brud, og den
// giver ingen point. Det er hele aftalen - jokeren er til de dage, hvor man IKKE naaede det.
function footworkDayPoints(pid, dato){
  if(footworkJokerStatus(pid, dato) === "approved") return 0;
  const counts = footworkDayCounts(pid, dato);
  return counts.reduce((sum, c, i)=>sum + c * footworkPointsFor(FOOTWORK[i]), 0) + footworkDayCombos(counts).boost;
}
function footworkActiveDays(pid){
  return footworkDays(pid).filter(d=>footworkJokerStatus(pid, d) !== "approved" && footworkDayCounts(pid, d).some(c=>c > 0));
}
// Stigen taeller ogsaa som aktiv dag. De klub-laesbare datoer ligger paa stige-
// dokumentet; loggen laegges oveni, saa spillerens EGEN visning ogsaa daekker de
// registreringer, der blev lavet foer datolisten fandtes.
function juggleActiveDays(pid){
  const liste = juggleFor(pid)?.days;
  const set = new Set(Array.isArray(liste) ? liste.filter(x=>typeof x === "string") : []);
  juggleLogFor(pid).forEach(e=>{ if(e?.at && e.t !== "correct") set.add(dagsISO(new Date(e.at))); });
  return [...set];
}

// --- Streak ---------------------------------------------------------------
// Et forloeb = paa hinanden foelgende kalenderdage, hvor hver dag er aktiv eller
// daekket af en joker. Jokerdagen bygger bro, men taeller ikke med i laengden.
// taelPending: en ubehandlet joker bygger bro i VISNINGEN, men ikke naar point
// regnes ud - ellers kunne barnet se point forsvinde igen, hvis traeneren afviser.
// Huskeliste for det, der er dyrt at regne ud. Point er afledte og bliver ved med at
// vaere det - der gemmes stadig intet i databasen. Men én optegning spurgte om samme
// spillers point mange gange (ranglisten regnede dem endda ud paa ny ved hver eneste
// sammenligning i sorteringen), og hver gang blev hele historikken regnet igennem.
// Maalt med 24 spillere og et aars historik: ca. 320 ms pr. optegning, og en optegning
// udloeses, hver gang NOGEN i klubben registrerer noget.
//
// footworkStamp haeves, hver gang de data, pointene afhaenger af, aendrer sig (se
// lytterne i startListeners). Saa laenge stemplet er det samme, er svaret det samme.
// Datoen er med i noeglen, fordi en streak kan doe ved midnat uden at data roerer sig.
let footworkStamp = 0;
const footworkCache = new Map();
function footworkHusk(pid, hvad, beregn){
  const dag = iDagISO(), noegle = pid + "|" + hvad;
  const h = footworkCache.get(noegle);
  if(h && h.stamp === footworkStamp && h.dag === dag) return h.vaerdi;
  const vaerdi = beregn();
  if(footworkCache.size > 5000) footworkCache.clear();
  footworkCache.set(noegle, {stamp: footworkStamp, dag, vaerdi});
  return vaerdi;
}
function footworkRuns(pid, taelPending){
  return footworkHusk(pid, taelPending ? "runs+" : "runs", ()=>footworkRunsBeregn(pid, taelPending));
}
function footworkRunsBeregn(pid, taelPending){
  const aktive = new Set([...footworkActiveDays(pid), ...juggleActiveDays(pid)]);
  if(!aktive.size) return [];
  const bro = new Set();
  footworkJokerDays(pid).forEach(d=>{
    const s = footworkJokerStatus(pid, d);
    if(s === "approved" || (taelPending && s === "pending")) bro.add(d);
  });
  const alle = [...new Set([...aktive, ...bro])].sort();
  const runs = [];
  let nu = null;
  for(const dato of alle){
    if(nu && isoDage(nu.sidste, dato) === 1) nu.sidste = dato;
    else { nu = {foerste: dato, sidste: dato, dage: []}; runs.push(nu); }
    if(aktive.has(dato)) nu.dage.push(dato);
  }
  // Et forloeb uden en enkelt aktiv dag er bare en joker i tomt rum - ikke en streak.
  return runs.filter(r=>r.dage.length).map(r=>({
    foerste: r.foerste, sidste: r.sidste, dage: r.dage,
    laengde: r.dage.length, sidsteAktive: r.dage[r.dage.length-1]
  }));
}
function footworkStreakBonus(laengde){
  return FOOTWORK_STREAK.reduce((sum, [dage, point])=>laengde >= dage ? sum + point : sum, 0);
}
function footworkNextStreakBonus(laengde){ return FOOTWORK_STREAK.find(([dage])=>dage > laengde) || null; }
// Lever streaken? Sidste aktive dag - eller sidste jokerdag - skal vaere i dag eller
// i gaar. Ellers ville enhver streak se brudt ud hver morgen, foer man har naaet at traene.
function footworkCurrentStreak(pid){
  const medPending = footworkRuns(pid, true);
  if(!medPending.length) return {laengde:0, afventer:false, lever:false};
  const sidste = medPending[medPending.length-1];
  const iDag = iDagISO(), iGaar = isoPlus(iDag, -1);
  const lever = [sidste.sidsteAktive, sidste.sidste].some(d=>d === iDag || d === iGaar);
  if(!lever) return {laengde:0, afventer:false, lever:false, tidligere:sidste};
  const udenPending = footworkRuns(pid, false);
  const uden = udenPending[udenPending.length-1];
  return {
    laengde: sidste.laengde,
    lever: true,
    // Hviler laengden paa en joker, traeneren ikke har set paa endnu?
    afventer: !uden || uden.sidsteAktive !== sidste.sidsteAktive || uden.laengde < sidste.laengde,
    talt: uden && uden.sidsteAktive === sidste.sidsteAktive ? uden.laengde : 0
  };
}

// --- Point ----------------------------------------------------------------
// Ren funktion af registreringerne. Intet gemt tal, intet at holde synkront.
function footworkPoints(pid){
  return footworkHusk(pid, "point", ()=>{
    let sum = footworkDays(pid).reduce((s, d)=>s + footworkDayPoints(pid, d), 0);
    footworkRuns(pid, false).forEach(r=>{ sum += footworkStreakBonus(r.laengde); });
    return sum;
  });
}
// Uge/maaned: dagens point hoerer til dagen, og en streak-bonus hoerer til den dag,
// forloebet naaede milepaelen. Derfor flytter en bagudregistrering ogsaa bonussen
// til den rigtige uge af sig selv.
function footworkPointsInWindow(pid, since){
  const graense = dagsISO(since);
  let sum = footworkDays(pid).filter(d=>d >= graense).reduce((s, d)=>s + footworkDayPoints(pid, d), 0);
  footworkRuns(pid, false).forEach(r=>{
    r.dage.forEach((dato, i)=>{
      const milepael = FOOTWORK_STREAK.find(([dage])=>dage === i + 1);
      if(milepael && dato >= graense) sum += milepael[1];
    });
  });
  return sum;
}

// --- Skrivning ------------------------------------------------------------
async function writeFootwork(pid, p, patch, logEntry, reasonPatch){
  await setDoc(doc(db, "footwork", pid), Object.assign({
    year: normalizeYearValue(p.year), gender: p.gender || null, updatedAt: serverTimestamp()
  }, patch), {merge:true});
  if(logEntry || reasonPatch){
    const tidligere = footworkLogFor(pid);
    const log = {
      year: normalizeYearValue(p.year), gender: p.gender || null, updatedAt: serverTimestamp()
    };
    if(logEntry) log.entries = [logEntry, ...tidligere].slice(0, 300);
    if(reasonPatch) log.reasons = reasonPatch;
    await setDoc(doc(db, "footworkLog", pid), log, {merge:true});
  }
}

// Familien taeller op og ned paa den valgte dag. Ingen video, ingen godkendelse.
async function registerFootwork(kode, delta){
  if(!isPlayer() || !currentPlayerLink) return besked("Kun spilleren selv kan registrere fodteknik.");
  if(demoBlocked("Gennemførelsen bliver ikke registreret herfra.")) return;
  const ex = footworkEx(kode); if(!ex) return;
  const p = currentPlayerLink, pid = p.id, dato = footworkSelectedDay();
  if(!footworkDayOpenForPlayer(dato)) return besked(`Dagen er låst.\n\nI kan selv registrere op til ${FOOTWORK_BACKDATE_DAYS} dage tilbage. Ældre dage kan en træner rette.`);
  if(footworkJokerStatus(pid, dato) === "approved") return besked("Dagen er dækket af en godkendt joker, så den giver ingen point.\n\nVil I registrere træning på dagen, skal træneren først fjerne jokeren.");
  const nu = footworkCount(pid, dato, ex.kode);
  if(delta > 0 && !nu && footworkDays(pid).length >= FOOTWORK_MAX_DAYS){
    return besked(`Der er registreret ${FOOTWORK_MAX_DAYS} dage, og det er så langt, ét dokument må fylde.\n\nIngen point går tabt - men der kan ikke komme flere dage på. Skriv til mikkel0704@hotmail.com, så bliver der gjort plads.`);
  }
  const ny = Math.max(0, Math.min(FOOTWORK_MAX_PER_DAY, nu + delta));
  if(ny === nu){
    if(delta > 0) besked(`Der er plads til højst ${FOOTWORK_MAX_PER_DAY} gennemførelser af den samme øvelse på én dag.`);
    return;
  }
  try{
    await writeFootwork(pid, p, {days: {[dato]: footworkDayPatch(pid, dato, ex.kode, ny)}},
      {d: dato, e: ex.id, fra: nu, til: ny, at: new Date().toISOString(), by: currentUser?.uid || ""});
  }catch(e){
    console.error(e);
    besked("Kunne ikke registrere: " + (e.message || "ukendt fejl"));
  }
}
// Et felt, der skal VAEK, kan ikke bare udelades: {merge:true} fletter kort sammen, saa
// den gamle vaerdi ville blive staaende. Derfor deleteField() - og hele dagen ryger,
// naar den sidste oevelse fjernes, saa der ikke samler sig tomme datoer i dokumentet.
function footworkDayPatch(pid, dato, kode, ny){
  if(ny > 0) return {[kode]: ny};
  const andre = FOOTWORK.some(ex=>ex.kode !== kode && footworkCount(pid, dato, ex.kode) > 0);
  return andre ? {[kode]: deleteField()} : deleteField();
}

async function requestFootworkJoker(){
  if(!isPlayer() || !currentPlayerLink) return;
  if(demoBlocked("Jokeren bliver ikke sendt herfra.")) return;
  const p = currentPlayerLink, pid = p.id, dato = footworkSelectedDay();
  if(footworkJokerStatus(pid, dato)) return besked("Der er allerede en joker på den dag.");
  if(!footworkDayOpenForPlayer(dato)) return besked(`I kan søge joker op til ${FOOTWORK_BACKDATE_DAYS} dage tilbage.`);
  // Hjaelpeteksten staar under selve feltet, hvor den bliver laest - ikke kun i broedteksten.
  // Graensen paa 200 tegn haandhaeves af feltet, saa ingen skriver en lang forklaring og
  // derefter faar den afvist.
  const aarsag = (await indtast(
    `Søg joker for ${datoTekst(dato)}.\n\n`
    + `Jokeren betyder, at streaken ikke bliver brudt. Dagen giver ingen point og tæller ikke som en aktiv dag.\n\n`
    + `Skriv kort hvorfor:`,
    {flerlinjet: true, maks: 200, pladsholder: "Fx: syg",
     hjaelp: 'Hold det kort, og skriv ikke helbredsdetaljer - "syg" er nok.', ja: "Send til træneren"}) || "").trim();
  if(!aarsag) return;
  if(aarsag.length > 200) return besked("Hold det under 200 tegn.");
  try{
    await writeFootwork(pid, p, {jokerRequests: {[dato]: true}},
      {d: dato, e: "joker", til: "søgt", at: new Date().toISOString(), by: currentUser?.uid || ""},
      {[dato]: {tekst: aarsag, at: new Date().toISOString(), by: currentUser?.uid || ""}});
    besked("Jokeren er sendt til træneren. Streaken er ikke brudt, mens I venter.");
  }catch(e){ console.error(e); besked("Kunne ikke sende jokeren: " + (e.message || "ukendt fejl")); }
}
async function cancelFootworkJoker(){
  if(!isPlayer() || !currentPlayerLink) return;
  if(demoBlocked("Der sker ikke noget herfra.")) return;
  const p = currentPlayerLink, pid = p.id, dato = footworkSelectedDay();
  if(footworkJokerStatus(pid, dato) !== "pending") return besked("Jokeren er allerede behandlet og kan kun ændres af en træner.");
  if(!await spoerg(`Træk jokeren for ${datoTekst(dato)} tilbage?`)) return;
  try{
    await writeFootwork(pid, p, {jokerRequests: {[dato]: deleteField()}},
      {d: dato, e: "joker", til: "trukket tilbage", at: new Date().toISOString(), by: currentUser?.uid || ""},
      {[dato]: deleteField()});
  }catch(e){ console.error(e); besked("Kunne ikke trække jokeren tilbage: " + (e.message || "ukendt fejl")); }
}

// Traenerens afgoerelse. Den ligger i Godkendelser ved siden af videoerne.
async function decideFootworkJoker(pid, dato, approve){
  if(isPlayer()) return besked("Kun trænere kan afgøre jokere.");
  const p = players.find(x=>x.id===pid);
  if(!p || !canAccessPlayer(p.year, p.gender)) return besked("Ingen adgang");
  const foer = footworkCurrentStreak(pid);
  if(!await spoerg(`${approve ? "Godkend" : "Afvis"} jokeren for ${p.name} den ${datoTekst(dato)}?\n\n`
    + (approve
      ? "Dagen bryder ikke streaken, men den tæller ikke som aktiv dag og giver ingen point."
      : "Dagen bliver en almindelig dag uden aktivitet, så streaken genberegnes - og kan blive brudt.")
    + `\n\nAfgørelsen bliver logget med dit navn.`)) return;
  try{
    await writeFootwork(pid, p, {jokers: {[dato]: approve ? "approved" : "rejected"}},
      {d: dato, e: "joker", til: approve ? "godkendt" : "afvist", at: new Date().toISOString(), by: currentUser?.uid || "", af: currentUser?.email || ""},
      {[dato]: {afgjort: approve ? "approved" : "rejected", afgjortAf: currentUser?.email || "", afgjortAt: new Date().toISOString()}});
    const efter = footworkCurrentStreak(pid);
    if(foer.laengde !== efter.laengde) console.log(`streak for ${p.name}: ${foer.laengde} → ${efter.laengde}`);
  }catch(e){ console.error(e); besked("Kunne ikke afgøre jokeren: " + (e.message || "ukendt fejl")); }
}
async function clearFootworkJoker(pid, dato){
  if(isPlayer()) return besked("Kun trænere kan fjerne jokere.");
  const p = players.find(x=>x.id===pid);
  if(!p || !canAccessPlayer(p.year, p.gender)) return besked("Ingen adgang");
  if(!await spoerg(`Fjern jokeren for ${p.name} den ${datoTekst(dato)} helt?\n\nDagen bliver en almindelig dag, og streaken genberegnes.`)) return;
  try{
    await writeFootwork(pid, p, {jokers: {[dato]: deleteField()}, jokerRequests: {[dato]: deleteField()}},
      {d: dato, e: "joker", til: "fjernet", at: new Date().toISOString(), by: currentUser?.uid || "", af: currentUser?.email || ""},
      {[dato]: deleteField()});
  }catch(e){ console.error(e); besked("Kunne ikke fjerne jokeren: " + (e.message || "ukendt fejl")); }
}

// Traenerens stikproeve: ret en enkelt oevelse paa en enkelt dag, eller nulstil dagen.
async function correctFootwork(pid, dato, kode){
  if(isPlayer()) return besked("Kun trænere kan rette registreringer.");
  const p = players.find(x=>x.id===pid);
  if(!p || !canAccessPlayer(p.year, p.gender)) return besked("Ingen adgang");
  const ex = footworkEx(kode); if(!ex) return;
  const nu = footworkCount(pid, dato, ex.kode);
  const svar = await indtast(`Ret ${p.name} · ${ex.navn} · ${datoTekst(dato)}.\n\nStår nu på ${nu} gennemførelser.\n\nSkriv det rigtige antal (0-${FOOTWORK_MAX_PER_DAY}):`, {vaerdi: String(nu), tal: true});
  if(svar === null) return;
  const ny = parseInt(svar, 10);
  if(!Number.isFinite(ny) || ny < 0 || ny > FOOTWORK_MAX_PER_DAY) return besked(`Skriv et tal mellem 0 og ${FOOTWORK_MAX_PER_DAY}.`);
  if(ny === nu) return;
  try{
    await writeFootwork(pid, p, {days: {[dato]: footworkDayPatch(pid, dato, ex.kode, ny)}},
      {d: dato, e: ex.id, fra: nu, til: ny, at: new Date().toISOString(), by: currentUser?.uid || "", af: currentUser?.email || ""});
  }catch(e){ console.error(e); besked("Kunne ikke rette: " + (e.message || "ukendt fejl")); }
}
// To trin, fordi en dag kan have flere oevelser: vaelg oevelsen, ret saa tallet.
async function correctFootworkDay(pid, dato){
  if(isPlayer()) return besked("Kun trænere kan rette registreringer.");
  const brugt = FOOTWORK.filter(ex=>footworkCount(pid, dato, ex.kode) > 0);
  if(!brugt.length) return besked("Der er ikke registreret noget den dag.");
  if(brugt.length === 1) return correctFootwork(pid, dato, brugt[0].kode);
  const svar = await indtast(`${datoTekst(dato)} - hvilken øvelse skal rettes?\n\n`
    + brugt.map((ex,i)=>`${i+1}. ${ex.navn} (${footworkCount(pid, dato, ex.kode)})`).join("\n")
    + `\n\nSkriv nummeret:`, {tal: true});
  if(svar === null) return;
  const valg = brugt[parseInt(svar, 10) - 1];
  if(!valg) return besked("Det var ikke et af numrene.");
  return correctFootwork(pid, dato, valg.kode);
}
async function resetFootworkDay(pid, dato){
  if(isPlayer()) return besked("Kun trænere kan nulstille en dag.");
  const p = players.find(x=>x.id===pid);
  if(!p || !canAccessPlayer(p.year, p.gender)) return besked("Ingen adgang");
  const counts = footworkDayCounts(pid, dato);
  const i_alt = counts.reduce((a,b)=>a+b, 0);
  if(!i_alt) return besked("Der er ikke registreret noget den dag.");
  if(!await spoerg(`Nulstil ${p.name}s fodteknik den ${datoTekst(dato)}?\n\n${i_alt} ${i_alt===1?"gennemførelse":"gennemførelser"} forsvinder. Dagen holder op med at tælle som aktiv, så streaken genberegnes - og kan blive brudt.\n\nRettelsen bliver logget med dit navn.`)) return;
  try{
    await writeFootwork(pid, p, {days: {[dato]: deleteField()}},
      {d: dato, e: "nulstil", fra: i_alt, til: 0, at: new Date().toISOString(), by: currentUser?.uid || "", af: currentUser?.email || ""});
  }catch(e){ console.error(e); besked("Kunne ikke nulstille: " + (e.message || "ukendt fejl")); }
}

// Joker-aarsagen er fritekst og kan strejfe helbred, selv med den bedste hjaelpetekst.
// Den slettes derfor 3 doegn efter, traeneren har afgjort jokeren. Dato og status
// bliver - de skal til for at regne streaken ud - men selve begrundelsen forsvinder.
const FOOTWORK_REASON_MAX_AGE_MS = 3*24*60*60*1000;
let lastFootworkReasonSweep = 0;
function sweepFootworkJokerReasons(){
  if(isPlayer()) return;
  if(!footworkLogs.length) return;
  const now = Date.now();
  if(now - lastFootworkReasonSweep < 5*60*1000) return;
  lastFootworkReasonSweep = now;
  footworkLogs.forEach(d=>{
    const p = players.find(x=>x.id===d.id);
    if(!p || !canAccessPlayer(p.year, p.gender)) return;
    const vaek = {};
    Object.entries(d.reasons || {}).forEach(([dato, r])=>{
      if(!r?.tekst || !r?.afgjortAt) return;
      if(now - new Date(r.afgjortAt).getTime() > FOOTWORK_REASON_MAX_AGE_MS) vaek[dato] = {tekst: deleteField()};
    });
    if(!Object.keys(vaek).length) return;
    setDoc(doc(db, "footworkLog", d.id), {reasons: vaek, updatedAt: serverTimestamp()}, {merge:true})
      .catch(e=>console.error("kunne ikke rydde joker-aarsager", e));
  });
}
function footworkPendingJokers(){
  const ude = [];
  footwork.forEach(f=>{
    const p = players.find(x=>x.id===f.id);
    if(!p || !canAccessPlayer(p.year, p.gender)) return;
    Object.keys(f.jokerRequests || {}).forEach(dato=>{
      if(footworkJokerStatus(f.id, dato) === "pending") ude.push({pid: f.id, navn: p.name, dato});
    });
  });
  return ude.sort((a,b)=>a.dato.localeCompare(b.dato));
}

// Valgt dag i brugerfladen. Familien maa selv raekke 14 dage tilbage - graensen er en
// spaerring i brugerfladen og KAN ikke haandhaeves i reglerne, som ikke kan regne paa
// datoer, der er noegler i et kort. Traenerens stikproeve er det reelle vaern, praecis
// som for resten af modulet.
let footworkDaySelected = null;
function footworkSelectedDay(){
  const iDag = iDagISO();
  if(!footworkDaySelected || !footworkDayOpenForPlayer(footworkDaySelected)) return iDag;
  return footworkDaySelected;
}
function footworkDayOpenForPlayer(dato){
  const afstand = isoDage(dato, iDagISO());
  return afstand >= 0 && afstand < FOOTWORK_BACKDATE_DAYS;
}
function setFootworkDay(dato){ footworkDaySelected = dato; renderFootwork(); }


export { FOOTWORK, footworkDayPoints, footworkPoints, footworkComboMemo, footworkCache };
