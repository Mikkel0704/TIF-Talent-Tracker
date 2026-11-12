// Backuppen: hvad kommer med, og hvem faar hvad. Funktionen hentes ud af index.html.
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const a = html.indexOf("function backupPayload(){"), b = html.indexOf("function exportBackupJson(){");
if(a < 0 || b < 0) throw new Error("kunne ikke finde backupPayload");
const sti = new URL("./backupkode.mjs", import.meta.url);
writeFileSync(sti, `
let rolle = "admin";
export function saetRolle(r){ rolle = r; }
function isAdmin(){ return rolle === "admin"; }
function allowedYears(){ return ["2017"]; }
const currentUser = {email: "t@x.invalid"};
// En traener har kun sine egne aargange indlaest - men stigen, fodteknikken og
// klub-ranglisten laeses paa tvaers af klubben, saa de rummer ogsaa andres boern.
const users = [{uid:"u1", email:"a@x.invalid"}];
const players = [{id:"p1", name:"Egen spiller", year:"2017"}];
const playerNotes = [{id:"p1", note:"venstrebenet"}];
const submissions = [{id:"s1", playerId:"p1", status:"pending", videoURL:"https://eksempel.invalid/hemmeligt-link", videoPath:"submissions/p1/x.mp4"}];
const challenges = [{id:"c1"}];
const juggleLadder = [{id:"p1", mainStep:3}, {id:"fremmed", mainStep:9}];
const juggleLog = [{id:"p1", entries:[]}];
const footwork = [{id:"p1", days:{}}, {id:"fremmed", days:{}}];
const footworkLogs = [{id:"p1", reasons:{"2026-11-05":{tekst:"syg"}}}];
const clubRanking = [{id:"p1", name:"Egen spiller"}, {id:"fremmed", name:"Andet barn"}];
const clubModules = {talentmaerke:{"2014":false}};
const deletionRequests = [{id:"p1", reason:"flytter"}];
${html.slice(a, b)}
export { backupPayload };`);
const K = await import(sti.href);
let ok=0, fejl=0;
const t=(n,f,v)=>{const x=JSON.stringify(f),y=JSON.stringify(v);
  if(x===y){ok++;console.log("  ok   "+n);}else{fejl++;console.log("  FEJL "+n+"\n         fik: "+x+"  ventede: "+y);}};

console.log("\nBackup som admin");
K.saetRolle("admin");
let d = K.backupPayload();
t("alle samlinger er med", ["users","players","playerNotes","submissions","challenges","juggleLadder","juggleLog","footwork","footworkLog","clubRanking","clubModules","deletionRequests"].every(k=>k in d), true);
t("hele klubben, også andre årganges stige og fodteknik", [d.juggleLadder.length, d.footwork.length, d.clubRanking.length], [2,2,2]);
t("logins er med", d.users.length, 1);
t("joker-begrundelserne er med (og derfor skal filen passes på)", d.footworkLog[0].reasons["2026-11-05"].tekst, "syg");
t("indstillingerne er med", d.clubModules.talentmaerke["2014"], false);
t("videolinket er IKKE med", JSON.stringify(d).includes("hemmeligt-link"), false);
t("men indsendelsen er der stadig", [d.submissions.length, d.submissions[0].status], [1,"pending"]);
t("omfanget står i filen", d.omfang, "hele klubben");

console.log("\nBackup som træner");
K.saetRolle("coach");
d = K.backupPayload();
t("kun egne spillere på stigen", d.juggleLadder.map(x=>x.id), ["p1"]);
t("kun egne spillere i fodteknik", d.footwork.map(x=>x.id), ["p1"]);
t("kun egne spillere fra klub-ranglisten", d.clubRanking.map(x=>x.id), ["p1"]);
t("et fremmed barns navn står ingen steder i filen", JSON.stringify(d).includes("Andet barn"), false);
t("ingen logins", d.users, []);
t("ingen sletteanmodninger", d.deletionRequests, []);
t("omfanget står i filen", d.omfang, "årgange: 2017");
t("videolinket er heller ikke med her", JSON.stringify(d).includes("hemmeligt-link"), false);

console.log(`\n${ok} ok, ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
